// src/questions/questions.service.ts
// Questions and answers under a lesson. Only the people who can open the
// course take part: its buyers (or every signed-in user for a free course),
// the admins of its academy and super admins (see common/course-access.ts).
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertCanOpenCourse,
  CourseViewer,
  isAdmin,
} from '../common/course-access';
import { academyScope, assertManagesAcademy } from '../common/academy-scope';
import { CreateQuestionDto } from './dto/create-question.dto';
import { CreateReplyDto } from './dto/create-reply.dto';

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  // The lesson's course, after checking that the viewer may open it
  // (404 for an unknown lesson or a course they cannot see, 403 when they
  // have not bought it).
  private async openLesson(viewer: CourseViewer, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      // The course fields the access checks need
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
    return lesson.module.stage;
  }

  // The question and its course, with the same checks.
  private async openQuestion(viewer: CourseViewer, questionId: string) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      select: {
        id: true,
        userId: true,
        lesson: {
          select: {
            module: {
              select: {
                stage: {
                  select: {
                    id: true,
                    centerId: true,
                    price: true,
                    status: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (question === null) {
      throw new NotFoundException('Question not found.');
    }
    const course = question.lesson.module.stage;
    await assertCanOpenCourse(this.prisma, viewer, course);
    return { question, course };
  }

  // --- QUESTIONS ---

  async askQuestion(viewer: CourseViewer, dto: CreateQuestionDto) {
    await this.openLesson(viewer, dto.lessonId);
    const question = await this.prisma.question.create({
      data: {
        userId: viewer.id,
        lessonId: dto.lessonId,
        title: dto.title,
        body: dto.body,
      },
    });
    return { message: 'Question posted.', question };
  }

  // The questions of a lesson, newest first, with their answers (oldest
  // first) and the first and last names of their authors.
  async getQuestionsByLesson(viewer: CourseViewer, lessonId: string) {
    await this.openLesson(viewer, lessonId);
    return this.prisma.question.findMany({
      where: { lessonId },
      include: {
        user: { select: { firstName: true, lastName: true } },
        replies: {
          include: {
            user: { select: { firstName: true, lastName: true, role: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // --- THE ACADEMY INBOX ---

  // GET /questions/inbox (admins): the questions on the courses of the
  // admin's academy (every academy for a super admin), the ones not resolved
  // first, then the newest; at most 200. With their answers, and the lesson
  // and course they belong to.
  async inbox(viewer: CourseViewer) {
    const scope = await academyScope(this.prisma, viewer);
    return this.prisma.question.findMany({
      where: scope.all
        ? {}
        : { lesson: { module: { stage: { centerId: scope.centerId } } } },
      include: {
        user: { select: { firstName: true, lastName: true } },
        lesson: {
          select: {
            id: true,
            title: true,
            module: {
              select: { stage: { select: { id: true, title: true } } },
            },
          },
        },
        replies: {
          include: {
            user: { select: { firstName: true, lastName: true, role: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ resolved: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  // --- ANSWERS ---

  async replyToQuestion(viewer: CourseViewer, dto: CreateReplyDto) {
    await this.openQuestion(viewer, dto.questionId);
    const reply = await this.prisma.reply.create({
      data: {
        userId: viewer.id,
        questionId: dto.questionId,
        body: dto.body,
      },
      include: {
        user: { select: { firstName: true, lastName: true, role: true } },
      },
    });
    return { message: 'Answer posted.', reply };
  }

  // Marks one answer as the accepted one and the question as resolved. Only
  // the author of the question, or an admin of the course's academy, may do
  // it; the answer must belong to that question. A question has at most one
  // accepted answer: choosing another one replaces it.
  async acceptAnswer(
    viewer: CourseViewer,
    questionId: string,
    replyId: string,
  ) {
    const { question, course } = await this.openQuestion(viewer, questionId);
    if (question.userId !== viewer.id) {
      if (isAdmin(viewer) === false) {
        throw new ForbiddenException(
          'Only the author of the question can accept an answer.',
        );
      }
      await assertManagesAcademy(this.prisma, viewer, course.centerId);
    }

    const reply = await this.prisma.reply.findUnique({
      where: { id: replyId },
      select: { questionId: true },
    });
    if (reply === null || reply.questionId !== questionId) {
      throw new NotFoundException('Answer not found.');
    }

    const [, , updatedQuestion] = await this.prisma.$transaction([
      this.prisma.reply.updateMany({
        where: { questionId, isAcceptedAnswer: true },
        data: { isAcceptedAnswer: false },
      }),
      this.prisma.reply.update({
        where: { id: replyId },
        data: { isAcceptedAnswer: true },
      }),
      this.prisma.question.update({
        where: { id: questionId },
        data: { resolved: true },
      }),
    ]);
    return {
      message: 'Answer accepted. Question resolved.',
      question: updatedQuestion,
    };
  }
}
