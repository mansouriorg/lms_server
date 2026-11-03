// src/quizzes/quizzes.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Actor, assertManagesAcademy } from '../common/academy-scope';
import { assertCanOpenCourse, CourseViewer } from '../common/course-access';
import { AttemptAnswerDto } from './dto/submit-attempt.dto';
import { AttemptScore, bestOf, percentOf } from './quiz-results';
import {
  CreateQuizQuestionDto,
  QuizLevel,
  QuizType,
  UpdateQuizQuestionDto,
} from './dto/quiz-question.dto';

// The answers of every true or false question
export const TRUE_FALSE_OPTIONS = ['True', 'False'];
// At most this many questions in the quiz of one module
export const QUESTIONS_PER_MODULE = 50;

// What is stored of a question
type QuestionData = {
  text: string;
  type: QuizType;
  difficulty: QuizLevel;
  options: string[];
  correctAnswer: number;
  explanation: string | null;
};

// What the academy sees of a question (with the right answer)
const QUESTION_FIELDS = {
  id: true,
  moduleId: true,
  text: true,
  type: true,
  difficulty: true,
  options: true,
  correctAnswer: true,
  explanation: true,
  createdAt: true,
} as const;

// The quizzes of the modules: questions with possible answers, the right one
// and an explanation. Admins may only change the quizzes of their own
// academy's courses (every academy for a super admin).
@Injectable()
export class QuizzesService {
  constructor(private readonly prisma: PrismaService) {}

  // The module and the academy of its course, after checking the academy
  // (404, then 403)
  private async managedModule(moduleId: string, actor: Actor) {
    const courseModule = await this.prisma.module.findUnique({
      where: { id: moduleId },
      select: { id: true, stage: { select: { centerId: true } } },
    });
    if (courseModule === null) {
      throw new NotFoundException('Module not found.');
    }
    await assertManagesAcademy(this.prisma, actor, courseModule.stage.centerId);
    return courseModule;
  }

  // The question, after checking the academy of its course (404, then 403)
  private async managedQuestion(id: string, actor: Actor) {
    const question = await this.prisma.quizQuestion.findUnique({
      where: { id },
      select: {
        id: true,
        module: { select: { stage: { select: { centerId: true } } } },
      },
    });
    if (question === null) {
      throw new NotFoundException('Question not found.');
    }
    await assertManagesAcademy(
      this.prisma,
      actor,
      question.module.stage.centerId,
    );
    return question;
  }

  // The answers to store, and a check that the right one is among them
  private answers(dto: UpdateQuizQuestionDto): QuestionData {
    const options =
      dto.type === 'TRUE_FALSE' ? TRUE_FALSE_OPTIONS : (dto.options ?? []);
    if (dto.correctAnswer >= options.length) {
      throw new BadRequestException(
        'Choose the right answer among the possible answers.',
      );
    }
    return {
      text: dto.text,
      type: dto.type,
      difficulty: dto.difficulty ?? 'MEDIUM',
      options,
      correctAnswer: dto.correctAnswer,
      explanation: dto.explanation ?? null,
    };
  }

  // GET /quiz-questions/course/:stageId: the modules of the course in their
  // order, each with its questions (the oldest first).
  async findForCourse(stageId: string, actor: Actor) {
    const stage = await this.prisma.stage.findUnique({
      where: { id: stageId },
      select: { centerId: true },
    });
    if (stage === null) {
      throw new NotFoundException('Course not found.');
    }
    await assertManagesAcademy(this.prisma, actor, stage.centerId);
    return this.prisma.module.findMany({
      where: { stageId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        title: true,
        order: true,
        quizBank: {
          orderBy: { createdAt: 'asc' },
          select: QUESTION_FIELDS,
        },
      },
    });
  }

  // POST /quiz-questions: at the end of the module's quiz
  async create(dto: CreateQuizQuestionDto, actor: Actor) {
    await this.managedModule(dto.moduleId, actor);
    const data = this.answers(dto);
    const count = await this.prisma.quizQuestion.count({
      where: { moduleId: dto.moduleId },
    });
    if (count >= QUESTIONS_PER_MODULE) {
      throw new BadRequestException(
        `A module can have at most ${QUESTIONS_PER_MODULE} quiz questions.`,
      );
    }
    const question = await this.prisma.quizQuestion.create({
      data: { ...data, moduleId: dto.moduleId },
      select: QUESTION_FIELDS,
    });
    return { message: 'Question added.', question };
  }

