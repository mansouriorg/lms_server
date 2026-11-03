import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertCanOpenCourse, CourseViewer } from '../common/course-access';
import { Actor, assertManagesAcademy } from '../common/academy-scope';
import { Direction, moveInOrder } from '../common/reorder';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';

@Injectable()
export class LessonsService {
  constructor(private readonly prisma: PrismaService) {}

  // --- ADMIN METHODS (Managing the Curriculum) ---

  // Center admins may only change lessons of their own academy's courses.
  private async assertManagesModule(actor: Actor, moduleId: string) {
    const courseModule = await this.prisma.module.findUnique({
      where: { id: moduleId },
      select: { stage: { select: { centerId: true } } },
    });
    if (courseModule === null) {
      throw new NotFoundException('Module not found.');
    }
    await assertManagesAcademy(this.prisma, actor, courseModule.stage.centerId);
  }

  async create(dto: CreateLessonDto, actor: Actor) {
    // Verify the Module exists and belongs to the admin's academy
    await this.assertManagesModule(actor, dto.moduleId);

    // Without a number, the lesson goes after the last one of its module
    const order = dto.order ?? (await this.nextLessonOrder(dto.moduleId));
    const lesson = await this.prisma.lesson.create({
      data: { ...dto, order },
    });
    return { message: 'Lesson created.', lesson };
  }

  async update(id: string, dto: UpdateLessonDto, actor: Actor) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id } });
    if (!lesson) throw new NotFoundException('Lesson not found.');

    // Own academy only, and no moving the lesson into another academy's course
    await this.assertManagesModule(actor, lesson.moduleId);
    if (dto.moduleId) {
      await this.assertManagesModule(actor, dto.moduleId);
    }

    const updatedLesson = await this.prisma.lesson.update({
      where: { id },
      data: dto,
    });
    return { message: 'Lesson updated.', lesson: updatedLesson };
  }

  async remove(id: string, actor: Actor) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id } });
    if (!lesson) throw new NotFoundException('Lesson not found.');
    await this.assertManagesModule(actor, lesson.moduleId);

    await this.prisma.lesson.delete({ where: { id } });
    return { message: 'Lesson deleted.' };
  }

  // The number of a new lesson: after the last lesson of the module.
  private async nextLessonOrder(moduleId: string): Promise<number> {
    const last = await this.prisma.lesson.aggregate({
      where: { moduleId },
      _max: { order: true },
    });
    return (last._max.order ?? 0) + 1;
  }

  // POST /lessons/:id/move: one place up or down inside its module. The
  // lessons of the module are then numbered 1, 2, 3... in one transaction
  // (this also repairs equal or missing numbers).
  async move(id: string, direction: Direction, actor: Actor) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id } });
    if (lesson === null) throw new NotFoundException('Lesson not found.');
    await this.assertManagesModule(actor, lesson.moduleId);

    const siblings = await this.prisma.lesson.findMany({
      where: { moduleId: lesson.moduleId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    const current = siblings.map((sibling) => sibling.id);
    const ids = moveInOrder(current, id, direction);
    if (ids === null) {
      return { message: 'The lesson is already there.', order: current };
    }
    await this.prisma.$transaction(
      ids.map((lessonId, index) =>
        this.prisma.lesson.update({
          where: { id: lessonId },
          data: { order: index + 1 },
        }),
      ),
    );
    return { message: 'Lesson moved.', order: ids };
  }

  // --- STUDENT METHODS (Learning & Progress) ---

  // Fetch all lessons for a specific module. Lessons carry the video links,
  // so only viewers who can open the course get them.
  async findAllByModule(moduleId: string, viewer: CourseViewer) {
    const courseModule = await this.prisma.module.findUnique({
      where: { id: moduleId },
      select: {
        stage: {
          select: { id: true, centerId: true, price: true, status: true },
        },
      },
    });
    if (courseModule === null) {
      throw new NotFoundException('Module not found.');
    }
    await assertCanOpenCourse(this.prisma, viewer, courseModule.stage);

    return this.prisma.lesson.findMany({
      where: { moduleId },
      orderBy: { order: 'asc' }, // Crucial: Ensures Lesson 1 comes before Lesson 2
    });
  }

  // The core e-learning feature: Tracking progress
  async markAsCompleted(viewer: CourseViewer, lessonId: string) {
    const userId = viewer.id;

    // 1. Check that the lesson exists and that the viewer can open its course
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        module: {
          select: {
            stage: {
              select: { id: true, centerId: true, price: true, status: true },
            },
          },
        },
      },
    });
    if (lesson === null) {
      throw new NotFoundException('Lesson not found.');
    }
    await assertCanOpenCourse(this.prisma, viewer, lesson.module.stage);

    // 2. Check if the student already completed this lesson
    const existingProgress = await this.prisma.progress.findUnique({
      where: {
        userId_lessonId: {
          userId: userId,
          lessonId: lessonId,
        },
      },
    });

    if (existingProgress) {
      throw new ConflictException('You have already completed this lesson.');
    }

    // 3. Record the progress
    const progress = await this.prisma.progress.create({
      data: {
        userId: userId,
        lessonId: lessonId,
        completed: true,
      },
    });

    return { 
      message: 'Well done, lesson completed.', 
      progress 
    };
  }

  // --- Calculate Overall Course Progress ---
  async getStageProgress(userId: string, stageId: string) {
    // 1. Count the total number of lessons in this specific course (Stage)
    // Prisma elegantly navigates the relation: Stage -> Module -> Lesson
    const totalLessons = await this.prisma.lesson.count({
      where: { 
        module: {
          stageId: stageId
        }
      },
    });

    if (totalLessons === 0) {
      return {
        total: 0,
        completed: 0,
        percentage: 0,
        completedLessonIds: [],
        message: "This course has no lessons yet.",
      };
    }

    // 2. The lessons of THIS course that THIS user has completed (the course
    // player shows a check mark next to each of them)
    const completedProgress = await this.prisma.progress.findMany({
      where: {
        userId: userId,
        lesson: {
          module: {
            stageId: stageId,
          }
        },
      },
      select: { lessonId: true },
    });
    const completedLessons = completedProgress.length;

    // 3. Calculate the percentage and round it to a clean whole number
    const percentage = Math.round((completedLessons / totalLessons) * 100);

    return {
      total: totalLessons,
      completed: completedLessons,
      percentage: percentage,
      completedLessonIds: completedProgress.map((done) => done.lessonId),
      message: `You have completed ${percentage}% of this course.`,
    };
  }
}