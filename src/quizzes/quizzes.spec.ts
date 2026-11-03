import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QuizzesController } from './quizzes.controller';
import { QuizzesService } from './quizzes.service';
import {
  CreateQuizQuestionDto,
  UpdateQuizQuestionDto,
} from './dto/quiz-question.dto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

const adminA = { id: 'a1', role: 'CENTER_ADMIN' }; // academy-1
const adminB = { id: 'a2', role: 'CENTER_ADMIN' }; // academy-2

// The body after validation, and the fields refused (like the app's
// ValidationPipe)
async function check<T extends object>(type: new () => T, body: object) {
  const dto = plainToInstance(type, body);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, fields: errors.map((error) => error.property).sort() };
}

const question = {
  moduleId: 'm1',
  text: '  Which method creates a resource?  ',
  type: 'MULTIPLE_CHOICE',
  difficulty: 'EASY',
  options: [' GET', 'POST ', 'DELETE'],
  correctAnswer: 1,
  explanation: 'POST sends a new resource.',
};

// A fake Prisma: course c1 and module m1 (with question q1) belong to
// academy-1, course c2 and module m2 (with question q2) to academy-2. Admin
// a1 belongs to academy-1, a2 to academy-2. `count` questions are already in
// a module. Every query is recorded.
async function setup(count = 3) {
  const calls: { model: string; query: unknown }[] = [];
  const answer = (model: string, result: unknown) => (query: unknown) => {
    calls.push({ model, query });
    return Promise.resolve(result);
  };
  const academyOf: Record<string, string> = {
    a1: 'academy-1',
    a2: 'academy-2',
    c1: 'academy-1',
    c2: 'academy-2',
    m1: 'academy-1',
    m2: 'academy-2',
    q1: 'academy-1',
    q2: 'academy-2',
  };
  const prisma = {
    user: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve({ centerId: academyOf[query.where.id] ?? null }),
    },
    stage: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve(
          query.where.id in academyOf
            ? { centerId: academyOf[query.where.id] }
            : null,
        ),
    },
    module: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve(
          query.where.id in academyOf
            ? {
                id: query.where.id,
                stage: { centerId: academyOf[query.where.id] },
              }
            : null,
        ),
      findMany: answer('module.findMany', [{ id: 'm1', quizBank: [] }]),
    },
    quizQuestion: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve(
          query.where.id in academyOf
            ? {
                id: query.where.id,
                module: {
                  stage: { centerId: academyOf[query.where.id] },
                },
              }
            : null,
        ),
      count: answer('quizQuestion.count', count),
      create: answer('quizQuestion.create', { id: 'q9' }),
      update: answer('quizQuestion.update', { id: 'q1' }),
      delete: answer('quizQuestion.delete', { id: 'q1' }),
    },
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [QuizzesService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return {
    service: module.get<QuizzesService>(QuizzesService),
    models: () => calls.map((call) => call.model),
    queryOf: (model: string) =>
      calls.find((call) => call.model === model)?.query,
  };
}

// The HTTP status and message of a refused call
async function refusal(call: Promise<unknown>) {
  const error: unknown = await call.catch((caught: unknown) => caught);
  const body = (error as BadRequestException).getResponse() as {
    statusCode: number;
    message: string;
  };
  return { status: body.statusCode, message: body.message };
}