  // PATCH /quiz-questions/:id: the whole question again
  async update(id: string, dto: UpdateQuizQuestionDto, actor: Actor) {
    await this.managedQuestion(id, actor);
    const question = await this.prisma.quizQuestion.update({
      where: { id },
      data: this.answers(dto),
      select: QUESTION_FIELDS,
    });
    return { message: 'Question saved.', question };
  }

  // DELETE /quiz-questions/:id
  async remove(id: string, actor: Actor) {
    await this.managedQuestion(id, actor);
    await this.prisma.quizQuestion.delete({ where: { id } });
    return { message: 'Question deleted.' };
  }

  // GET /quiz-questions/course/:stageId/results: the modules of the course in
  // their order (with their number of questions) and its students, each with
  // their best score at the quiz of each module they finished. The students:
  // the buyers of the course (paid orders) and the student accounts that
  // finished one of its quizzes (a free course has no orders). The quizzes an
  // admin took to try them are left out.
  async resultsForCourse(stageId: string, actor: Actor) {
    const stage = await this.prisma.stage.findUnique({
      where: { id: stageId },
      select: { centerId: true },
    });
    if (stage === null) {
      throw new NotFoundException('Course not found.');
    }
    await assertManagesAcademy(this.prisma, actor, stage.centerId);
    const modules = await this.prisma.module.findMany({
      where: { stageId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, title: true, _count: { select: { quizBank: true } } },
    });
    const person = {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    } as const;
    const sales = await this.prisma.orderItem.findMany({
      where: { stageId, order: { status: 'PAID' } },
      orderBy: { createdAt: 'asc' },
      select: { order: { select: { user: { select: person } } } },
    });
    const attempts = await this.prisma.quizAttempt.findMany({
      where: { module: { stageId } },
      orderBy: { createdAt: 'asc' },
      select: {
        moduleId: true,
        correct: true,
        total: true,
        createdAt: true,
        user: { select: { ...person, role: true } },
      },
    });

    type Person = {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    };
    const students = new Map<
      string,
      { student: Person; byModule: Map<string, AttemptScore[]> }
    >();
    const add = (user: Person) => {
      if (students.has(user.id) === false) {
        const { id, firstName, lastName, email } = user;
        students.set(id, {
          student: { id, firstName, lastName, email },
          byModule: new Map(),
        });
      }
      return students.get(user.id);
    };
    for (const sale of sales) {
      if (sale.order.user !== null) add(sale.order.user);
    }
    for (const attempt of attempts) {
      if (students.has(attempt.user.id) || attempt.user.role === 'STUDENT') {
        const { byModule } = add(attempt.user);
        const list = byModule.get(attempt.moduleId) ?? [];
        list.push(attempt);
        byModule.set(attempt.moduleId, list);
      }
    }
    return {
      modules: modules.map((courseModule) => ({
        id: courseModule.id,
        title: courseModule.title,
        questions: courseModule._count.quizBank,
      })),
      students: [...students.values()].map(({ student, byModule }) => ({
        ...student,
        results: [...byModule.entries()].map(([moduleId, list]) => ({
          moduleId,
          best: bestOf(list),
          attempts: list.length,
        })),
      })),
    };
  }

  // --- STUDENTS: the quizzes in the course player ---

  // GET /quizzes/module/:moduleId: the questions of the module's quiz (the
  // oldest first) without the right answers, for viewers who may open the
  // course (404 when they may not see it, 403 when they did not buy it).
  async forStudent(moduleId: string, viewer: CourseViewer) {
    const courseModule = await this.prisma.module.findUnique({
      where: { id: moduleId },
      select: {
        id: true,
        title: true,
        stage: {
          select: { id: true, centerId: true, price: true, status: true },
        },
      },
    });
    if (courseModule === null) {
      throw new NotFoundException('Module not found.');
    }
    await assertCanOpenCourse(this.prisma, viewer, courseModule.stage);
    const questions = await this.prisma.quizQuestion.findMany({
      where: { moduleId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        text: true,
        type: true,
        difficulty: true,
        options: true,
      },
    });
    return {
      module: { id: courseModule.id, title: courseModule.title },
      questions,
      ...(await this.results(viewer.id, moduleId)),
    };
  }

