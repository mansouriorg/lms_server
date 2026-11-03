import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { QuizzesController } from './quizzes.controller';
import { QuizzesService } from './quizzes.service';
import { PrismaService } from '../prisma/prisma.service';

const adminA = { id: 'a1', role: 'CENTER_ADMIN' }; // academy-1
const adminB = { id: 'a2', role: 'CENTER_ADMIN' }; // academy-2
const platform = { id: 'p1', role: 'SUPER_ADMIN' };
const day = (text: string) => new Date(`${text}T10:00:00.000Z`);

const amira = {
  id: 'u1',
  firstName: 'Amira',
  lastName: 'Ben Ali',
  email: 'amira@example.com',
};
const youssef = {
  id: 'u2',
  firstName: 'Youssef',
  lastName: 'Trabelsi',
  email: 'youssef@example.com',
};
const sara = {
  id: 'u3',
  firstName: 'Sara',
  lastName: 'Mansour',
  email: 'sara@example.com',
};
// The admin of another academy, who bought the course
const karim = {
  id: 'a2',
  firstName: 'Karim',
  lastName: 'Haddad',
  email: 'karim@example.com',
};
const attempt = (
  user: object,
  role: string,
  moduleId: string,
  correct: number,
  total: number,
  date: string,
) => ({
  moduleId,
  correct,
  total,
  createdAt: day(date),
  user: { ...user, role },
});

// Amira, Youssef and Karim bought course c1 (and an account since deleted);
// Amira and Karim finished quizzes, Sara (a student without an order) too,
// and admin a1 tried the quiz of m1.
const tester = { ...amira, id: 'a1', firstName: 'Admin' };
const SALES = [
  { order: { user: amira } },
  { order: { user: youssef } },
  { order: { user: null } },
  { order: { user: karim } },
  { order: { user: amira } },
];
const ATTEMPTS = [
  attempt(amira, 'STUDENT', 'm1', 1, 3, '2026-10-01'),
  attempt(amira, 'STUDENT', 'm1', 3, 3, '2026-10-02'),
  attempt(amira, 'STUDENT', 'm3', 1, 2, '2026-10-03'),
  attempt(sara, 'STUDENT', 'm1', 2, 3, '2026-10-04'),
  attempt(tester, 'CENTER_ADMIN', 'm1', 3, 3, '2026-10-05'),
  attempt(karim, 'CENTER_ADMIN', 'm3', 2, 2, '2026-10-06'),
];

// Course c1 belongs to academy-1, c2 to academy-2; c1 has modules m1 (3
// questions), m2 (none) and m3 (2 questions). Every query is recorded.
async function setup(sales: object[] = SALES, attempts: object[] = ATTEMPTS) {
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
      findMany: answer('module.findMany', [
        { id: 'm1', title: 'Getting started', _count: { quizBank: 3 } },
        { id: 'm2', title: 'State', _count: { quizBank: 0 } },
        { id: 'm3', title: 'Effects', _count: { quizBank: 2 } },
      ]),
    },
    orderItem: { findMany: answer('orderItem.findMany', sales) },
    quizAttempt: { findMany: answer('quizAttempt.findMany', attempts) },
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

const modules = [
  { id: 'm1', title: 'Getting started', questions: 3 },
  { id: 'm2', title: 'State', questions: 0 },
  { id: 'm3', title: 'Effects', questions: 2 },
];

describe('Quiz results of a course (/quiz-questions/course/:stageId/results)', () => {
  it('the students of the course with their best score at each module quiz', async () => {
    const { service, queryOf } = await setup();
    await expect(service.resultsForCourse('c1', adminA)).resolves.toEqual({
      modules,
      students: [
        {
          ...amira,
          results: [
            {
              moduleId: 'm1',
              best: {
                correct: 3,
                total: 3,
                percentage: 100,
                createdAt: day('2026-10-02'),
              },
              attempts: 2,
            },
            {
              moduleId: 'm3',
              best: {
                correct: 1,
                total: 2,
                percentage: 50,
                createdAt: day('2026-10-03'),
              },
              attempts: 1,
            },
          ],
        },
        { ...youssef, results: [] },
        {
          ...karim,
          results: [
            {
              moduleId: 'm3',
              best: {
                correct: 2,
                total: 2,
                percentage: 100,
                createdAt: day('2026-10-06'),
              },
              attempts: 1,
            },
          ],
        },
        {
          ...sara,
          results: [
            {
              moduleId: 'm1',
              best: {
                correct: 2,
                total: 3,
                percentage: 67,
                createdAt: day('2026-10-04'),
              },
              attempts: 1,
            },
          ],
        },
      ],
    });
    expect(queryOf('module.findMany')).toMatchObject({
      where: { stageId: 'c1' },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    expect(queryOf('orderItem.findMany')).toMatchObject({
      where: { stageId: 'c1', order: { status: 'PAID' } },
    });
    expect(queryOf('quizAttempt.findMany')).toMatchObject({
      where: { module: { stageId: 'c1' } },
    });
  });

  it('a course without students yet: its modules, no student', async () => {
    const { service } = await setup([], []);
    await expect(service.resultsForCourse('c1', platform)).resolves.toEqual({
      modules,
      students: [],
    });
  });

  it('only the admins of the academy of the course: 403, 404', async () => {
    const { service, models } = await setup();
    await expect(service.resultsForCourse('c1', adminB)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.resultsForCourse('c404', adminA)).rejects.toThrow(
      NotFoundException,
    );
    expect(models()).toEqual([]);
  });

  it('the route asks the service for the course of the admin', async () => {
    const asked: unknown[] = [];
    const service = {
      resultsForCourse: (stageId: string, user: unknown) => {
        asked.push([stageId, user]);
        return Promise.resolve({ modules: [], students: [] });
      },
    };
    const controller = new QuizzesController(
      service as unknown as QuizzesService,
    );
    await expect(controller.resultsForCourse('c1', adminA)).resolves.toEqual({
      modules: [],
      students: [],
    });
    expect(asked).toEqual([['c1', adminA]]);
  });
});
