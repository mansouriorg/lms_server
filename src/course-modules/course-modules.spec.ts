import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CourseModulesController } from './course-modules.controller';
import { CourseModulesService } from './course-modules.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

const superAdmin = { id: 's1', role: 'SUPER_ADMIN' };
const adminA = { id: 'a1', role: 'CENTER_ADMIN' }; // academy-1
const adminB = { id: 'a2', role: 'CENTER_ADMIN' }; // academy-2

// A fake Prisma: course c1 (academy-1) has the modules m1, m2, m3, in that
// order; `lastOrder` is the highest module number (null: no module yet).
// Admin a1 belongs to academy-1, a2 to academy-2. Every write is recorded.
async function setup(lastOrder: number | null = 3) {
  const calls: { model: string; query: unknown }[] = [];
  const answer = (model: string, result: unknown) => (query: unknown) => {
    calls.push({ model, query });
    return Promise.resolve(result);
  };
  const academies: Record<string, string> = {
    a1: 'academy-1',
    a2: 'academy-2',
  };
  const modules = ['m1', 'm2', 'm3'];
  const prisma = {
    stage: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve(
          query.where.id === 'c1' ? { centerId: 'academy-1' } : null,
        ),
    },
    module: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve(
          modules.includes(query.where.id)
            ? {
                id: query.where.id,
                stageId: 'c1',
                stage: { centerId: 'academy-1' },
              }
            : null,
        ),
      findMany: answer(
        'module.findMany',
        modules.map((id) => ({ id })),
      ),
      aggregate: answer('module.aggregate', { _max: { order: lastOrder } }),
      create: answer('module.create', { id: 'm4' }),
      update: answer('module.update', {}),
      delete: answer('module.delete', {}),
    },
    user: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve({ centerId: academies[query.where.id] ?? null }),
    },
    $transaction: (operations: Promise<unknown>[]) => {
      calls.push({ model: '$transaction', query: operations.length });
      return Promise.all(operations);
    },
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      CourseModulesService,
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();
  const models = () => calls.map((call) => call.model);
  const queriesOf = (model: string) =>
    calls.filter((call) => call.model === model).map((call) => call.query);
  return {
    service: module.get<CourseModulesService>(CourseModulesService),
    models,
    queriesOf,
  };
}

describe('Course modules (POST, PATCH, DELETE /modules, POST /modules/:id/move)', () => {
  it('every route: a token and an admin role', () => {
    expect(Reflect.getMetadata('__guards__', CourseModulesController)).toEqual([
      JwtAuthGuard,
      RolesGuard,
    ]);
  });

  it('add: at the end of the course', async () => {
    const { service, queriesOf } = await setup(3);
    await service.create({ stageId: 'c1', title: 'Hooks' }, adminA);
    expect(queriesOf('module.create')).toEqual([
      { data: { stageId: 'c1', title: 'Hooks', order: 4 } },
    ]);
  });

  it('add: the first module of a course is number 1', async () => {
    const { service, queriesOf } = await setup(null);
    await service.create(
      { stageId: 'c1', title: 'Getting started' },
      superAdmin,
    );
    expect(queriesOf('module.create')).toEqual([
      { data: { stageId: 'c1', title: 'Getting started', order: 1 } },
    ]);
  });

  it('add: 404 for an unknown course, 403 for another academy', async () => {
    const { service, models } = await setup();
    await expect(
      service.create({ stageId: 'nope', title: 'Hooks' }, adminA),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.create({ stageId: 'c1', title: 'Hooks' }, adminB),
    ).rejects.toThrow(ForbiddenException);
    expect(models()).not.toContain('module.create');
  });

  it('rename and delete: only in their own academy', async () => {
    const { service, models, queriesOf } = await setup();
    await expect(
      service.update('m2', { title: 'Mine now' }, adminB),
    ).rejects.toThrow(ForbiddenException);
    await expect(service.remove('m2', adminB)).rejects.toThrow(
      ForbiddenException,
    );
    expect(models()).toEqual([]);

    await service.update('m2', { title: 'State and effects' }, adminA);
    await service.remove('m3', adminA);
    expect(queriesOf('module.update')).toEqual([
      { where: { id: 'm2' }, data: { title: 'State and effects' } },
    ]);
    expect(queriesOf('module.delete')).toEqual([{ where: { id: 'm3' } }]);
  });

  it('rename, delete or move an unknown module: 404', async () => {
    const { service, models } = await setup();
    await expect(
      service.update('nope', { title: 'X' }, adminA),
    ).rejects.toThrow(NotFoundException);
    await expect(service.remove('nope', adminA)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.move('nope', 'up', adminA)).rejects.toThrow(
      NotFoundException,
    );
    expect(models()).toEqual([]);
  });

  it('move up: the modules are numbered again, in one transaction', async () => {
    const { service, queriesOf } = await setup();
    await expect(service.move('m2', 'up', adminA)).resolves.toEqual({
      message: 'Module moved.',
      order: ['m2', 'm1', 'm3'],
    });
    expect(queriesOf('module.findMany')).toEqual([
      {
        where: { stageId: 'c1' },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        select: { id: true },
      },
    ]);
    expect(queriesOf('$transaction')).toEqual([3]);
    expect(queriesOf('module.update')).toEqual([
      { where: { id: 'm2' }, data: { order: 1 } },
      { where: { id: 'm1' }, data: { order: 2 } },
      { where: { id: 'm3' }, data: { order: 3 } },
    ]);
  });

  it('move: nothing is written for the last module moved down; 403 for another academy', async () => {
    const { service, models } = await setup();
    await expect(service.move('m3', 'down', adminA)).resolves.toEqual({
      message: 'The module is already there.',
      order: ['m1', 'm2', 'm3'],
    });
    await expect(service.move('m2', 'up', adminB)).rejects.toThrow(
      ForbiddenException,
    );
    expect(models()).toEqual(['module.findMany']);
  });

  it('the controller passes the direction to the service', async () => {
    const seen: unknown[][] = [];
    const service = {
      move: (...args: unknown[]) => {
        seen.push(args);
        return Promise.resolve({});
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CourseModulesController],
      providers: [{ provide: CourseModulesService, useValue: service }],
    }).compile();
    const controller = module.get<CourseModulesController>(
      CourseModulesController,
    );
    await controller.move('m2', { direction: 'down' }, adminA);
    expect(seen).toEqual([['m2', 'down', adminA]]);
  });
});
