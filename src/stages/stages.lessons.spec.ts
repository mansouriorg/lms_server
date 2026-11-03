import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StagesController } from './stages.controller';
import { StagesService } from './stages.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

const adminA = { id: 'a1', role: 'CENTER_ADMIN' }; // academy-1
const adminB = { id: 'a2', role: 'CENTER_ADMIN' }; // academy-2
const platform = { id: 'p1', role: 'SUPER_ADMIN' };

const lesson = (id: string, title: string, duration: number | null) => ({
  id,
  title,
  duration,
});
// Course c1 (academy-1): modules m1 (l1, l2), m2 (l3) and m3 (no lesson).
// Course c3 (academy-1) has no module; course c2 belongs to academy-2.
const COURSES: Record<string, object> = {
  c1: {
    centerId: 'academy-1',
    modules: [
      {
        id: 'm1',
        title: 'Getting started',
        lessons: [
          lesson('l1', 'Your first component', 10),
          lesson('l2', 'Props', null),
        ],
      },
      { id: 'm2', title: 'State', lessons: [lesson('l3', 'useState', 15)] },
      { id: 'm3', title: 'Empty', lessons: [] },
    ],
  },
  c2: { centerId: 'academy-2', modules: [] },
  c3: { centerId: 'academy-1', modules: [] },
};
const sale = (userId: string) => ({ order: { userId } });
const row = (userId: string, lessonId: string, role = 'STUDENT') => ({
  userId,
  lessonId,
  user: { role },
});
// Amira (u1), Youssef (u2) and Karim (a2, the admin of another academy)
// bought c1, Amira twice. Amira completed every lesson, Youssef l1, Karim l3;
// Sara (u3, a student without an order) l1 and l2; admin a1 tried l1.
const SALES = [sale('u1'), sale('u2'), sale('a2'), sale('u1')];
const DONE = [
  row('u1', 'l1'),
  row('u1', 'l2'),
  row('u1', 'l3'),
  row('u2', 'l1'),
  row('u3', 'l1'),
  row('u3', 'l2'),
  row('a1', 'l1', 'CENTER_ADMIN'),
  row('a2', 'l3', 'CENTER_ADMIN'),
];

// A fake Prisma; every query is recorded
async function setup(sales: object[] = SALES, done: object[] = DONE) {
  const calls: { model: string; query: unknown }[] = [];
  const answer = (model: string, result: unknown) => (query: unknown) => {
    calls.push({ model, query });
    return Promise.resolve(result);
  };
  const academyOf: Record<string, string> = {
    a1: 'academy-1',
    a2: 'academy-2',
  };
  const prisma = {
    user: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve({ centerId: academyOf[query.where.id] ?? null }),
    },
    stage: {
      findUnique: (query: { where: { id: string } }) => {
        calls.push({ model: 'stage.findUnique', query });
        return Promise.resolve(COURSES[query.where.id] ?? null);
      },
    },
    orderItem: { findMany: answer('orderItem.findMany', sales) },
    progress: { findMany: answer('progress.findMany', done) },
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [StagesService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return {
    service: module.get<StagesService>(StagesService),
    models: () => calls.map((call) => call.model),
    queryOf: (model: string) =>
      calls.find((call) => call.model === model)?.query,
  };
}

describe('How far the students of a course got (GET /stages/:id/lesson-progress)', () => {
  it('academy admins and super admins with a valid token', () => {
    const handler: unknown = Object.getOwnPropertyDescriptor(
      StagesController.prototype,
      'lessonProgress',
    )?.value;
    expect(Reflect.getMetadata('__guards__', handler as object)).toEqual([
      JwtAuthGuard,
      RolesGuard,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, handler as object)).toEqual([
      'CENTER_ADMIN',
      'SUPER_ADMIN',
    ]);
  });

  it('each lesson in its order, with how many students completed it', async () => {
    const { service, queryOf } = await setup();
    await expect(service.lessonProgress('c1', adminA)).resolves.toEqual({
      students: 4,
      finished: 1,
      modules: [
        {
          id: 'm1',
          title: 'Getting started',
          lessons: [
            {
              id: 'l1',
              title: 'Your first component',
              duration: 10,
              completed: 3,
            },
            { id: 'l2', title: 'Props', duration: null, completed: 2 },
          ],
        },
        {
          id: 'm2',
          title: 'State',
          lessons: [
            { id: 'l3', title: 'useState', duration: 15, completed: 2 },
          ],
        },
        { id: 'm3', title: 'Empty', lessons: [] },
      ],
    });
    expect(queryOf('stage.findUnique')).toMatchObject({
      where: { id: 'c1' },
      select: {
        modules: {
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
          select: {
            lessons: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
          },
        },
      },
    });
    expect(queryOf('orderItem.findMany')).toMatchObject({
      where: { stageId: 'c1', order: { status: 'PAID' } },
    });
    expect(queryOf('progress.findMany')).toMatchObject({
      where: { lesson: { module: { stageId: 'c1' } } },
    });
  });

  it('a course without lessons: nobody finished it; without students: zero', async () => {
    const { service } = await setup([sale('u1')], []);
    await expect(service.lessonProgress('c3', platform)).resolves.toEqual({
      students: 1,
      finished: 0,
      modules: [],
    });
    const empty = await setup([], []);
    const report = await empty.service.lessonProgress('c1', adminA);
    expect(report).toMatchObject({ students: 0, finished: 0 });
  });

  it('only the admins of the academy of the course: 403, 404', async () => {
    const { service, models } = await setup();
    await expect(service.lessonProgress('c1', adminB)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.lessonProgress('c404', adminA)).rejects.toThrow(
      NotFoundException,
    );
    expect(models()).toEqual(['stage.findUnique', 'stage.findUnique']);
  });
});
