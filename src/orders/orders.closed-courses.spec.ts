import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';

type StageQuery = {
  where: { id: { in: string[] }; status?: { notIn: string[] } };
};

// A fake database: an open course (c1), a full one (f1), a finished one (k1)
// and a cancelled one (x1). The student owns nothing and has no order
// waiting for payment. Every created order is recorded.
async function setup() {
  const created: unknown[] = [];
  const stages = [
    {
      id: 'c1',
      title: 'React basics',
      price: 100,
      centerId: 'academy-1',
      status: 'ACTIVE',
    },
    {
      id: 'f1',
      title: 'Node.js APIs',
      price: 90,
      centerId: 'academy-1',
      status: 'FULL',
    },
    {
      id: 'k1',
      title: 'Design 101',
      price: 60,
      centerId: 'academy-1',
      status: 'COMPLETED',
    },
    {
      id: 'x1',
      title: 'Old course',
      price: 50,
      centerId: 'academy-1',
      status: 'CANCELLED',
    },
  ];
  const prisma = {
    stage: {
      findMany: (query: StageQuery) =>
        Promise.resolve(
          stages.filter(
            (stage) =>
              query.where.id.in.includes(stage.id) &&
              (query.where.status?.notIn ?? []).includes(stage.status) ===
                false,
          ),
        ),
    },
    orderItem: { findMany: () => Promise.resolve([]) },
    order: {
      create: (query: unknown) => {
        created.push(query);
        return Promise.resolve({ id: 'o1' });
      },
    },
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [OrdersService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return { service: module.get<OrdersService>(OrdersService), created };
}

describe('OrdersService: full and finished courses (POST /orders)', () => {
  it('a full or finished course cannot be ordered (409, with its title)', async () => {
    const { service, created } = await setup();
    const refusal: unknown = await service
      .createOrder('u1', { stageIds: ['f1'] })
      .catch((error: unknown) => error);
    expect((refusal as ConflictException).getResponse()).toMatchObject({
      statusCode: 409,
      message: 'Node.js APIs is full: it cannot be ordered anymore.',
    });
    await expect(
      service.createOrder('u1', { stageIds: ['c1', 'k1'] }),
    ).rejects.toThrow(ConflictException);
    expect(created).toHaveLength(0);
  });

  it('a cancelled course is still unknown (404); an open course can be ordered', async () => {
    const { service, created } = await setup();
    await expect(
      service.createOrder('u1', { stageIds: ['x1'] }),
    ).rejects.toThrow(NotFoundException);
    await service.createOrder('u1', { stageIds: ['c1'] });
    expect(created).toHaveLength(1);
  });
});
