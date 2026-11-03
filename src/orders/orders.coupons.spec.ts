import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';

// Two courses from two academies, and four coupons.
const courses: Record<string, unknown> = {
  c1: { id: 'c1', price: 100, centerId: 'academy-1' },
  c2: { id: 'c2', price: 200, centerId: 'academy-2' },
  // Prices with millimes
  c3: { id: 'c3', price: 199.999, centerId: 'academy-1' },
  c4: { id: 'c4', price: 0.1, centerId: 'academy-1' },
  c5: { id: 'c5', price: 0.2, centerId: 'academy-1' },
};
const coupon = (
  centerId: string | null,
  discountPercentage: number | null,
  discountAmount: number | null,
) => ({
  id: `coupon-${String(centerId)}`,
  centerId,
  discountPercentage,
  discountAmount,
  isActive: true,
  expiresAt: null,
  maxUses: null,
  usedCount: 0,
});
const coupons: Record<string, unknown> = {
  HALF_ALL: coupon(null, 50, null),
  HALF_A: coupon('academy-1', 50, null),
  TAKE150_A: coupon('academy-1', null, 150),
  HALF_C: coupon('academy-3', 50, null),
  FIFTEEN_ALL: coupon(null, 15, null),
};

// A fake Prisma for checkout. `totals` collects the totalAmount of every
// order the service creates.
async function setup() {
  const totals: number[] = [];
  const prisma = {
    stage: {
      findMany: (query: { where: { id: { in: string[] } } }) =>
        Promise.resolve(query.where.id.in.map((id) => courses[id])),
    },
    orderItem: { findMany: () => Promise.resolve([]) },
    coupon: {
      findUnique: (query: { where: { code: string } }) =>
        Promise.resolve(coupons[query.where.code] ?? null),
      update: () => Promise.resolve({}),
    },
    order: {
      create: (query: { data: { totalAmount: number } }) => {
        totals.push(query.data.totalAmount);
        return Promise.resolve({ id: 'o1' });
      },
    },
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [OrdersService, { provide: PrismaService, useValue: prisma }],
  }).compile();

  return { service: module.get<OrdersService>(OrdersService), totals };
}

// A cart with both courses (100 + 200 = 300).
const cart = (couponCode?: string) => ({ stageIds: ['c1', 'c2'], couponCode });

describe('OrdersService: coupons at checkout (POST /orders)', () => {
  it('no coupon: the full price', async () => {
    const { service, totals } = await setup();
    await service.createOrder('u1', cart());
    expect(totals).toEqual([300]);
  });

  it('platform-wide coupon: discounts the whole cart', async () => {
    const { service, totals } = await setup();
    await service.createOrder('u1', cart('HALF_ALL'));
    expect(totals).toEqual([150]);
  });

  it('academy coupon: only discounts that academy course', async () => {
    const { service, totals } = await setup();
    await service.createOrder('u1', cart('HALF_A'));
    expect(totals).toEqual([250]);
  });

  it('academy fixed amount: never more than that academy items', async () => {
    const { service, totals } = await setup();
    await service.createOrder('u1', cart('TAKE150_A'));
    expect(totals).toEqual([200]);
  });

  it('the total is in whole millimes', async () => {
    const { service, totals } = await setup();
    // 199.999 - 15% (29.99985, so 30.000)
    await service.createOrder('u1', {
      stageIds: ['c3'],
      couponCode: 'FIFTEEN_ALL',
    });
    // 0.1 + 0.2 is 0.30000000000000004 in JavaScript
    await service.createOrder('u1', { stageIds: ['c4', 'c5'] });
    expect(totals).toEqual([169.999, 0.3]);
  });

  it('academy coupon for none of the cart items: 400, and no order', async () => {
    const { service, totals } = await setup();
    await expect(service.createOrder('u1', cart('HALF_C'))).rejects.toThrow(
      BadRequestException,
    );
    expect(totals).toEqual([]);
  });
});
