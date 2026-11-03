import { Test, TestingModule } from '@nestjs/testing';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// What the store shows of a product's academy: its name and how to pay it
const ACADEMY = {
  select: {
    id: true,
    name: true,
    location: true,
    contactEmail: true,
    contactPhone: true,
  },
};

// The guards Nest runs before a controller method
function guardsOf(method: keyof ProductsController): unknown {
  const handler: unknown = Object.getOwnPropertyDescriptor(
    ProductsController.prototype,
    method,
  )?.value;
  return Reflect.getMetadata('__guards__', handler as object);
}

// A fake Prisma: every product query is recorded.
async function setup() {
  const calls: { method: string; query: unknown }[] = [];
  const record = (method: string, result: unknown) => (query: unknown) => {
    calls.push({ method, query });
    return Promise.resolve(result);
  };
  const prisma = {
    product: {
      findMany: record('findMany', []),
      findFirst: record('findFirst', { id: 'p1', title: 'Guide' }),
    },
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [ProductsService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return { service: module.get<ProductsService>(ProductsService), calls };
}

describe('The store of digital products (GET /products, GET /products/:id)', () => {
  it('open to everyone; managing products still needs an admin sign-in', () => {
    expect(guardsOf('findAllActive')).toBeUndefined();
    expect(guardsOf('findOne')).toBeUndefined();
    for (const method of [
      'create',
      'findAllForAdmin',
      'update',
      'toggleStatus',
      'remove',
    ] as const) {
      expect(guardsOf(method)).toContain(JwtAuthGuard);
    }
  });

  it('the list: visible products and their academy, never the download link', async () => {
    const { service, calls } = await setup();
    await service.findAll(false);
    expect(calls).toEqual([
      {
        method: 'findMany',
        query: {
          where: { isActive: true },
          omit: { fileUrl: true },
          include: { center: ACADEMY },
          orderBy: { createdAt: 'desc' },
        },
      },
    ]);
  });

  it('a product page: the same, for one visible product', async () => {
    const { service, calls } = await setup();
    await service.findOnePublic('p1');
    expect(calls).toEqual([
      {
        method: 'findFirst',
        query: {
          where: { id: 'p1', isActive: true },
          omit: { fileUrl: true },
          include: { center: ACADEMY },
        },
      },
    ]);
  });
});
