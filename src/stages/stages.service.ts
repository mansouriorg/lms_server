import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  canOpenCourse,
  canSeeCourse,
  CourseViewer,
  isSuperAdmin,
  visibleCoursesWhere,
} from '../common/course-access';
import {
  Actor,
  academyScope,
  assertManagesAcademy,
} from '../common/academy-scope';
import { CreateStageDto } from './dto/create-stage.dto';
import { UpdateStageDto } from './dto/update-stage.dto';

// GET /stages/students: one course a student bought, with their progress
export type EnrolledCourse = {
  id: string;
  title: string;
  status: string;
  // The academy of the course (a super admin sees every academy)
  academy: string | null;
  // When the student ordered it
  since: Date;
  totalLessons: number;
  completedLessons: number;
  percentage: number;
  lastActivityAt: Date | null;
};

// GET /stages/students: a student of the academy, and the courses they bought
export type AcademyStudent = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  since: Date;
  lastActivityAt: Date | null;
  courses: EnrolledCourse[];
};

@Injectable()
export class StagesService {
  constructor(private readonly prisma: PrismaService) {}

  // 1. Create a new Stage (Course), as a draft. Center admins: only for their
  // own academy, which is used when no academy is given. Super admins must
  // choose the academy. The instructor is the admin who creates the course,
  // unless another one is given.
  async create(dto: CreateStageDto, actor: Actor) {
    const scope = await academyScope(this.prisma, actor);
    const centerId = dto.centerId ?? scope.centerId;
    if (centerId === null || centerId === undefined || centerId === '') {
      throw new BadRequestException('Choose the academy of the course.');
    }
    await assertManagesAcademy(this.prisma, actor, centerId);
    const newStage = await this.prisma.stage.create({
      data: {
        title: dto.title,
        description: dto.description,
        price: dto.price,
        thumbnailUrl: dto.thumbnailUrl,
        category: dto.category,
        level: dto.level,
        projectBrief: dto.projectBrief ?? null,
        instructorId: dto.instructorId ?? actor.id,
        centerId,
        // status is automatically set to 'DRAFT' by Prisma
      },
    });

    return {
      message: 'Course created.',
      stage: newStage,
    };
  }

  // 2. The catalog (GET /stages). Students and visitors (viewer null) see the
  // published courses; a center admin also sees the draft and cancelled
  // courses of their own academy, a super admin every course (see
  // visibleCoursesWhere in common/course-access.ts).
  async findAll(viewer: CourseViewer | null) {
    return this.prisma.stage.findMany({
      where: await visibleCoursesWhere(this.prisma, viewer),
      orderBy: { createdAt: 'desc' }, // Order by newest courses first
      include: {
        center: {
          select: { name: true } // Identify which academy created it
        },
        _count: {
          // The number of modules; the number of orders only for super admins
          // (academy admins see theirs in GET /stages/manage)
          select: { modules: true, orderItems: isSuperAdmin(viewer) },
        }
      }
    });
  }

  // 3. Fetch a single Stage by its ID (For the Course Player)
  async findOne(id: string) {
    const stage = await this.prisma.stage.findUnique({
      where: { id },
      include: { 
        center: true,
        modules: {
          include: {
            // In the right order; for equal numbers, the oldest first (like
            // LessonsService.move and CourseModulesService.move)
            lessons: {
              orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
            },
            // How many quiz questions the module has (the course player
            // offers its quiz)
            _count: { select: { quizBank: true } },
          },
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        }
      }
    });

    if (!stage) {
      throw new NotFoundException('Course not found.');
    }

    return stage;
  }

  // 3d. The courses an admin manages (GET /stages/manage): every course of
  // their academy whatever its status (every course for a super admin),
  // newest first, with the number of modules and of paid enrollments.
  async findManaged(actor: Actor) {
    const scope = await academyScope(this.prisma, actor);
    return this.prisma.stage.findMany({
      where: scope.all ? {} : { centerId: scope.centerId },
      orderBy: { createdAt: 'desc' },
      include: {
        center: { select: { name: true } },
        _count: {
          select: {
            modules: true,
            orderItems: { where: { order: { status: 'PAID' } } },
          },
        },
      },
    });
  }

  // 3e. One course for its editor (GET /stages/:id/manage): every field, the
  // modules and lessons with their video links, and the paid enrollments.
  // Only for admins of its academy.
  async findOneManaged(id: string, actor: Actor) {
    const stage = await this.findOne(id);
    await assertManagesAcademy(this.prisma, actor, stage.centerId);
    const paid = await this.prisma.orderItem.count({
      where: { stageId: id, order: { status: 'PAID' } },
    });
    return {
      ...stage,
      _count: { modules: stage.modules.length, orderItems: paid },
    };
  }

