import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QuizzesService } from './quizzes.service';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';
import { bestOf, percentOf } from './quiz-results';
import { PrismaService } from '../prisma/prisma.service';

const buyer = { id: 'u1', role: 'STUDENT' }; // paid for course c1
const other = { id: 'u2', role: 'STUDENT' }; // paid for nothing
const day = (text: string) => new Date(`${text}T10:00:00.000Z`);

// Course c1 (academy-1, 100 TND) has module m1 with three questions; the
// right answers are 1, 0 and 2. Module m2 has no question. `saved` are the
// attempts already in the database. Every query is recorded.
async function setup(
  saved: {
    moduleId: string;
    correct: number;
    total: number;
    createdAt: Date;
  }[] = [],
) {
  const calls: { model: string; query: unknown }[] = [];
  const answer = (model: string, result: unknown) => (query: unknown) => {
    calls.push({ model, query });
    return Promise.resolve(result);
  };
  const stage = {
    id: 'c1',
    centerId: 'academy-1',
    price: 100,
    status: 'ACTIVE',
  };
  const prisma = {
    user: { findUnique: answer('user.findUnique', { centerId: null }) },
    orderItem: {
      count: (query: { where: { order: { userId: string } } }) =>
        Promise.resolve(query.where.order.userId === 'u1' ? 1 : 0),
    },
    stage: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve(query.where.id === 'c1' ? stage : null),
    },
    module: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve(
          ['m1', 'm2'].includes(query.where.id)
            ? { id: query.where.id, title: 'Getting started', stage }
            : null,
        ),
    },
    quizQuestion: {
      findMany: (query: { where: { moduleId: string } }) => {
        calls.push({ model: 'quizQuestion.findMany', query });
        return Promise.resolve(
          query.where.moduleId === 'm1'
            ? [
                { id: 'q1', options: ['A', 'B', 'C'], correctAnswer: 1 },
                { id: 'q2', options: ['True', 'False'], correctAnswer: 0 },
                { id: 'q3', options: ['A', 'B', 'C'], correctAnswer: 2 },
              ]
            : [],
        );
      },
    },
    quizAttempt: {
      create: (query: { data: { correct: number; total: number } }) => {
        calls.push({ model: 'quizAttempt.create', query });
        saved.push({
          moduleId: 'm1',
          createdAt: day('2026-11-01'),
          ...query.data,
        });
        return Promise.resolve({ id: 'a9' });
      },
      findMany: (query: unknown) => {
        calls.push({ model: 'quizAttempt.findMany', query });
        return Promise.resolve([...saved]);
      },
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

const answers = (...chosen: number[]) =>
  chosen.map((answer, index) => ({ questionId: `q${index + 1}`, answer }));

describe('Saved quiz scores (QuizAttempt)', () => {
  it('the best attempt: the highest share of right answers, the most recent of equal ones', () => {
    expect(percentOf(2, 3)).toBe(67);
    expect(percentOf(0, 0)).toBe(0);
    expect(bestOf([])).toBeNull();
    expect(
      bestOf([
        { correct: 2, total: 4, createdAt: day('2026-10-01') },
        { correct: 3, total: 4, createdAt: day('2026-10-02') },
        { correct: 6, total: 8, createdAt: day('2026-10-05') },
        { correct: 1, total: 4, createdAt: day('2026-10-09') },
      ]),
    ).toEqual({
      correct: 6,
      total: 8,
      percentage: 75,
      createdAt: day('2026-10-05'),
    });
  });

  it('a finished quiz: graded by the server and saved, with the best score', async () => {
    const { service, queryOf } = await setup([
      {
        moduleId: 'm1',
        correct: 1,
        total: 3,
        createdAt: day('2026-10-01'),
      },
    ]);
    await expect(
      service.submitAttempt('m1', answers(1, 1, 2), buyer),
    ).resolves.toEqual({
      message: 'Your score is saved.',
      correct: 2,
      total: 3,
      percentage: 67,
      best: {
        correct: 2,
        total: 3,
        percentage: 67,
        createdAt: day('2026-11-01'),
      },
      attempts: 2,
    });
    expect(queryOf('quizAttempt.create')).toEqual({
      data: { userId: 'u1', moduleId: 'm1', correct: 2, total: 3 },
    });
    expect(queryOf('quizAttempt.findMany')).toEqual({
      where: { userId: 'u1', moduleId: 'm1' },
      select: { correct: true, total: true, createdAt: true },
    });
  });

  it('not saved: a changed quiz, an answer out of the list, no question, no access', async () => {
    const { service, models } = await setup();
    const changed = 'The quiz changed while you answered it: start it again.';
    for (const sent of [
      answers(1, 0),
      answers(1, 0, 2, 0),
      [...answers(1, 0), { questionId: 'q1', answer: 2 }],
      [...answers(1, 0), { questionId: 'q9', answer: 0 }],
    ]) {
      await expect(service.submitAttempt('m1', sent, buyer)).rejects.toThrow(
        changed,
      );
    }
    await expect(
      service.submitAttempt('m1', answers(1, 2, 2), buyer),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.submitAttempt('m2', answers(0), buyer),
    ).rejects.toThrow('This module has no quiz questions.');
    await expect(
      service.submitAttempt('m1', answers(1, 0, 2), other),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.submitAttempt('m404', answers(1, 0, 2), buyer),
    ).rejects.toThrow(NotFoundException);
    expect(models()).not.toContain('quizAttempt.create');
  });

  it('the quiz sent to the student comes with their best score', async () => {
    const { service } = await setup([
      { moduleId: 'm1', correct: 3, total: 3, createdAt: day('2026-10-03') },
    ]);
    await expect(service.forStudent('m1', buyer)).resolves.toMatchObject({
      best: { correct: 3, total: 3, percentage: 100 },
      attempts: 1,
    });
  });

  it('the best score at each module quiz of a course; 403, 404', async () => {
    const { service, queryOf } = await setup([
      { moduleId: 'm1', correct: 1, total: 3, createdAt: day('2026-10-01') },
      { moduleId: 'm2', correct: 2, total: 2, createdAt: day('2026-10-02') },
      { moduleId: 'm1', correct: 2, total: 3, createdAt: day('2026-10-03') },
    ]);
    await expect(service.courseResults('c1', buyer)).resolves.toEqual([
      {
        moduleId: 'm1',
        best: {
          correct: 2,
          total: 3,
          percentage: 67,
          createdAt: day('2026-10-03'),
        },
        attempts: 2,
      },
      {
        moduleId: 'm2',
        best: {
          correct: 2,
          total: 2,
          percentage: 100,
          createdAt: day('2026-10-02'),
        },
        attempts: 1,
      },
    ]);
    expect(queryOf('quizAttempt.findMany')).toMatchObject({
      where: { userId: 'u1', module: { stageId: 'c1' } },
    });
    await expect(service.courseResults('c1', other)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.courseResults('c404', buyer)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('the answers sent: a list of 1 to 50, each a question and a whole number', async () => {
    const fields = async (body: object) => {
      const errors = await validate(plainToInstance(SubmitAttemptDto, body), {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      return errors.map((error) =>
        [error.property, ...(error.children ?? []).map((c) => c.property)].join(
          '.',
        ),
      );
    };
    expect(await fields({ answers: answers(1, 0, 2) })).toEqual([]);
    expect(await fields({ answers: [] })).toEqual(['answers']);
    expect(await fields({})).toEqual(['answers']);
    expect(
      await fields({ answers: answers(...new Array<number>(51).fill(0)) }),
    ).toEqual(['answers']);
    expect(
      await fields({ answers: [{ questionId: 'q1', answer: -1 }] }),
    ).toEqual(['answers.0']);
    expect(
      await fields({ answers: [{ questionId: 'q1', answer: 1, right: true }] }),
    ).toEqual(['answers.0']);
  });
});
