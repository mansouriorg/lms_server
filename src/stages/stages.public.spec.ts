import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StagesController } from './stages.controller';
import { StagesService } from './stages.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

const VIDEO = 'https://videos.example.com/react-basics/lesson-1.mp4';

// The guards Nest runs for a controller method, or for the whole controller
// (set by @UseGuards).
function guardsOf(method?: keyof StagesController): unknown {
  const target: unknown = method
    ? Object.getOwnPropertyDescriptor(StagesController.prototype, method)?.value
    : StagesController;
  return Reflect.getMetadata('__guards__', target as object);
}

// A fake Prisma that returns `stage` and records every query.
async function setup(stage: unknown) {
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
    orderItem: { count: answer('orderItem.count', 1) },
    user: { findUnique: answer('user.findUnique', { centerId: null }) },
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [StagesService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return { service: module.get<StagesService>(StagesService), queries };
}

function course(status: string, price: number) {
  return {
    id: 'c1',
    title: 'React basics',
    price,
    status,
    centerId: 'academy-1',
    modules: [
      {
        id: 'm1',
        title: 'Getting started',
        lessons: [{ id: 'l1', title: 'Your first component', videoUrl: VIDEO }],
      },
    ],
  };
}

describe('Public course catalog (GET /stages, GET /stages/:id)', () => {
  it('the catalog routes accept visitors; the controller has no guard of its own', () => {
    expect(guardsOf('findAll')).toEqual([OptionalJwtAuthGuard]);
    expect(guardsOf('findOne')).toEqual([OptionalJwtAuthGuard]);
    expect(guardsOf()).toBeUndefined();
  });

  it('creating, editing and deleting still need a token and an admin role', () => {
    for (const method of ['create', 'update', 'remove'] as const) {
      expect(guardsOf(method)).toEqual([JwtAuthGuard, RolesGuard]);
    }
  });

  it('visitors: no draft or cancelled courses, and no order counts', async () => {
    const { service, queries } = await setup(null);
    await service.findAll(null);
    expect(queries[0].query).toMatchObject({
      where: { status: { notIn: ['DRAFT', 'CANCELLED'] } },
      include: { _count: { select: { modules: true, orderItems: false } } },
    });
  });

  it('admins: the number of orders of each course', async () => {
    const { service, queries } = await setup(null);
    await service.findAll({ id: 's1', role: 'SUPER_ADMIN' });
    expect(queries[0].query).toMatchObject({
      include: { _count: { select: { orderItems: true } } },
    });
  });

  it('visitors: the outline of a course, never the video links, even when free', async () => {
    for (const price of [120, 0]) {
      const { service, queries } = await setup(course('ACTIVE', price));
      const result = await service.findOneForViewer('c1', null);
      expect(result.hasAccess).toBe(false);
      expect(result.modules[0].lessons[0]).toMatchObject({
        title: 'Your first component',
        videoUrl: null,
      });
      expect(queries.map((q) => q.model)).toEqual(['stage.findUnique']);
    }
  });

  it('visitors: a draft course does not exist (404)', async () => {
    const { service } = await setup(course('DRAFT', 120));
    await expect(service.findOneForViewer('c1', null)).rejects.toThrow(
      NotFoundException,
    );
  });
});
