import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StagesController } from './stages.controller';
import { StagesService } from './stages.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

const adminA = { id: 'a1', role: 'CENTER_ADMIN' }; // academy-1
const superAdmin = { id: 's1', role: 'SUPER_ADMIN' };

const day = (text: string) => new Date(`${text}T10:00:00.000Z`);
const person = (id: string, firstName: string) => ({
  id,
  firstName,
  lastName: 'Ben Ali',
  email: `${id}@example.com`,
  phone: id === 'u1' ? '+216 20 000 000' : null,
});
const course = (id: string) => ({
  id,
  title: `Course ${id}`,
  status: 'ACTIVE',
  center: { name: 'Code Academy' },
});
// A course order line, as the query selects it
const item = (when: string, courseId: string | null, userId: string) => ({
  createdAt: day(when),
  stage: courseId === null ? null : course(courseId),
  order: { user: person(userId, userId === 'u1' ? 'Amira' : 'Youssef') },
});

// A fake Prisma: the PAID course order lines (oldest first), the lessons of
// the courses and the lessons completed. Every query is recorded.
async function setup(
  items: unknown[],
  lessons: { id: string; module: { stageId: string } }[],
  done: { userId: string; lessonId: string; createdAt: Date }[],
  centerId: string | null = 'academy-1',
) {
  const queries: { model: string; query: unknown }[] = [];
  const answer = (model: string, result: unknown) => (query: unknown) => {
    queries.push({ model, query });
    return Promise.resolve(result);
  };
  const prisma = {
    user: { findUnique: answer('user.findUnique', { centerId }) },
    orderItem: { findMany: answer('orderItem.findMany', items) },
    lesson: { findMany: answer('lesson.findMany', lessons) },
    progress: { findMany: answer('progress.findMany', done) },
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [StagesService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  const queryOf = (model: string) =>
    queries.find((q) => q.model === model)?.query;
  return {
    service: module.get<StagesService>(StagesService),
    models: () => queries.map((q) => q.model),
    queryOf,
  };
}

describe('The students of the academy (GET /stages/students)', () => {
  it('academy admins and super admins with a valid token; declared before GET /stages/:id', () => {
    const handler: unknown = Object.getOwnPropertyDescriptor(
      StagesController.prototype,
      'findStudents',
    )?.value;
    expect(Reflect.getMetadata('__guards__', handler as object)).toEqual([
      JwtAuthGuard,
      RolesGuard,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, handler as object)).toEqual([
      'CENTER_ADMIN',
      'SUPER_ADMIN',
    ]);
    const methods = Object.getOwnPropertyNames(StagesController.prototype);
    expect(methods.indexOf('findStudents')).toBeLessThan(
      methods.indexOf('findOne'),
    );
  });

  it('an academy admin: the PAID course orders of their academy only; a super admin: every academy', async () => {
    const own = await setup([], [], []);
    await expect(own.service.findStudents(adminA)).resolves.toEqual([]);
    expect(own.queryOf('orderItem.findMany')).toMatchObject({
      where: {
        order: { status: 'PAID' },
        stageId: { not: null },
        stage: { centerId: 'academy-1' },
      },
    });
    // No student yet: no other query
    expect(own.models()).toEqual(['user.findUnique', 'orderItem.findMany']);

    const all = await setup([], [], []);
    await all.service.findStudents(superAdmin);
    expect(all.queryOf('orderItem.findMany')).toMatchObject({
      where: { order: { status: 'PAID' }, stageId: { not: null } },
    });
    expect(
      (all.queryOf('orderItem.findMany') as { where: object }).where,
    ).not.toHaveProperty('stage');
  });

  it('each student once, the newest first, each course once with their progress', async () => {
    const { service, queryOf } = await setup(
      [
        item('2026-09-01', 'A', 'u1'),
        item('2026-10-01', 'B', 'u2'),
        item('2026-10-05', 'A', 'u2'),
        item('2026-10-06', 'A', 'u1'),
        item('2026-10-07', null, 'u1'),
      ],
      [
        { id: 'l1', module: { stageId: 'A' } },
        { id: 'l2', module: { stageId: 'A' } },
        { id: 'l3', module: { stageId: 'A' } },
        { id: 'l4', module: { stageId: 'A' } },
        { id: 'l5', module: { stageId: 'B' } },
      ],
      [
        { userId: 'u1', lessonId: 'l1', createdAt: day('2026-10-02') },
        { userId: 'u1', lessonId: 'l2', createdAt: day('2026-10-03') },
        // u1 did not buy course B: this lesson does not count
        { userId: 'u1', lessonId: 'l5', createdAt: day('2026-10-20') },
        { userId: 'u2', lessonId: 'l5', createdAt: day('2026-10-08') },
        { userId: 'u2', lessonId: 'l1', createdAt: day('2026-10-06') },
      ],
    );
    const students = await service.findStudents(adminA);
    expect(queryOf('lesson.findMany')).toEqual({
      where: { module: { stageId: { in: ['A', 'B'] } } },
      select: { id: true, module: { select: { stageId: true } } },
    });
    expect(queryOf('progress.findMany')).toMatchObject({
      where: {
        userId: { in: ['u1', 'u2'] },
        lesson: { module: { stageId: { in: ['A', 'B'] } } },
      },
    });
    const progress = (
      id: string,
      since: string,
      total: number,
      completed: number,
      percentage: number,
      last: string | null,
    ) => ({
      id,
      title: `Course ${id}`,
      status: 'ACTIVE',
      academy: 'Code Academy',
      since: day(since),
      totalLessons: total,
      completedLessons: completed,
      percentage,
      lastActivityAt: last === null ? null : day(last),
    });
    expect(students).toEqual([
      {
        ...person('u2', 'Youssef'),
        since: day('2026-10-01'),
        lastActivityAt: day('2026-10-08'),
        courses: [
          progress('B', '2026-10-01', 1, 1, 100, '2026-10-08'),
          progress('A', '2026-10-05', 4, 1, 25, '2026-10-06'),
        ],
      },
      {
        ...person('u1', 'Amira'),
        since: day('2026-09-01'),
        lastActivityAt: day('2026-10-03'),
        courses: [progress('A', '2026-09-01', 4, 2, 50, '2026-10-03')],
      },
    ]);
  });

  it('a course without lessons: 0%, not started', async () => {
    const { service } = await setup([item('2026-10-01', 'C', 'u1')], [], []);
    const [student] = await service.findStudents(adminA);
    expect(student.lastActivityAt).toBeNull();
    expect(
      student.courses.map((enrolled) => [
        enrolled.id,
        enrolled.totalLessons,
        enrolled.completedLessons,
        enrolled.percentage,
        enrolled.lastActivityAt,
      ]),
    ).toEqual([['C', 0, 0, 0, null]]);
  });

  it('an admin account without an academy: 403, nothing is read', async () => {
    const { service, models } = await setup([], [], [], null);
    await expect(service.findStudents(adminA)).rejects.toThrow(
      ForbiddenException,
    );
    expect(models()).toEqual(['user.findUnique']);
  });
});
