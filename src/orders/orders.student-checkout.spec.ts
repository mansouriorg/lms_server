import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';

type StageQuery = {
  where: { id: { in: string[] }; status?: { notIn: string[] } };
};
type ItemQuery = {
  where: {
    order: { status: string };
    stageId?: { in: string[] };
    productId?: { in: string[] };
  };
};

// A fake database: active courses c1 and c2, a draft (d1) and a cancelled
// course (x1), and the digital product p2. The student already has an order
// waiting for payment (PENDING) for c2 and for p2. The fake applies the same
// filters as the real database; every created order is recorded.
async function setup() {
  const created: unknown[] = [];
  const stages = [
    { id: 'c1', price: 100, centerId: 'academy-1', status: 'ACTIVE' },
    { id: 'c2', price: 80, centerId: 'academy-1', status: 'ACTIVE' },
    { id: 'd1', price: 50, centerId: 'academy-1', status: 'DRAFT' },
    { id: 'x1', price: 50, centerId: 'academy-1', status: 'CANCELLED' },
  ];
  const pendingCourses = ['c2'];
  const pendingProducts = ['p2'];
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
    product: {
      findMany: () =>
        Promise.resolve([
          { id: 'p2', price: 25, centerId: null, isActive: true },
        ]),
    },
    orderItem: {
      findMany: (query: ItemQuery) => {
        if (query.where.order.status !== 'PENDING') {
          return Promise.resolve([]);
        }
        const courses = (query.where.stageId?.in ?? []).filter((id) =>
          pendingCourses.includes(id),
        );
        const products = (query.where.productId?.in ?? []).filter((id) =>
          pendingProducts.includes(id),
        );
        return Promise.resolve([...courses, ...products].map((id) => ({ id })));
      },
    },
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

describe('OrdersService: what a student can order (POST /orders)', () => {
  it('an active course can be ordered; the order waits for payment', async () => {
    const { service, created } = await setup();
    const result = await service.createOrder('u1', { stageIds: ['c1'] });
    expect(result).toHaveProperty('order.id', 'o1');
    expect(created).toHaveLength(1);
    expect(created[0]).toHaveProperty('data.status', 'PENDING');
  });

  it('a draft or cancelled course cannot be ordered (404, like for an unknown course)', async () => {
    const { service, created } = await setup();
    await expect(
      service.createOrder('u1', { stageIds: ['d1'] }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.createOrder('u1', { stageIds: ['x1'] }),
    ).rejects.toThrow(NotFoundException);
    expect(created).toHaveLength(0);
  });

  it('a second order for a course still waiting for payment is refused (409)', async () => {
    const { service, created } = await setup();
    await expect(
      service.createOrder('u1', { stageIds: ['c2'] }),
    ).rejects.toThrow(ConflictException);
    expect(created).toHaveLength(0);
  });

  it('the same for a digital product still waiting for payment (409)', async () => {
    const { service, created } = await setup();
    await expect(
      service.createOrder('u1', { productIds: ['p2'] }),
    ).rejects.toThrow(ConflictException);
    expect(created).toHaveLength(0);
  });
});