  // 3e2. How far the students of a course got
  // (GET /stages/:id/lesson-progress): its modules and lessons in their
  // order, each lesson with how many of the students completed it, the
  // number of students and how many completed every lesson. The students:
  // the buyers of the course (paid orders) and the student accounts that
  // completed one of its lessons (a free course has no orders); an admin
  // trying a lesson does not count. Only for admins of its academy (403 for
  // the others).
  async lessonProgress(id: string, actor: Actor) {
    const stage = await this.prisma.stage.findUnique({
      where: { id },
      select: {
        centerId: true,
        modules: {
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            title: true,
            lessons: {
              orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
              select: { id: true, title: true, duration: true },
            },
          },
        },
      },
    });
    if (stage === null) {
      throw new NotFoundException('Course not found.');
    }
    await assertManagesAcademy(this.prisma, actor, stage.centerId);
    const sales = await this.prisma.orderItem.findMany({
      where: { stageId: id, order: { status: 'PAID' } },
      select: { order: { select: { userId: true } } },
    });
    const done = await this.prisma.progress.findMany({
      where: { lesson: { module: { stageId: id } } },
      select: {
        userId: true,
        lessonId: true,
        user: { select: { role: true } },
      },
    });

    const students = new Set(sales.map((sale) => sale.order.userId));
    for (const row of done) {
      if (row.user.role === 'STUDENT') students.add(row.userId);
    }
    // Lesson -> students who completed it; student -> lessons completed
    const byLesson = new Map<string, number>();
    const byStudent = new Map<string, number>();
    for (const row of done) {
      if (students.has(row.userId)) {
        byLesson.set(row.lessonId, (byLesson.get(row.lessonId) ?? 0) + 1);
        byStudent.set(row.userId, (byStudent.get(row.userId) ?? 0) + 1);
      }
    }
    const lessons = stage.modules.reduce(
      (total, courseModule) => total + courseModule.lessons.length,
      0,
    );
    // The students who completed every lesson (nobody, without lessons)
    const finished = [...byStudent.values()].filter(
      (count) => count >= lessons,
    ).length;
    return {
      students: students.size,
      finished,
      modules: stage.modules.map((courseModule) => ({
        id: courseModule.id,
        title: courseModule.title,
        lessons: courseModule.lessons.map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          duration: lesson.duration,
          completed: byLesson.get(lesson.id) ?? 0,
        })),
      })),
    };
  }

  // 3f. The students of the academy (GET /stages/students): everyone with a
  // PAID order for one of its courses (every course for a super admin), the
  // newest student first, with each course they bought (once, the first
  // order) and their progress in it. Only lessons of a course they bought
  // count. `lastActivityAt` is when they last completed a lesson.
  async findStudents(actor: Actor) {
    const scope = await academyScope(this.prisma, actor);
    const items = await this.prisma.orderItem.findMany({
      where: {
        order: { status: 'PAID' },
        stageId: { not: null },
        ...(scope.all ? {} : { stage: { centerId: scope.centerId } }),
      },
      orderBy: { createdAt: 'asc' },
      select: {
        createdAt: true,
        stage: {
          select: {
            id: true,
            title: true,
            status: true,
            center: { select: { name: true } },
          },
        },
        order: {
          select: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
      },
    });
    const enrollments = items.filter(
      (item) => item.stage !== null && item.order.user !== null,
    );
    if (enrollments.length === 0) {
      return [];
    }

    // The lessons of these courses, and what these students completed there
    const courseIds = [...new Set(enrollments.map((item) => item.stage.id))];
    const studentIds = [
      ...new Set(enrollments.map((item) => item.order.user.id)),
    ];
    const lessons = await this.prisma.lesson.findMany({
      where: { module: { stageId: { in: courseIds } } },
      select: { id: true, module: { select: { stageId: true } } },
    });
    const done = await this.prisma.progress.findMany({
      where: {
        userId: { in: studentIds },
        lesson: { module: { stageId: { in: courseIds } } },
      },
      select: { userId: true, lessonId: true, createdAt: true },
    });
    const courseOfLesson = new Map<string, string>();
    const lessonCount = new Map<string, number>();
    for (const lesson of lessons) {
      const courseId = lesson.module.stageId;
      courseOfLesson.set(lesson.id, courseId);
      lessonCount.set(courseId, (lessonCount.get(courseId) ?? 0) + 1);
    }
    // "student course" -> lessons completed, and when the last one was
    const progress = new Map<string, { completed: number; last: Date }>();
    for (const row of done) {
      const key = `${row.userId} ${courseOfLesson.get(row.lessonId)}`;
      const known = progress.get(key);
      progress.set(key, {
        completed: (known?.completed ?? 0) + 1,
        last:
          known === undefined || row.createdAt > known.last
            ? row.createdAt
            : known.last,
      });
    }

    const students = new Map<string, AcademyStudent>();
    for (const item of enrollments) {
      const user = item.order.user;
      const student: AcademyStudent = students.get(user.id) ?? {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        since: item.createdAt,
        lastActivityAt: null,
        courses: [],
      };
      students.set(user.id, student);
      if (student.courses.some((course) => course.id === item.stage.id)) {
        continue;
      }
      const total = lessonCount.get(item.stage.id) ?? 0;
      const mine = progress.get(`${user.id} ${item.stage.id}`);
      const completed = mine?.completed ?? 0;
      student.courses.push({
        id: item.stage.id,
        title: item.stage.title,
        status: item.stage.status,
        academy: item.stage.center?.name ?? null,
        since: item.createdAt,
        totalLessons: total,
        completedLessons: completed,
        percentage: total === 0 ? 0 : Math.round((completed / total) * 100),
        lastActivityAt: mine?.last ?? null,
      });
      if (
        mine !== undefined &&
        (student.lastActivityAt === null || mine.last > student.lastActivityAt)
      ) {
        student.lastActivityAt = mine.last;
      }
    }
    return [...students.values()].sort(
      (a, b) => b.since.getTime() - a.since.getTime(),
    );
  }

  // 3c. "My courses" (GET /stages/mine): the courses the student bought (a
  // PAID order), newest purchase first, each once, with their progress.
  // Draft and cancelled courses stay here: buyers keep access (`status` lets
  // the page say that the course is no longer offered).
  async findMine(userId: string) {
    const items = await this.prisma.orderItem.findMany({
      where: {
        order: { userId, status: 'PAID' },
        stageId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        stage: {
          select: {
            id: true,
            title: true,
            status: true,
            category: true,
            level: true,
            center: { select: { name: true } },
            modules: { select: { lessons: { select: { id: true } } } },
          },
        },
      },
    });
    const progress = await this.prisma.progress.findMany({
      where: { userId },
      select: { lessonId: true },
    });
    const completedIds = new Set(progress.map((done) => done.lessonId));

    const seen = new Set<string>();
    return items
      .map((item) => item.stage)
      .filter((stage) => {
        if (stage === null || stage === undefined || seen.has(stage.id)) {
          return false;
        }
        seen.add(stage.id);
        return true;
      })
      .map((stage) => {
        const lessonIds = stage.modules.flatMap((courseModule) =>
          courseModule.lessons.map((lesson) => lesson.id),
        );
        const completedLessons = lessonIds.filter((id) =>
          completedIds.has(id),
        ).length;
        return {
          id: stage.id,
          title: stage.title,
          status: stage.status,
          category: stage.category,
          level: stage.level,
          center: stage.center,
          totalLessons: lessonIds.length,
          completedLessons,
          percentage:
            lessonIds.length === 0
              ? 0
              : Math.round((completedLessons / lessonIds.length) * 100),
        };
      });
  }

  // 3b. The course page and player (GET /stages/:id). Everyone sees the
  // outline (modules and lesson titles); video links are only sent to viewers
  // who can open the course (see common/course-access.ts). Draft and
  // cancelled courses do not exist (404), except for the admins of their
  // academy and the students who bought them (canSeeCourse). Visitors who are
  // not signed in (viewer null) get the outline only.
  async findOneForViewer(id: string, viewer: CourseViewer | null) {
    const stage = await this.findOne(id);
    if ((await canSeeCourse(this.prisma, viewer, stage)) === false) {
      throw new NotFoundException('Course not found.');
    }

    if (await canOpenCourse(this.prisma, viewer, stage)) {
      return { ...stage, hasAccess: true };
    }

    return {
      ...stage,
      hasAccess: false,
      modules: stage.modules.map((courseModule) => ({
        ...courseModule,
        lessons: courseModule.lessons.map((lesson) => ({
          ...lesson,
          videoUrl: null,
        })),
      })),
    };
  }

  // 4. Update an existing Stage
  async update(id: string, dto: UpdateStageDto, actor: Actor) {
    const stage = await this.prisma.stage.findUnique({ where: { id } });
    if (!stage) {
      throw new NotFoundException('Course not found.');
    }

    // Center admins: only their own academy's courses, and no moving a
    // course to another academy.
    await assertManagesAcademy(this.prisma, actor, stage.centerId);
    if (dto.centerId) {
      await assertManagesAcademy(this.prisma, actor, dto.centerId);
    }

    // We no longer need date conversions, so we just pass the DTO directly
    const updatedStage = await this.prisma.stage.update({
      where: { id },
      data: dto,
    });

    return {
      message: 'Course updated.',
      stage: updatedStage,
    };
  }

  // 5. Delete a Stage
  async remove(id: string, actor: Actor) {
    const stage = await this.prisma.stage.findUnique({ where: { id } });
    if (!stage) {
      throw new NotFoundException('Course not found.');
    }

    // Center admins: only their own academy's courses
    await assertManagesAcademy(this.prisma, actor, stage.centerId);

    // A course that was ordered keeps its orders (and its buyers their
    // history): it can be cancelled, not deleted.
    const orderCount = await this.prisma.orderItem.count({
      where: { stageId: id },
    });
    if (orderCount > 0) {
      throw new ConflictException(
        'This course was ordered, so it cannot be deleted. Set its status to Cancelled instead.',
      );
    }

    await this.prisma.stage.delete({
      where: { id },
    });

    return { message: 'Course deleted.' };
  }
}