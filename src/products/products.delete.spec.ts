import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';

const adminA = { id: 'a1', role: 'CENTER_ADMIN' }; // academy-1
const adminB = { id: 'a2', role: 'CENTER_ADMIN' }; // academy-2

// A fake Prisma: products p1 (ordered twice) and p2 (never ordered), both of
// academy-1. Every count and delete is recorded.
async function setup() {
  const queries: { model: string; query: unknown }[] = [];
  const ordered: Record<string, number> = { p1: 2, p2: 0 };
  const prisma = {
    product: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve({
          id: query.where.id,
          centerId: 'academy-1',
          isActive: true,
        }),
      delete: (query: unknown) => {
        queries.push({ model: 'product.delete', query });
        return Promise.resolve({ id: 'p2' });
      },
    },
    orderItem: {
      count: (query: { where: { productId: string } }) => {
        queries.push({ model: 'orderItem.count', query });
        return Promise.resolve(ordered[query.where.productId] ?? 0);
      },
    },
    user: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve({
          centerId: query.where.id === 'a1' ? 'academy-1' : 'academy-2',
        }),
    },
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [ProductsService, { provide: PrismaService, useValue: prisma }],
  }).compile();

  const models = () => queries.map((q) => q.model);
  const queryOf = (model: string) =>
    queries.find((q) => q.model === model)?.query;
  return {
    service: module.get<ProductsService>(ProductsService),
    models,
    queryOf,
  };
}

describe('Deleting a digital product (DELETE /products/:id)', () => {
  it('ordered: 409 that says to hide it instead; nothing is deleted', async () => {
    const { service, models, queryOf } = await setup();
    const error: unknown = await service
      .remove('p1', adminA)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toEqual({
      statusCode: 409,
      message:
        'This product was ordered, so it cannot be deleted: its buyers would lose their download link. Hide it from the store instead.',
      error: 'Conflict',
    });
    expect(queryOf('orderItem.count')).toEqual({ where: { productId: 'p1' } });
    expect(models()).not.toContain('product.delete');
  });

  it('never ordered: deleted', async () => {
    const { service, queryOf } = await setup();
    await expect(service.remove('p2', adminA)).resolves.toEqual({
      message: 'Product deleted.',
    });
    expect(queryOf('product.delete')).toEqual({ where: { id: 'p2' } });
  });

  it('another academy: 403 before its orders are even counted', async () => {
    const { service, models } = await setup();
    await expect(service.remove('p1', adminB)).rejects.toThrow(
      ForbiddenException,
    );
    expect(models()).toEqual([]);
  });
});
