import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Test, TestingModule } from '@nestjs/testing';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';

// A fake Prisma with one course (c1, 100), one platform-wide product (p1, 25)
// and one coupon stored as REACT20 (20% off). It records the coupon codes
// looked up and the totalAmount of every order created.
async function setup() {
  const totals: number[] = [];
  const codes: string[] = [];
  const react20 = {
    id: 'k1',
    code: 'REACT20',
    centerId: null,
    discountPercentage: 20,
    discountAmount: null,
    isActive: true,
    expiresAt: null,
    maxUses: null,
    usedCount: 0,
  };
  const prisma = {
    stage: {
      findMany: () =>
        Promise.resolve([{ id: 'c1', price: 100, centerId: 'academy-1' }]),
    },
    product: {
      findMany: () =>
        Promise.resolve([
          { id: 'p1', price: 25, centerId: null, isActive: true },
        ]),
    },
    orderItem: { findMany: () => Promise.resolve([]) },
    coupon: {
      findUnique: (query: { where: { code: string } }) => {
        codes.push(query.where.code);
        return Promise.resolve(query.where.code === 'REACT20' ? react20 : null);
      },
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

  return { service: module.get<OrdersService>(OrdersService), totals, codes };
}

describe('OrdersService: checkout fixes (POST /orders)', () => {
  it('a cart with only digital products is accepted', async () => {
    const { service, totals } = await setup();
    await service.createOrder('u1', { productIds: ['p1'] });
    expect(totals).toEqual([25]);
  });

  it('the coupon code works in any letter case, with spaces around it', async () => {
    const { service, totals, codes } = await setup();
    await service.createOrder('u1', {
      stageIds: ['c1'],
      couponCode: ' react20 ',
    });
    expect(codes).toEqual(['REACT20']);
    expect(totals).toEqual([80]);
  });

  it('validation: a products-only cart passes; a course ID must be text', async () => {
    const productsOnly = plainToInstance(CreateOrderDto, {
      productIds: ['p1'],
    });
    await expect(validate(productsOnly)).resolves.toHaveLength(0);

    const wrongIds = plainToInstance(CreateOrderDto, { stageIds: [42] });
    await expect(validate(wrongIds)).resolves.toHaveLength(1);
  });
});
