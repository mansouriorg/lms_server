import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StagesService } from './stages.service';
import { PrismaService } from '../prisma/prisma.service';

const VIDEO = 'https://videos.example.com/react-basics/lesson-1.mp4';
const student = { id: 'u1', role: 'STUDENT' };
const superAdmin = { id: 's1', role: 'SUPER_ADMIN' };

// A course as the database returns it for the course page.
function course(status: string) {
  return {
    id: 'c1',
    title: 'React basics',
    price: 120,
    status,
    centerId: 'academy-1',
    center: { name: 'Code Academy' },
    modules: [
      {
        id: 'm1',
        title: 'Getting started',
        lessons: [{ id: 'l1', title: 'Your first component', videoUrl: VIDEO }],
      },
    ],
  };
}

// A fake Prisma: `stage` is what the course lookup returns, `paidOrders` is
// how many PAID orders the viewer has for it. Every query is recorded.
async function setup(stage: unknown, paidOrders: number) {
  const queries: { model: string; query: unknown }[] = [];
  const answer = (model: string, result: unknown) => (query: unknown) => {
    queries.push({ model, query });
    return Promise.resolve(result);
  };
  const prisma = {
    stage: {
      findMany: answer('stage.findMany', []),
      findUnique: answer('stage.findUnique', stage),
    },
    orderItem: { count: answer('orderItem.count', paidOrders) },
    user: { findUnique: answer('user.findUnique', { centerId: null }) },
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [StagesService, { provide: PrismaService, useValue: prisma }],
  }).compile();

  return { service: module.get<StagesService>(StagesService), queries };
}

describe('StagesService', () => {
  it('should be defined', async () => {
    const { service } = await setup(null, 0);
    expect(service).toBeDefined();
  });

  describe('catalog (GET /stages)', () => {
    it('students: no draft or cancelled courses', async () => {
      const { service, queries } = await setup(null, 0);
      await service.findAll(student);

      expect(queries[0].model).toBe('stage.findMany');
      expect(queries[0].query).toMatchObject({
        where: { status: { notIn: ['DRAFT', 'CANCELLED'] } },
      });
    });

    it('admins: every course', async () => {
      const { service, queries } = await setup(null, 0);
      await service.findAll(superAdmin);

      expect(queries[0].query).not.toHaveProperty('where.status');
    });
  });

  describe('course page (GET /stages/:id)', () => {
    it('buyer: the full course, with the video links', async () => {
      const { service } = await setup(course('ACTIVE'), 1);
      const result = await service.findOneForViewer('c1', student);

      expect(result).toHaveProperty('hasAccess', true);
      expect(result.modules[0].lessons[0]).toHaveProperty('videoUrl', VIDEO);
    });

    it('not bought: the outline only, without video links', async () => {
      const { service } = await setup(course('ACTIVE'), 0);
      const result = await service.findOneForViewer('c1', student);

      expect(result).toHaveProperty('hasAccess', false);
      expect(result.modules[0].lessons[0]).toEqual({
        id: 'l1',
        title: 'Your first component',
        videoUrl: null,
      });
      expect(JSON.stringify(result)).not.toContain(VIDEO);
    });

    it('does not change the data it received', async () => {
      const stage = course('ACTIVE');
      const { service } = await setup(stage, 0);
      await service.findOneForViewer('c1', student);

      expect(stage.modules[0].lessons[0].videoUrl).toBe(VIDEO);
    });

    it('students who did not buy it: a draft course does not exist (404)', async () => {
      const { service } = await setup(course('DRAFT'), 0);
      await expect(service.findOneForViewer('c1', student)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('admins: can open a draft course', async () => {
      const { service } = await setup(course('DRAFT'), 0);
      const result = await service.findOneForViewer('c1', superAdmin);

      expect(result).toHaveProperty('hasAccess', true);
    });

    it('unknown course: 404', async () => {
      const { service } = await setup(null, 0);
      await expect(service.findOneForViewer('c1', student)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
