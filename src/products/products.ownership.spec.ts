import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';

const superAdmin = { id: 's1', role: 'SUPER_ADMIN' };
const adminA = { id: 'a1', role: 'CENTER_ADMIN' }; // academy-1
const adminB = { id: 'a2', role: 'CENTER_ADMIN' }; // academy-2

// A fake Prisma: product p1 belongs to academy-1, p0 is platform-wide. Admin
// a1 belongs to academy-1, a2 to academy-2. Every query is recorded.
async function setup() {
  const queries: { model: string; query: unknown }[] = [];
  const record = (model: string, result: unknown) => (query: unknown) => {
    queries.push({ model, query });
    return Promise.resolve(result);
  };
  const products: Record<string, unknown> = {
    p1: { id: 'p1', centerId: 'academy-1', isActive: true },
    p0: { id: 'p0', centerId: null, isActive: true },
  };
  const academies: Record<string, string> = {
    a1: 'academy-1',
    a2: 'academy-2',
  };
  const prisma = {
    product: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve(products[query.where.id] ?? null),
      create: record('product.create', { id: 'p2' }),
      findMany: record('product.findMany', []),
      update: record('product.update', { id: 'p1', isActive: false }),
      delete: record('product.delete', { id: 'p1' }),
    },
    // Nobody ordered these products (products.delete.spec.ts covers that)
    orderItem: {
      count: record('orderItem.count', 0),
    },
    user: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve({ centerId: academies[query.where.id] ?? null }),
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

const newProduct = {
  title: 'Node cheat sheet',
  price: 25,
  fileUrl: 'https://files.example.com/node.pdf',
};

describe('ProductsService: academy ownership', () => {
  it('center admin: a new product belongs to their academy', async () => {
    const { service, queryOf } = await setup();
    await service.create(newProduct, adminA);
    expect(queryOf('product.create')).toMatchObject({
      data: { centerId: 'academy-1' },
    });
  });

  it('super admin: a new product is platform-wide', async () => {
    const { service, queryOf } = await setup();
    await service.create(newProduct, superAdmin);
    expect(queryOf('product.create')).toMatchObject({
      data: { centerId: null },
    });
  });

  it('admin catalog: a center admin only sees their academy products', async () => {
    const { service, queryOf } = await setup();
    await service.findAllForAdmin(adminA);
    expect(queryOf('product.findMany')).toMatchObject({
      where: { centerId: 'academy-1' },
    });
  });

  it('admin catalog: a super admin sees every product', async () => {
    const { service, queryOf } = await setup();
    await service.findAllForAdmin(superAdmin);
    expect(queryOf('product.findMany')).not.toHaveProperty('where.centerId');
  });

  it('center admin: pauses and deletes their own academy product', async () => {
    const { service, models } = await setup();
    await service.toggleStatus('p1', adminA);
    await service.remove('p1', adminA);
    expect(models()).toContain('product.update');
    expect(models()).toContain('product.delete');
  });

  it('center admin: cannot touch another academy product (403)', async () => {
    const { service, models } = await setup();
    await expect(service.toggleStatus('p1', adminB)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.remove('p1', adminB)).rejects.toThrow(
      ForbiddenException,
    );
    expect(models()).not.toContain('product.update');
    expect(models()).not.toContain('product.delete');
  });

  it('center admin: cannot touch a platform-wide product (403)', async () => {
    const { service, models } = await setup();
    await expect(service.remove('p0', adminA)).rejects.toThrow(
      ForbiddenException,
    );
    expect(models()).not.toContain('product.delete');
  });

  it('super admin: can change every product', async () => {
    const { service, models } = await setup();
    await service.remove('p0', superAdmin);
    expect(models()).toContain('product.delete');
  });
});
