import { Test, TestingModule } from '@nestjs/testing';
import { StagesController } from './stages.controller';
import { StagesService } from './stages.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// A course as the "My courses" query returns it: modules with lesson IDs.
function stage(id: string, lessonIds: string[][]) {
  return {
    id,
    title: `Course ${id}`,
    category: 'Web',
    level: null,
    center: { name: 'Code Academy' },
    modules: lessonIds.map((ids) => ({
      lessons: ids.map((lessonId) => ({ id: lessonId })),
    })),
  };
}

// A fake Prisma: the student's PAID order items (newest first) and the
// lessons they completed. Every query is recorded.
async function setup(items: unknown[], completed: string[]) {
  const queries: { model: string; query: unknown }[] = [];
  const answer = (model: string, result: unknown) => (query: unknown) => {
    queries.push({ model, query });
    return Promise.resolve(result);
  };
  const prisma = {
    orderItem: { findMany: answer('orderItem.findMany', items) },
    progress: {
      findMany: answer(
        'progress.findMany',
        completed.map((lessonId) => ({ lessonId })),
      ),
    },
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [StagesService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return { service: module.get<StagesService>(StagesService), queries };
}

describe('My courses (GET /stages/mine)', () => {
  it('needs a valid token, and is declared before GET /stages/:id', () => {
    const handler: unknown = Object.getOwnPropertyDescriptor(
      StagesController.prototype,
      'findMine',
    )?.value;
    expect(Reflect.getMetadata('__guards__', handler as object)).toEqual([
      JwtAuthGuard,
    ]);
    const methods = Object.getOwnPropertyNames(StagesController.prototype);
    expect(methods.indexOf('findMine')).toBeLessThan(
      methods.indexOf('findOne'),
    );
  });

  it('only the PAID course orders of this student (cancelled courses too: buyers keep access)', async () => {
    const { service, queries } = await setup([], []);
    await service.findMine('u1');
    expect(queries[0]).toMatchObject({
      model: 'orderItem.findMany',
      query: {
        where: {
          order: { userId: 'u1', status: 'PAID' },
          stageId: { not: null },
        },
      },
    });
    expect(queries[1]).toMatchObject({
      model: 'progress.findMany',
      query: { where: { userId: 'u1' } },
    });
  });

  it('each course once, with the lessons completed and the percentage', async () => {
    const a = stage('a', [
      ['l1', 'l2'],
      ['l3', 'l4'],
    ]);
    const b = stage('b', []);
    const { service } = await setup(
      [{ stage: a }, { stage: a }, { stage: b }, { stage: null }],
      ['l1', 'l4', 'x9'],
    );
    const courses = await service.findMine('u1');
    expect(courses).toEqual([
      {
        id: 'a',
        title: 'Course a',
        category: 'Web',
        level: null,
        center: { name: 'Code Academy' },
        totalLessons: 4,
        completedLessons: 2,
        percentage: 50,
      },
      {
        id: 'b',
        title: 'Course b',
        category: 'Web',
        level: null,
        center: { name: 'Code Academy' },
        totalLessons: 0,
        completedLessons: 0,
        percentage: 0,
      },
    ]);
  });
});