  // POST /quizzes/questions/:id/check: is `answer` (the place of an answer,
  // from 0) the right one? The reply gives the right answer and the
  // explanation. Nothing is stored.
  async check(id: string, answer: number, viewer: CourseViewer) {
    const question = await this.prisma.quizQuestion.findUnique({
      where: { id },
      select: {
        options: true,
        correctAnswer: true,
        explanation: true,
        module: {
          select: {
            stage: {
              select: { id: true, centerId: true, price: true, status: true },
            },
          },
        },
      },
    });
    if (question === null) {
      throw new NotFoundException('Question not found.');
    }
    await assertCanOpenCourse(this.prisma, viewer, question.module.stage);
    if (answer >= question.options.length) {
      throw new BadRequestException('Choose one of the answers.');
    }
    return {
      right: answer === question.correctAnswer,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation,
    };
  }

  // The viewer's best finished attempt at a module's quiz, and how many
  // they finished
  private async results(userId: string, moduleId: string) {
    const attempts = await this.prisma.quizAttempt.findMany({
      where: { userId, moduleId },
      select: { correct: true, total: true, createdAt: true },
    });
    return { best: bestOf(attempts), attempts: attempts.length };
  }

  // POST /quizzes/module/:moduleId/attempts: grades a finished quiz (one
  // answer per question) and saves the score, for viewers who may open the
  // course. When the quiz changed since it was loaded: 400, nothing saved.
  async submitAttempt(
    moduleId: string,
    answers: AttemptAnswerDto[],
    viewer: CourseViewer,
  ) {
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
    const questions = await this.prisma.quizQuestion.findMany({
      where: { moduleId },
      select: { id: true, options: true, correctAnswer: true },
    });
    if (questions.length === 0) {
      throw new BadRequestException('This module has no quiz questions.');
    }
    const chosen = new Map<string, number>();
    for (const item of answers) {
      chosen.set(item.questionId, item.answer);
    }
    // As many answers as questions, and one for each question: so no
    // question twice and no unknown one
    if (
      answers.length !== questions.length ||
      questions.some((question) => chosen.has(question.id) === false)
    ) {
      throw new BadRequestException(
        'The quiz changed while you answered it: start it again.',
      );
    }
    if (
      questions.some(
        (question) => chosen.get(question.id) >= question.options.length,
      )
    ) {
      throw new BadRequestException('Choose one of the answers.');
    }
    const correct = questions.filter(
      (question) => chosen.get(question.id) === question.correctAnswer,
    ).length;
    await this.prisma.quizAttempt.create({
      data: { userId: viewer.id, moduleId, correct, total: questions.length },
    });
    return {
      message: 'Your score is saved.',
      correct,
      total: questions.length,
      percentage: percentOf(correct, questions.length),
      ...(await this.results(viewer.id, moduleId)),
    };
  }

  // GET /quizzes/course/:stageId/results: the viewer's best score at the
  // quiz of each module of the course (the modules they finished a quiz of)
  async courseResults(stageId: string, viewer: CourseViewer) {
    const stage = await this.prisma.stage.findUnique({
      where: { id: stageId },
      select: { id: true, centerId: true, price: true, status: true },
    });
    if (stage === null) {
      throw new NotFoundException('Course not found.');
    }
    await assertCanOpenCourse(this.prisma, viewer, stage);
    const attempts = await this.prisma.quizAttempt.findMany({
      where: { userId: viewer.id, module: { stageId } },
      select: { moduleId: true, correct: true, total: true, createdAt: true },
    });
    const byModule = new Map<string, AttemptScore[]>();
    for (const attempt of attempts) {
      const list = byModule.get(attempt.moduleId) ?? [];
      list.push(attempt);
      byModule.set(attempt.moduleId, list);
    }
    return [...byModule.entries()].map(([moduleId, list]) => ({
      moduleId,
      best: bestOf(list),
      attempts: list.length,
    }));
  }
}
