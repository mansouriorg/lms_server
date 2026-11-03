import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LessonsService } from './lessons.service';
import { PrismaService } from '../prisma/prisma.service';

const VIDEO = 'https://videos.example.com/react-basics/lesson-1.mp4';
const student = { id: 'u1', role: 'STUDENT' };

type Options = { paid: boolean; price?: number; moduleExists?: boolean };

// A fake Prisma for one course (c1, module m1, lesson l1). `paid` says if the
// student has a PAID order for it. Every database call is recorded by name.
async function setup({ paid, price = 120, moduleExists = true }: Options) {
  const calls: string[] = [];
  const stage = { id: 'c1', centerId: 'academy-1', price, status: 'ACTIVE' };
  const answer = (name: string, result: unknown) => () => {
    calls.push(name);
    return Promise.resolve(result);
  };
  const prisma = {
    module: {
      findUnique: answer('module.findUnique', moduleExists ? { stage } : null),
    },
    lesson: {
      findMany: answer('lesson.findMany', [{ id: 'l1', videoUrl: VIDEO }]),
      findUnique: answer('lesson.findUnique', { module: { stage } }),
    },
    orderItem: { count: answer('orderItem.count', paid ? 1 : 0) },
    user: { findUnique: answer('user.findUnique', { centerId: null }) },
    progress: {
      findUnique: answer('progress.findUnique', null),
      create: answer('progress.create', { id: 'p1', completed: true }),
    },
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [LessonsService, { provide: PrismaService, useValue: prisma }],
  }).compile();

  return { service: module.get<LessonsService>(LessonsService), calls };
}

describe('LessonsService', () => {
  it('should be defined', async () => {
    const { service } = await setup({ paid: false });
    expect(service).toBeDefined();
  });

  describe('lessons of a module (GET /lessons/module/:moduleId)', () => {
    it('buyer: gets the lessons with their video links', async () => {
      const { service } = await setup({ paid: true });
      await expect(service.findAllByModule('m1', student)).resolves.toEqual([
        { id: 'l1', videoUrl: VIDEO },
      ]);
    });

    it('not bought: 403, and the lessons are never read', async () => {
      const { service, calls } = await setup({ paid: false });
      await expect(service.findAllByModule('m1', student)).rejects.toThrow(
        ForbiddenException,
      );
      expect(calls).not.toContain('lesson.findMany');
    });

    it('free course (price 0): open to every logged-in user', async () => {
      const { service } = await setup({ paid: false, price: 0 });
      await expect(service.findAllByModule('m1', student)).resolves.toEqual([
        { id: 'l1', videoUrl: VIDEO },
      ]);
    });

    it('unknown module: 404', async () => {
      const { service } = await setup({ paid: true, moduleExists: false });
      await expect(service.findAllByModule('m1', student)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('mark a lesson as completed (POST /lessons/:id/complete)', () => {
    it('buyer: the progress is recorded', async () => {
      const { service, calls } = await setup({ paid: true });
      const result = await service.markAsCompleted(student, 'l1');

      expect(result).toHaveProperty('progress');
      expect(calls).toContain('progress.create');
    });

    it('not bought: 403, and nothing is recorded', async () => {
      const { service, calls } = await setup({ paid: false });
      await expect(service.markAsCompleted(student, 'l1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(calls).not.toContain('progress.create');
    });
  });
});
