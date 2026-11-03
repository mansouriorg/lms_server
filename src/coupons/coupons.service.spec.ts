import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CouponsService } from './coupons.service';
import { PrismaService } from '../prisma/prisma.service';

const superAdmin = { id: 's1', role: 'SUPER_ADMIN' };
const adminA = { id: 'a1', role: 'CENTER_ADMIN' }; // academy-1
const adminB = { id: 'a2', role: 'CENTER_ADMIN' }; // academy-2

// A fake Prisma: coupon k1 belongs to academy-1, k0 is platform-wide. Admin
// a1 belongs to academy-1, a2 to academy-2. Every query is recorded.
async function setup() {
  const queries: { model: string; query: unknown }[] = [];
  const record = (model: string, result: unknown) => (query: unknown) => {
    queries.push({ model, query });
    return Promise.resolve(result);
  };
  const coupons: Record<string, unknown> = {
    k1: { id: 'k1', centerId: 'academy-1', isActive: true },
    k0: { id: 'k0', centerId: null, isActive: true },
  };
  const academies: Record<string, string> = {
    a1: 'academy-1',
    a2: 'academy-2',
  };
  const prisma = {
    coupon: {
      // Looked up by id (toggle) or by code (create: the code must be new).
      findUnique: (query: { where: { id?: string } }) =>
        Promise.resolve(coupons[query.where.id ?? ''] ?? null),
      create: record('coupon.create', { id: 'k2' }),
      findMany: record('coupon.findMany', []),
      update: record('coupon.update', { id: 'k1', isActive: false }),
    },
    user: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve({ centerId: academies[query.where.id] ?? null }),
    },
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [CouponsService, { provide: PrismaService, useValue: prisma }],
  }).compile();

  const models = () => queries.map((q) => q.model);
  const queryOf = (model: string) =>
    queries.find((q) => q.model === model)?.query;
  return {
    service: module.get<CouponsService>(CouponsService),
    models,
    queryOf,
  };
}

const newCoupon = { code: 'react20', discountPercentage: 20 };

describe('CouponsService', () => {
  it('should be defined', async () => {
    const { service } = await setup();
    expect(service).toBeDefined();
  });

  describe('create a coupon (POST /coupons)', () => {
    it('center admin: the coupon belongs to their academy', async () => {
      const { service, queryOf } = await setup();
      await service.create(newCoupon, adminA);
      expect(queryOf('coupon.create')).toMatchObject({
        data: { code: 'REACT20', centerId: 'academy-1' },
      });
    });

    it('super admin: the coupon is platform-wide', async () => {
      const { service, queryOf } = await setup();
      await service.create(newCoupon, superAdmin);
      expect(queryOf('coupon.create')).toMatchObject({
        data: { centerId: null },
      });
    });
  });

  describe('list coupons (GET /coupons)', () => {
    it('center admin: only their academy coupons', async () => {
      const { service, queryOf } = await setup();
      await service.findAll(adminA);
      expect(queryOf('coupon.findMany')).toMatchObject({
        where: { centerId: 'academy-1' },
      });
    });

    it('super admin: every coupon', async () => {
      const { service, queryOf } = await setup();
      await service.findAll(superAdmin);
      expect(queryOf('coupon.findMany')).not.toHaveProperty('where.centerId');
    });
  });

  describe('pause a coupon (PATCH /coupons/:id/toggle)', () => {
    it('center admin: can pause their own academy coupon', async () => {
      const { service, models } = await setup();
      await service.toggleStatus('k1', adminA);
      expect(models()).toContain('coupon.update');
    });

    it('center admin: cannot touch another academy coupon (403)', async () => {
      const { service, models } = await setup();
      await expect(service.toggleStatus('k1', adminB)).rejects.toThrow(
        ForbiddenException,
      );
      expect(models()).not.toContain('coupon.update');
    });

    it('center admin: cannot touch a platform-wide coupon (403)', async () => {
      const { service, models } = await setup();
      await expect(service.toggleStatus('k0', adminA)).rejects.toThrow(
        ForbiddenException,
      );
      expect(models()).not.toContain('coupon.update');
    });

    it('super admin: can pause every coupon', async () => {
      const { service, models } = await setup();
      await service.toggleStatus('k0', superAdmin);
      expect(models()).toContain('coupon.update');
    });
  });
});
