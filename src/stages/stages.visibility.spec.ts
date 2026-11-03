import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StagesService } from './stages.service';
import { CentersService } from '../centers/centers.service';
import { PrismaService } from '../prisma/prisma.service';

const VIDEO = 'https://videos.example.com/react/lesson-1.mp4';
const buyer = { id: 'u1', role: 'STUDENT' };
const student = { id: 'u2', role: 'STUDENT' };
const otherAdmin = { id: 'a2', role: 'CENTER_ADMIN' }; // academy-2

// Course c1 of academy-1, cancelled after student u1 bought it.
const cancelled = {
  id: 'c1',
  title: 'React basics',
  price: 120,
  status: 'CANCELLED',
  centerId: 'academy-1',
  modules: [{ id: 'm1', lessons: [{ id: 'l1', videoUrl: VIDEO }] }],
};

// A fake Prisma: u1 has a PAID order for c1; admin a2 belongs to academy-2.
// Every query is recorded.
async function setup() {
  const queries: { model: string; query: unknown }[] = [];
  const answer = (model: string, result: unknown) => (query: unknown) => {
    queries.push({ model, query });
    return Promise.resolve(result);
  };
  const prisma = {
    stage: {
      findUnique: answer('stage.findUnique', cancelled),
      findMany: answer('stage.findMany', []),
    },
    center: { findUnique: answer('center.findUnique', { id: 'academy-1' }) },
    orderItem: {
      count: (query: { where: { order: { userId: string } } }) => {
        queries.push({ model: 'orderItem.count', query });
        return Promise.resolve(query.where.order.userId === 'u1' ? 1 : 0);
      },
      findMany: answer('orderItem.findMany', [
        {
          stage: {
            id: 'c1',
            title: 'React basics',
            status: 'CANCELLED',
            category: null,
            level: null,
            center: { name: 'Code Academy' },
            modules: [{ lessons: [{ id: 'l1' }] }],
          },
        },
      ]),
    },
    progress: { findMany: answer('progress.findMany', []) },
    user: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve({
          centerId: query.where.id === 'a2' ? 'academy-2' : null,
        }),
    },
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      StagesService,
      CentersService,
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();
  const queryOf = (model: string) =>
    queries.find((query) => query.model === model)?.query;
  return {
    stages: module.get<StagesService>(StagesService),
    centers: module.get<CentersService>(CentersService),
    queryOf,
  };
}

describe('Hidden courses: buyers keep access, other academies do not see them', () => {
  it('GET /stages/:id: the buyer of a cancelled course still opens it, with the videos', async () => {
    const { stages } = await setup();
    const course = await stages.findOneForViewer('c1', buyer);
    expect(course.hasAccess).toBe(true);
    expect(course.modules[0].lessons[0]).toMatchObject({ videoUrl: VIDEO });
  });

  it('GET /stages/:id: for other students and other academies, it does not exist (404)', async () => {
    const { stages } = await setup();
    await expect(stages.findOneForViewer('c1', student)).rejects.toThrow(
      NotFoundException,
    );
    await expect(stages.findOneForViewer('c1', otherAdmin)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('My courses: every course the student paid for, also a cancelled one, with its status', async () => {
    const { stages, queryOf } = await setup();
    await expect(stages.findMine('u1')).resolves.toMatchObject([
      { id: 'c1', status: 'CANCELLED', totalLessons: 1 },
    ]);
    expect(queryOf('orderItem.findMany')).toMatchObject({
      where: {
        order: { userId: 'u1', status: 'PAID' },
        stageId: { not: null },
      },
    });
  });

  it('the catalog and the academy page: an admin of another academy only sees its published courses', async () => {
    const { stages, centers, queryOf } = await setup();
    const own = {
      OR: [
        { status: { notIn: ['DRAFT', 'CANCELLED'] } },
        { centerId: 'academy-2' },
      ],
    };
    await stages.findAll(otherAdmin);
    expect(queryOf('stage.findMany')).toMatchObject({
      where: own,
      include: { _count: { select: { orderItems: false } } },
    });
    await centers.findOne('academy-1', otherAdmin);
    expect(queryOf('center.findUnique')).toMatchObject({
      include: { stages: { where: own } },
    });
  });
});
