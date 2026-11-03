import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StagesController } from './stages.controller';
import { StagesService } from './stages.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

const superAdmin = { id: 's1', role: 'SUPER_ADMIN' };
const adminA = { id: 'a1', role: 'CENTER_ADMIN' }; // academy-1
const adminB = { id: 'a2', role: 'CENTER_ADMIN' }; // academy-2

const VIDEO = 'https://videos.example.com/react/lesson-1.mp4';
const course = {
  id: 'c1',
  title: 'React basics',
  price: 120,
  status: 'DRAFT',
  centerId: 'academy-1',
  center: { name: 'Code Academy' },
  modules: [{ id: 'm1', lessons: [{ id: 'l1', videoUrl: VIDEO }] }],
};

// The guards Nest runs for a controller method (set by @UseGuards).
function guardsOf(method: keyof StagesController): unknown {
  const handler: unknown = Object.getOwnPropertyDescriptor(
    StagesController.prototype,
    method,
  )?.value;
  return Reflect.getMetadata('__guards__', handler as object);
}

// A fake Prisma: course c1 belongs to academy-1 and has `orders` order lines.
// Admin a1 belongs to academy-1, a2 to academy-2. Every call is recorded.
async function setup(orders = 0) {
  const calls: { model: string; query: unknown }[] = [];
  const answer = (model: string, result: unknown) => (query: unknown) => {
    calls.push({ model, query });
    return Promise.resolve(result);
  };
  const academies: Record<string, string> = {
    a1: 'academy-1',
    a2: 'academy-2',
  };
  const prisma = {
    stage: {
      findMany: answer('stage.findMany', []),
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve(query.where.id === 'c1' ? course : null),
      create: answer('stage.create', { id: 'c2' }),
      delete: answer('stage.delete', course),
    },
    orderItem: { count: answer('orderItem.count', orders) },
    user: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve({ centerId: academies[query.where.id] ?? null }),
    },
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [StagesService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  const models = () => calls.map((call) => call.model);
  return { service: module.get<StagesService>(StagesService), calls, models };
}

describe('Course management (admin)', () => {
  it('GET /stages/manage and /stages/:id/manage: a token and an admin role', () => {
    expect(guardsOf('findManaged')).toEqual([JwtAuthGuard, RolesGuard]);
    expect(guardsOf('findOneManaged')).toEqual([JwtAuthGuard, RolesGuard]);
    const methods = Object.getOwnPropertyNames(StagesController.prototype);
    expect(methods.indexOf('findManaged')).toBeLessThan(
      methods.indexOf('findOne'),
    );
  });

  it('the list: every course of the academy, with paid enrollments', async () => {
    const { service, calls } = await setup();
    await service.findManaged(adminA);
    expect(calls[0]).toMatchObject({
      model: 'stage.findMany',
      query: {
        where: { centerId: 'academy-1' },
        include: {
          _count: {
            select: {
              modules: true,
              orderItems: { where: { order: { status: 'PAID' } } },
            },
          },
        },
      },
    });
  });

  it('the list for a super admin: every academy', async () => {
    const { service, calls } = await setup();
    await service.findManaged(superAdmin);
    expect(calls[0]).toMatchObject({ query: { where: {} } });
  });

  it('the editor: the full course for its academy, 403 for another one, 404 if unknown', async () => {
    const { service } = await setup();
    await expect(service.findOneManaged('c1', adminA)).resolves.toMatchObject({
      modules: [{ lessons: [{ videoUrl: VIDEO }] }],
      _count: { modules: 1, orderItems: 0 },
    });
    await expect(service.findOneManaged('c1', adminB)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.findOneManaged('nope', adminA)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('create: a center admin may leave out the academy and the instructor', async () => {
    const { service, calls } = await setup();
    await service.create({ title: 'Node basics', price: 90 }, adminA);
    expect(calls.find((call) => call.model === 'stage.create')).toMatchObject({
      query: { data: { centerId: 'academy-1', instructorId: 'a1' } },
    });
  });

  it('create: a super admin must choose the academy (400)', async () => {
    const { service, models } = await setup();
    await expect(
      service.create({ title: 'Node basics', price: 90 }, superAdmin),
    ).rejects.toThrow(BadRequestException);
    expect(models()).not.toContain('stage.create');
    await service.create(
      { title: 'Node basics', price: 90, centerId: 'academy-2' },
      superAdmin,
    );
    expect(models()).toContain('stage.create');
  });

  it('delete: a course that was ordered is kept (409); set it to Cancelled instead', async () => {
    const { service, models } = await setup(2);
    await expect(service.remove('c1', adminA)).rejects.toThrow(
      ConflictException,
    );
    expect(models()).not.toContain('stage.delete');
  });

  it('the editor shows how many students paid for the course', async () => {
    const { service, calls } = await setup(3);
    await expect(service.findOneManaged('c1', adminA)).resolves.toMatchObject({
      _count: { orderItems: 3 },
    });
    expect(
      calls.find((call) => call.model === 'orderItem.count'),
    ).toMatchObject({
      query: { where: { stageId: 'c1', order: { status: 'PAID' } } },
    });
  });

  it('delete: a course without orders is deleted', async () => {
    const { service, models } = await setup(0);
    await service.remove('c1', adminA);
    expect(models()).toContain('stage.delete');
  });
});
