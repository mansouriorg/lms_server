import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LessonsService } from './lessons.service';
import { PrismaService } from '../prisma/prisma.service';

const superAdmin = { id: 's1', role: 'SUPER_ADMIN' };
const adminA = { id: 'a1', role: 'CENTER_ADMIN' }; // academy-1
const adminB = { id: 'a2', role: 'CENTER_ADMIN' }; // academy-2
const newLesson = { title: 'Hooks', order: 2, moduleId: 'm1' };

// A fake Prisma. Module m1 is in a course of academy-1, m2 in a course of
// academy-2, and lesson l1 is in m1. Admin a1 belongs to academy-1, a2 to
// academy-2. Every database call is recorded by name.
async function setup() {
  const calls: string[] = [];
  const answer = (name: string, result: unknown) => () => {
    calls.push(name);
    return Promise.resolve(result);
  };
  const modules: Record<string, unknown> = {
    m1: { stage: { centerId: 'academy-1' } },
    m2: { stage: { centerId: 'academy-2' } },
  };
  const academies: Record<string, string> = {
    a1: 'academy-1',
    a2: 'academy-2',
  };
  const prisma = {
    module: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve(modules[query.where.id] ?? null),
    },
    lesson: {
      findUnique: answer('lesson.findUnique', { id: 'l1', moduleId: 'm1' }),
      create: answer('lesson.create', { id: 'l2' }),
      update: answer('lesson.update', { id: 'l1' }),
      delete: answer('lesson.delete', { id: 'l1' }),
    },
    user: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve({ centerId: academies[query.where.id] ?? null }),
    },
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [LessonsService, { provide: PrismaService, useValue: prisma }],
  }).compile();

  return { service: module.get<LessonsService>(LessonsService), calls };
}

describe('LessonsService: academy ownership (POST, PATCH, DELETE /lessons)', () => {
  it('center admin: adds, edits and deletes lessons of their own courses', async () => {
    const { service, calls } = await setup();
    await service.create(newLesson, adminA);
    await service.update('l1', { title: 'Hooks in depth' }, adminA);
    await service.remove('l1', adminA);
    expect(calls).toContain('lesson.create');
    expect(calls).toContain('lesson.update');
    expect(calls).toContain('lesson.delete');
  });

  it('center admin: cannot add a lesson to another academy course (403)', async () => {
    const { service, calls } = await setup();
    await expect(service.create(newLesson, adminB)).rejects.toThrow(
      ForbiddenException,
    );
    expect(calls).not.toContain('lesson.create');
  });

  it('center admin: cannot edit or delete another academy lesson (403)', async () => {
    const { service, calls } = await setup();
    await expect(
      service.update('l1', { title: 'Mine now' }, adminB),
    ).rejects.toThrow(ForbiddenException);
    await expect(service.remove('l1', adminB)).rejects.toThrow(
      ForbiddenException,
    );
    expect(calls).not.toContain('lesson.update');
    expect(calls).not.toContain('lesson.delete');
  });

  it('center admin: cannot move a lesson into another academy course (403)', async () => {
    const { service, calls } = await setup();
    await expect(
      service.update('l1', { moduleId: 'm2' }, adminA),
    ).rejects.toThrow(ForbiddenException);
    expect(calls).not.toContain('lesson.update');
  });

  it('unknown module when adding a lesson: 404', async () => {
    const { service } = await setup();
    const lost = { ...newLesson, moduleId: 'nope' };
    await expect(service.create(lost, adminA)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('super admin: can change lessons of every academy', async () => {
    const { service, calls } = await setup();
    await service.update('l1', { moduleId: 'm2' }, superAdmin);
    expect(calls).toContain('lesson.update');
  });
});
