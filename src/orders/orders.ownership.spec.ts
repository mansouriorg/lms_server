import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';

// A fake Prisma that records every order query. Admin a1 belongs to
// academy-1.
async function setup() {
  const queries: unknown[] = [];
  const academies: Record<string, string> = { a1: 'academy-1' };
  const prisma = {
    order: {
      findMany: (query: unknown) => {
        queries.push(query);
        return Promise.resolve([]);
      },
    },
    user: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve({ centerId: academies[query.where.id] ?? null }),
    },
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [OrdersService, { provide: PrismaService, useValue: prisma }],
  }).compile();

  return { service: module.get<OrdersService>(OrdersService), queries };
}

describe('OrdersService: academy ownership (GET /orders/admin/all)', () => {
  it('center admin: only orders with a course or product of their academy', async () => {
    const { service, queries } = await setup();
    await service.getAllOrders({ id: 'a1', role: 'CENTER_ADMIN' });
    expect(queries[0]).toMatchObject({
      where: {
        items: {
          some: {
            OR: [
              { stage: { centerId: 'academy-1' } },
              { product: { centerId: 'academy-1' } },
            ],
          },
        },
      },
    });
  });

  it('super admin: every order', async () => {
    const { service, queries } = await setup();
    await service.getAllOrders({ id: 's1', role: 'SUPER_ADMIN' });
    expect(queries[0]).not.toHaveProperty('where.items');
  });
});
