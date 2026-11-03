import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StagesService } from './stages.service';
import { PrismaService } from '../prisma/prisma.service';

const superAdmin = { id: 's1', role: 'SUPER_ADMIN' };
const adminA = { id: 'a1', role: 'CENTER_ADMIN' }; // academy-1
const adminB = { id: 'a2', role: 'CENTER_ADMIN' }; // academy-2

// A course of academy-1, as the database returns it.
const course = { id: 'c1', title: 'React basics', centerId: 'academy-1' };
const newCourse = {
  title: 'Node basics',
  price: 90,
  instructorId: 'a1',
  centerId: 'academy-1',
};

// A fake Prisma: every course lookup returns the course above. Admin a1
// belongs to academy-1, a2 to academy-2. Every database call is recorded.
async function setup() {
  const calls: string[] = [];
  const answer = (name: string, result: unknown) => () => {
    calls.push(name);
    return Promise.resolve(result);
  };
  const academies: Record<string, string> = {
    a1: 'academy-1',
    a2: 'academy-2',
  };
  const prisma = {
    stage: {
      findUnique: answer('stage.findUnique', course),
      create: answer('stage.create', { id: 'c2' }),
      update: answer('stage.update', course),
      delete: answer('stage.delete', course),
    },
    // No order for this course, so it may be deleted
    orderItem: { count: answer('orderItem.count', 0) },
    user: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve({ centerId: academies[query.where.id] ?? null }),
    },
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [StagesService, { provide: PrismaService, useValue: prisma }],
  }).compile();

  return { service: module.get<StagesService>(StagesService), calls };
}

describe('StagesService: academy ownership (POST, PATCH, DELETE /stages)', () => {
  it('center admin: creates a course for their own academy', async () => {
    const { service, calls } = await setup();
    await expect(service.create(newCourse, adminA)).resolves.toHaveProperty(
      'stage',
    );
    expect(calls).toContain('stage.create');
  });

  it('center admin: cannot create a course for another academy (403)', async () => {
    const { service, calls } = await setup();
    const other = { ...newCourse, centerId: 'academy-2' };
    await expect(service.create(other, adminA)).rejects.toThrow(
      ForbiddenException,
    );
    expect(calls).not.toContain('stage.create');
  });

  it('center admin: edits and deletes their own academy course', async () => {
    const { service, calls } = await setup();
    await service.update('c1', { title: 'React, the basics' }, adminA);
    await service.remove('c1', adminA);
    expect(calls).toContain('stage.update');
    expect(calls).toContain('stage.delete');
  });

  it('center admin: cannot edit or delete another academy course (403)', async () => {
    const { service, calls } = await setup();
    await expect(
      service.update('c1', { title: 'Mine now' }, adminB),
    ).rejects.toThrow(ForbiddenException);
    await expect(service.remove('c1', adminB)).rejects.toThrow(
      ForbiddenException,
    );
    expect(calls).not.toContain('stage.update');
    expect(calls).not.toContain('stage.delete');
  });

  it('center admin: cannot move their course to another academy (403)', async () => {
    const { service, calls } = await setup();
    await expect(
      service.update('c1', { centerId: 'academy-2' }, adminA),
    ).rejects.toThrow(ForbiddenException);
    expect(calls).not.toContain('stage.update');
  });

  it('super admin: can change any course', async () => {
    const { service, calls } = await setup();
    await service.update('c1', { centerId: 'academy-2' }, superAdmin);
    expect(calls).toContain('stage.update');
  });
});
