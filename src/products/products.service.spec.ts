import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';

// A product as the database stores it, with its paid download link.
const product = {
  id: 'p1',
  title: 'React cheat sheet',
  description: null,
  price: 25,
  fileUrl: 'https://files.example.com/react-cheat-sheet.pdf',
  isActive: true,
};

// A fake Prisma: every product query resolves to `result` and is recorded,
// so a test can check exactly what the service asked the database for.
function fakePrisma(result: unknown) {
  const calls: { method: string; query: unknown }[] = [];
  const record = (method: string) => (query: unknown) => {
    calls.push({ method, query });
    return Promise.resolve(result);
  };
  return {
    calls,
    product: {
      findMany: record('findMany'),
      findFirst: record('findFirst'),
      findUnique: record('findUnique'),
    },
  };
}

async function setup(result: unknown) {
  const prisma = fakePrisma(result);
  const module: TestingModule = await Test.createTestingModule({
    providers: [ProductsService, { provide: PrismaService, useValue: prisma }],
  }).compile();

  return { service: module.get<ProductsService>(ProductsService), prisma };
}

describe('ProductsService', () => {
  it('should be defined', async () => {
    const { service } = await setup([]);
    expect(service).toBeDefined();
  });

  describe('store routes (anyone, signed in or not)', () => {
    it('catalog: asks for active products without the download link', async () => {
      const { service, prisma } = await setup([]);
      await service.findAll(false);

      expect(prisma.calls).toHaveLength(1);
      expect(prisma.calls[0].method).toBe('findMany');
      expect(prisma.calls[0].query).toMatchObject({
        where: { isActive: true },
        omit: { fileUrl: true },
      });
    });

    it('product page: asks for an active product without the download link', async () => {
      const { service, prisma } = await setup({ id: 'p1', title: 'x' });
      await service.findOnePublic('p1');

      expect(prisma.calls).toEqual([
        {
          method: 'findFirst',
          query: {
            where: { id: 'p1', isActive: true },
            omit: { fileUrl: true },
            include: {
              center: {
                select: {
                  id: true,
                  name: true,
                  location: true,
                  contactEmail: true,
                  contactPhone: true,
                },
              },
            },
          },
        },
      ]);
    });

    it('product page: an unknown or paused product is a 404', async () => {
      const { service } = await setup(null);
      await expect(service.findOnePublic('p1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('admin routes', () => {
    it('catalog: every product, with the download link', async () => {
      const { service, prisma } = await setup([product]);
      const products = await service.findAll(true);

      expect(prisma.calls[0].query).not.toHaveProperty('omit');
      expect(prisma.calls[0].query).not.toMatchObject({
        where: { isActive: true },
      });
      expect(products[0]).toHaveProperty('fileUrl', product.fileUrl);
    });

    it('single product: still returns the download link', async () => {
      const { service } = await setup(product);
      await expect(service.findOne('p1')).resolves.toHaveProperty(
        'fileUrl',
        product.fileUrl,
      );
    });
  });
});
