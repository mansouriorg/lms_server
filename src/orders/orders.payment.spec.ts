import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';

const superAdmin = { id: 's1', role: 'SUPER_ADMIN' };
const adminA = { id: 'a1', role: 'CENTER_ADMIN' }; // academy-1

const course = (centerId: string) => ({ stage: { centerId }, product: null });
const product = (centerId: string | null) => ({
  stage: null,
  product: { centerId },
});

// A fake Prisma with a few orders. updateMany only changes an order that is
// still PENDING, like the real database would. Every write is recorded.
async function setup() {
  const orders: Record<
    string,
    { status: string; couponId: string | null; items: unknown[] }
  > = {
    o1: { status: 'PENDING', couponId: 'k1', items: [course('academy-1')] },
    o2: {
      status: 'PENDING',
      couponId: null,
      items: [course('academy-1'), course('academy-2')],
    },
    o3: { status: 'PAID', couponId: null, items: [course('academy-1')] },
    o4: { status: 'REFUNDED', couponId: null, items: [course('academy-1')] },
    o5: { status: 'PENDING', couponId: null, items: [product(null)] },
  };
  const academies: Record<string, string> = { a1: 'academy-1' };
  const writes: { model: string; query: unknown }[] = [];
  const prisma = {
    order: {
      findUnique: (query: { where: { id: string } }) => {
        const order = orders[query.where.id];
        return Promise.resolve(order ? { id: query.where.id, ...order } : null);
      },
      updateMany: (query: { where: { id: string; status: string } }) => {
        writes.push({ model: 'order.updateMany', query });
        const order = orders[query.where.id];
        if (order && order.status === query.where.status) {
          order.status = 'PAID';
          return Promise.resolve({ count: 1 });
        }
        return Promise.resolve({ count: 0 });
      },
      create: (query: unknown) => {
        writes.push({ model: 'order.create', query });
        return Promise.resolve({ id: 'o9' });
      },
    },
    coupon: {
      findUnique: () =>
        Promise.resolve({
          id: 'k1',
          centerId: null,
          discountPercentage: 10,
          discountAmount: null,
          isActive: true,
          expiresAt: null,
          maxUses: 5,
          usedCount: 0,
        }),
      update: (query: unknown) => {
        writes.push({ model: 'coupon.update', query });
        return Promise.resolve({});
      },
    },
    stage: {
      findMany: () =>
        Promise.resolve([{ id: 'c1', price: 100, centerId: 'academy-1' }]),
    },
    orderItem: { findMany: () => Promise.resolve([]) },
    user: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve({ centerId: academies[query.where.id] ?? null }),
    },
  };
  // Runs the transaction callback with the same fake, like Prisma does.
  const withTransaction = {
    ...prisma,
    $transaction: (run: (tx: typeof prisma) => Promise<unknown>) => run(prisma),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      OrdersService,
      { provide: PrismaService, useValue: withTransaction },
    ],
  }).compile();

  const models = () => writes.map((w) => w.model);
  return {
    service: module.get<OrdersService>(OrdersService),
    writes,
    models,
    orders,
  };
}

describe('OrdersService: manual payment (PATCH /orders/:id/mark-paid)', () => {
  it('center admin: confirms a pending order of their academy; it becomes PAID', async () => {
    const { service, orders } = await setup();
    const result = await service.markPaid('o1', adminA);
    expect(result).toHaveProperty('order.status', 'PAID');
    expect(orders.o1.status).toBe('PAID');
  });

  it('the coupon use is counted when the order is paid', async () => {
    const { service, writes } = await setup();
    await service.markPaid('o1', adminA);
    expect(writes).toContainEqual({
      model: 'coupon.update',
      query: { where: { id: 'k1' }, data: { usedCount: { increment: 1 } } },
    });
  });

  it('creating an order no longer uses up the coupon', async () => {
    const { service, models } = await setup();
    await service.createOrder('u1', { stageIds: ['c1'], couponCode: 'k1' });
    expect(models()).toContain('order.create');
    expect(models()).not.toContain('coupon.update');
  });

  it('center admin: an order with another academy items needs a super admin (403)', async () => {
    const { service, models } = await setup();
    await expect(service.markPaid('o2', adminA)).rejects.toThrow(
      ForbiddenException,
    );
    expect(models()).not.toContain('order.updateMany');
  });

  it('center admin: an order with platform-wide items needs a super admin (403)', async () => {
    const { service } = await setup();
    await expect(service.markPaid('o5', adminA)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('super admin: confirms any pending order', async () => {
    const { service, orders } = await setup();
    await service.markPaid('o2', superAdmin);
    expect(orders.o2.status).toBe('PAID');
  });

  it('an order that is already paid: 409', async () => {
    const { service } = await setup();
    await expect(service.markPaid('o3', superAdmin)).rejects.toThrow(
      ConflictException,
    );
  });

  it('a refunded order cannot be marked as paid: 400', async () => {
    const { service } = await setup();
    await expect(service.markPaid('o4', superAdmin)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('unknown order: 404', async () => {
    const { service } = await setup();
    await expect(service.markPaid('nope', superAdmin)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('two admins at the same time: only one succeeds, the coupon is counted once', async () => {
    const { service, models } = await setup();
    const results = await Promise.allSettled([
      service.markPaid('o1', adminA),
      service.markPaid('o1', superAdmin),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect(models().filter((m) => m === 'coupon.update')).toHaveLength(1);
  });
});
