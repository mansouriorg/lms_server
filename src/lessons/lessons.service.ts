import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';

@Injectable()
export class LessonsService {
  constructor(private readonly prisma: PrismaService) {}

  // --- ADMIN METHODS (Managing the Curriculum) ---

  async create(dto: CreateLessonDto) {
    // Verify the Module actually exists (instead of Stage)
    const module = await this.prisma.module.findUnique({ where: { id: dto.moduleId } });
    if (!module) {
      throw new NotFoundException('Le module est introuvable.');
    }

    const lesson = await this.prisma.lesson.create({ data: dto });
    return { message: 'Leçon créée avec succès.', lesson };
  }

  async update(id: string, dto: UpdateLessonDto) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id } });
    if (!lesson) throw new NotFoundException('Leçon introuvable.');

    const updatedLesson = await this.prisma.lesson.update({
      where: { id },
      data: dto,
    });
    return { message: 'Leçon mise à jour.', lesson: updatedLesson };
  }

  async remove(id: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id } });
    if (!lesson) throw new NotFoundException('Leçon introuvable.');

    await this.prisma.lesson.delete({ where: { id } });
    return { message: 'Leçon supprimée avec succès.' };
  }

  // --- STUDENT METHODS (Learning & Progress) ---

  // Fetch all lessons for a specific module
  async findAllByModule(moduleId: string) {
    return this.prisma.lesson.findMany({
      where: { moduleId },
      orderBy: { order: 'asc' }, // Crucial: Ensures Lesson 1 comes before Lesson 2
    });
  }

  // The core e-learning feature: Tracking progress
  async markAsCompleted(userId: string, lessonId: string) {
    // 1. Check if the lesson exists
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Leçon introuvable.');

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
      throw new ConflictException('Vous avez déjà terminé cette leçon.');
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
      message: 'Félicitations ! Leçon terminée.', 
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
        message: "Ce cours n'a pas encore de leçons.",
      };
    }

    // 2. Count how many lessons THIS specific user has completed in THIS specific course
    const completedLessons = await this.prisma.progress.count({
      where: {
        userId: userId,
        lesson: {
          module: {
            stageId: stageId,
          }
        },
      },
    });

    // 3. Calculate the percentage and round it to a clean whole number
    const percentage = Math.round((completedLessons / totalLessons) * 100);

    return {
      total: totalLessons,
      completed: completedLessons,
      percentage: percentage,
      message: `Vous avez terminé ${percentage}% de ce cours.`,
    };
  }
}