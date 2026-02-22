// src/questions/questions.service.ts
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { CreateReplyDto } from './dto/create-reply.dto';

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  // --- QUESTIONS ---

  async askQuestion(userId: string, dto: CreateQuestionDto) {
    // Verify the lesson exists
    const lesson = await this.prisma.lesson.findUnique({ where: { id: dto.lessonId } });
    if (!lesson) throw new NotFoundException('Leçon introuvable.');

    const question = await this.prisma.question.create({
      data: {
        userId: userId,
        lessonId: dto.lessonId,
        title: dto.title,
        body: dto.body,
      },
    });

    return { message: 'Question posée avec succès.', question };
  }

  // Fetch all questions for a specific lesson, including the replies and the user's name
  async getQuestionsByLesson(lessonId: string) {
    return this.prisma.question.findMany({
      where: { lessonId: lessonId },
      include: {
        user: { select: { firstName: true, lastName: true } },
        replies: {
          include: { user: { select: { firstName: true, lastName: true, role: true } } },
          orderBy: { createdAt: 'asc' } // Oldest replies first
        }
      },
      orderBy: { createdAt: 'desc' } // Newest questions first
    });
  }

  // --- REPLIES & MODERATION ---

  async replyToQuestion(userId: string, dto: CreateReplyDto) {
    const question = await this.prisma.question.findUnique({ where: { id: dto.questionId } });
    if (!question) throw new NotFoundException('Question introuvable.');

    const reply = await this.prisma.reply.create({
      data: {
        userId: userId,
        questionId: dto.questionId,
        body: dto.body,
      },
      include: {
        user: { select: { firstName: true, lastName: true, role: true } }
      }
    });

    return { message: 'Réponse ajoutée.', reply };
  }

  // Mark a reply as the correct answer and resolve the question
  async acceptAnswer(userId: string, questionId: string, replyId: string) {
    const question = await this.prisma.question.findUnique({ where: { id: questionId } });
    if (!question) throw new NotFoundException('Question introuvable.');

    // Security: Only the person who asked the question (or an admin) should be able to accept an answer
    // For now, we strictly check if the user requesting this is the author
    if (question.userId !== userId) {
      throw new ForbiddenException('Seul l\'auteur de la question peut valider une réponse.');
    }

    // 1. Mark the reply as accepted
    await this.prisma.reply.update({
      where: { id: replyId },
      data: { isAcceptedAnswer: true },
    });

    // 2. Mark the parent question as resolved
    const updatedQuestion = await this.prisma.question.update({
      where: { id: questionId },
      data: { resolved: true },
    });

    return { message: 'Réponse marquée comme acceptée. Problème résolu !', question: updatedQuestion };
  }
}