describe('Quizzes of the modules (/quiz-questions)', () => {
  it('every route: a valid token and an admin role', () => {
    expect(Reflect.getMetadata('__guards__', QuizzesController)).toEqual([
      JwtAuthGuard,
      RolesGuard,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, QuizzesController)).toEqual([
      'CENTER_ADMIN',
      'SUPER_ADMIN',
    ]);
  });

  it('the form: a multiple choice question with 2 to 6 different answers', async () => {
    const ok = await check(CreateQuizQuestionDto, question);
    expect(ok.fields).toEqual([]);
    expect(ok.dto.text).toBe('Which method creates a resource?');
    expect(ok.dto.options).toEqual(['GET', 'POST', 'DELETE']);
    const wrong = async (extra: object) =>
      (await check(CreateQuizQuestionDto, { ...question, ...extra })).fields;
    expect(await wrong({ text: '   ' })).toEqual(['text']);
    expect(await wrong({ options: ['Only one'] })).toEqual(['options']);
    expect(
      await wrong({ options: ['1', '2', '3', '4', '5', '6', '7'] }),
    ).toEqual(['options']);
    expect(await wrong({ options: ['GET', ' '] })).toEqual(['options']);
    expect(await wrong({ options: ['GET', 'GET '] })).toEqual(['options']);
    expect(await wrong({ correctAnswer: -1 })).toEqual(['correctAnswer']);
    expect(await wrong({ correctAnswer: 1.5 })).toEqual(['correctAnswer']);
    expect(await wrong({ type: 'ESSAY' })).toEqual(['type']);
    expect(await wrong({ difficulty: 'VERY_HARD' })).toEqual(['difficulty']);
    expect(await wrong({ explanation: 'x'.repeat(1001) })).toEqual([
      'explanation',
    ]);
  });

  it('a true or false question needs no answers; an empty explanation is none', async () => {
    const tf = await check(CreateQuizQuestionDto, {
      moduleId: 'm1',
      text: 'HTTP is stateless.',
      type: 'TRUE_FALSE',
      correctAnswer: 0,
      explanation: '   ',
    });
    expect(tf.fields).toEqual([]);
    expect(tf.dto.explanation).toBeNull();
    // A question stays in its module
    const moved = await check(UpdateQuizQuestionDto, question);
    expect(moved.fields).toEqual(['moduleId']);
  });

  it('add: in a module of the admin academy; true or false gets "True" and "False"', async () => {
    const { service, queryOf } = await setup();
    const valid = (await check(CreateQuizQuestionDto, question)).dto;
    await expect(service.create(valid, adminA)).resolves.toEqual({
      message: 'Question added.',
      question: { id: 'q9' },
    });
    expect(queryOf('quizQuestion.create')).toMatchObject({
      data: {
        moduleId: 'm1',
        text: 'Which method creates a resource?',
        type: 'MULTIPLE_CHOICE',
        difficulty: 'EASY',
        options: ['GET', 'POST', 'DELETE'],
        correctAnswer: 1,
        explanation: 'POST sends a new resource.',
      },
    });

    const second = await setup();
    await second.service.create(
      {
        moduleId: 'm1',
        text: 'HTTP is stateless.',
        type: 'TRUE_FALSE',
        options: ['x', 'y', 'z'],
        correctAnswer: 0,
      },
      adminA,
    );
    expect(second.queryOf('quizQuestion.create')).toMatchObject({
      data: {
        options: ['True', 'False'],
        correctAnswer: 0,
        difficulty: 'MEDIUM',
        explanation: null,
      },
    });
  });

  it('add: the right answer must be one of the answers; 403, 404, at most 50 questions', async () => {
    const { service, models } = await setup();
    const tf = {
      moduleId: 'm1',
      text: 'HTTP is stateless.',
      type: 'TRUE_FALSE' as const,
      correctAnswer: 2,
    };
    expect(await refusal(service.create(tf, adminA))).toEqual({
      status: 400,
      message: 'Choose the right answer among the possible answers.',
    });
    await expect(
      service.create({ ...tf, correctAnswer: 0, moduleId: 'm2' }, adminA),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.create({ ...tf, correctAnswer: 0, moduleId: 'm404' }, adminA),
    ).rejects.toThrow(NotFoundException);
    expect(models()).not.toContain('quizQuestion.create');

    const full = await setup(50);
    expect(
      await refusal(full.service.create({ ...tf, correctAnswer: 0 }, adminA)),
    ).toEqual({
      status: 400,
      message: 'A module can have at most 50 quiz questions.',
    });
    expect(full.models()).not.toContain('quizQuestion.create');
  });

  it('the quiz of a course: its modules in order with their questions; 403, 404', async () => {
    const { service, queryOf } = await setup();
    await expect(service.findForCourse('c1', adminA)).resolves.toEqual([
      { id: 'm1', quizBank: [] },
    ]);
    expect(queryOf('module.findMany')).toMatchObject({
      where: { stageId: 'c1' },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        title: true,
        order: true,
        quizBank: {
          orderBy: { createdAt: 'asc' },
          select: { correctAnswer: true, explanation: true },
        },
      },
    });
    await expect(service.findForCourse('c2', adminA)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.findForCourse('c404', adminA)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('edit and delete: only the questions of the admin academy', async () => {
    const { service, models, queryOf } = await setup();
    const { moduleId, ...edited } = question;
    expect(moduleId).toBe('m1');
    const valid = (await check(UpdateQuizQuestionDto, edited)).dto;
    await service.update('q1', valid, adminA);
    expect(queryOf('quizQuestion.update')).toMatchObject({
      where: { id: 'q1' },
      data: { options: ['GET', 'POST', 'DELETE'], correctAnswer: 1 },
    });
    await expect(service.update('q2', valid, adminA)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.remove('q1', adminA)).resolves.toEqual({
      message: 'Question deleted.',
    });
    await expect(service.remove('q1', adminB)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.remove('q404', adminA)).rejects.toThrow(
      NotFoundException,
    );
    expect(models().filter((model) => model === 'quizQuestion.delete')).toEqual(
      ['quizQuestion.delete'],
    );
  });
});
