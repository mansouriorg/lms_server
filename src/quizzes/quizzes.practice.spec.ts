import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QuizPracticeController } from './practice.controller';
import { QuizzesService } from './quizzes.service';
import { CheckAnswerDto } from './dto/check-answer.dto';
import { StagesService } from '../stages/stages.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const buyer = { id: 'u1', role: 'STUDENT' }; // paid for course c1
const other = { id: 'u2', role: 'STUDENT' }; // paid for nothing
const adminA = { id: 'a1', role: 'CENTER_ADMIN' }; // academy-1

// Course c1 (100 TND, academy-1) has module m1 with question q1; course c2
// is free (module m2); course c3 is a draft (module m3 with question q3).
const courses: Record<string, object> = {
  m1: { id: 'c1', centerId: 'academy-1', price: 100, status: 'ACTIVE' },
  m2: { id: 'c2', centerId: 'academy-1', price: 0, status: 'ACTIVE' },
  m3: { id: 'c3', centerId: 'academy-2', price: 100, status: 'DRAFT' },
};
const questions: Record<string, { moduleId: string }> = {
  q1: { moduleId: 'm1' },
  q3: { moduleId: 'm3' },
};

// A fake Prisma for these courses; every query is recorded
async function setup() {
  const calls: { model: string; query: unknown }[] = [];
  const answer = (model: string, result: unknown) => (query: unknown) => {
    calls.push({ model, query });
    return Promise.resolve(result);
  };
  const prisma = {
    user: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve({
          centerId: query.where.id === 'a1' ? 'academy-1' : null,
        }),
    },
    orderItem: {
      count: (query: {
        where: { stageId: string; order: { userId: string } };
      }) =>
        Promise.resolve(
          query.where.order.userId === 'u1' && query.where.stageId === 'c1'
            ? 1
            : 0,
        ),
    },
    module: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve(
          query.where.id in courses
            ? {
                id: query.where.id,
                title: 'Getting started',
                stage: courses[query.where.id],
              }
            : null,
        ),
    },
    stage: { findUnique: answer('stage.findUnique', { id: 'c1' }) },
    quizAttempt: { findMany: answer('quizAttempt.findMany', []) },
    quizQuestion: {
      findMany: answer('quizQuestion.findMany', [{ id: 'q1' }]),
      findUnique: (query: { where: { id: string } }) => {
        const found = questions[query.where.id];
        return Promise.resolve(
          found === undefined
            ? null
            : {
                options: ['GET', 'POST', 'DELETE'],
                correctAnswer: 1,
                explanation: 'POST sends a new resource.',
                module: { stage: courses[found.moduleId] },
              },
        );
      },
    },
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      QuizzesService,
      StagesService,
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();
  return {
    service: module.get<QuizzesService>(QuizzesService),
    stages: module.get<StagesService>(StagesService),
    queryOf: (model: string) =>
      calls.find((call) => call.model === model)?.query,
  };
}

describe('Quizzes in the course player (/quizzes)', () => {
  it('every route needs a valid token; checking an answer answers 200', () => {
    expect(Reflect.getMetadata('__guards__', QuizPracticeController)).toEqual([
      JwtAuthGuard,
    ]);
    const check: unknown = Object.getOwnPropertyDescriptor(
      QuizPracticeController.prototype,
      'check',
    )?.value;
    expect(Reflect.getMetadata('__httpCode__', check as object)).toBe(200);
  });

  it('the quiz of a module: its questions without the right answers', async () => {
    const { service, queryOf } = await setup();
    await expect(service.forStudent('m1', buyer)).resolves.toEqual({
      module: { id: 'm1', title: 'Getting started' },
      questions: [{ id: 'q1' }],
      best: null,
      attempts: 0,
    });
    expect(queryOf('quizQuestion.findMany')).toEqual({
      where: { moduleId: 'm1' },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        text: true,
        type: true,
        difficulty: true,
        options: true,
      },
    });
  });

  it('who may take it: buyers, the academy admins, everyone signed in for a free course', async () => {
    const { service } = await setup();
    await expect(service.forStudent('m1', adminA)).resolves.toMatchObject({
      module: { id: 'm1' },
    });
    await expect(service.forStudent('m2', other)).resolves.toMatchObject({
      module: { id: 'm2' },
    });
    await expect(service.forStudent('m1', other)).rejects.toThrow(
      ForbiddenException,
    );
    // A draft course does not exist for the others, nor does an unknown module
    await expect(service.forStudent('m3', other)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.forStudent('m404', buyer)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('checking an answer: right or not, with the right one and the explanation', async () => {
    const { service } = await setup();
    await expect(service.check('q1', 1, buyer)).resolves.toEqual({
      right: true,
      correctAnswer: 1,
      explanation: 'POST sends a new resource.',
    });
    await expect(service.check('q1', 0, buyer)).resolves.toEqual({
      right: false,
      correctAnswer: 1,
      explanation: 'POST sends a new resource.',
    });
    await expect(service.check('q1', 3, buyer)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.check('q1', 1, other)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.check('q3', 0, other)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.check('q404', 0, buyer)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('the answer sent: a whole number from 0', async () => {
    const fields = async (body: object) => {
      const errors = await validate(plainToInstance(CheckAnswerDto, body), {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      return errors.map((error) => error.property);
    };
    expect(await fields({ answer: 2 })).toEqual([]);
    expect(await fields({ answer: -1 })).toEqual(['answer']);
    expect(await fields({ answer: 1.5 })).toEqual(['answer']);
    expect(await fields({ answer: '1' })).toEqual(['answer']);
    expect(await fields({})).toEqual(['answer']);
    expect(await fields({ answer: 1, correctAnswer: 1 })).toEqual([
      'correctAnswer',
    ]);
  });

  it('the course player gets the number of quiz questions of each module', async () => {
    const { stages, queryOf } = await setup();
    await stages.findOne('c1');
    expect(queryOf('stage.findUnique')).toMatchObject({
      include: {
        modules: { include: { _count: { select: { quizBank: true } } } },
      },
    });
  });
});
