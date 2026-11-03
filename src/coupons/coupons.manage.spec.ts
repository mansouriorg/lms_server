import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

const adminA = { id: 'a1', role: 'CENTER_ADMIN' }; // academy-1
const adminB = { id: 'a2', role: 'CENTER_ADMIN' }; // academy-2

// The body after validation, and the fields refused (like the app's
// ValidationPipe)
async function check(body: object) {
  const dto = plainToInstance(CreateCouponDto, body);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, fields: errors.map((error) => error.property).sort() };
}

// A fake Prisma: coupons k1 (used in 2 orders) and k2 (never used), both of
// academy-1. Every create, delete and count is recorded.
async function setup() {
  const queries: { model: string; query: unknown }[] = [];
  const coupons: Record<string, object> = {
    k1: { id: 'k1', centerId: 'academy-1', _count: { orders: 2 } },
    k2: { id: 'k2', centerId: 'academy-1', _count: { orders: 0 } },
  };
  const prisma = {
    coupon: {
      findUnique: (query: { where: { id?: string; code?: string } }) => {
        queries.push({ model: 'coupon.findUnique', query });
        return Promise.resolve(coupons[query.where.id ?? ''] ?? null);
      },
      create: (query: unknown) => {
        queries.push({ model: 'coupon.create', query });
        return Promise.resolve({ id: 'k9' });
      },
      delete: (query: unknown) => {
        queries.push({ model: 'coupon.delete', query });
        return Promise.resolve({ id: 'k2' });
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

// The HTTP status and message of a refused call
async function refusal(call: Promise<unknown>) {
  const error: unknown = await call.catch((caught: unknown) => caught);
  const body = (error as BadRequestException).getResponse() as {
    statusCode: number;
    message: string;
  };
  return { status: body.statusCode, message: body.message };
}

describe('Coupons: the form, and deleting (POST, DELETE /coupons)', () => {
  it('the code: trimmed, in capitals, 3 to 30 letters, digits, - or _', async () => {
    const ok = await check({ code: '  summer-20 ', discountPercentage: 20 });
    expect(ok.fields).toEqual([]);
    expect(ok.dto.code).toBe('SUMMER-20');
    for (const code of ['AB', 'SUMMER 20', 'PROMO%', 'X'.repeat(31), '']) {
      expect((await check({ code, discountAmount: 10 })).fields).toEqual([
        'code',
      ]);
    }
  });

  it('the discount, the limit of uses and the end date', async () => {
    const ok = await check({
      code: 'GUIDE10',
      discountAmount: 7.5,
      maxUses: 50,
      expiresAt: '2099-12-31T22:59:59.999Z',
    });
    expect(ok.fields).toEqual([]);
    const wrong = await check({
      code: 'GUIDE10',
      discountPercentage: 120,
      discountAmount: 0.5,
      maxUses: 2.5,
      expiresAt: 'next week',
    });
    expect(wrong.fields).toEqual([
      'discountAmount',
      'discountPercentage',
      'expiresAt',
      'maxUses',
    ]);
  });

  it('an end date already past: 400, nothing is created', async () => {
    const { service, models } = await setup();
    const answer = await refusal(
      service.create(
        {
          code: 'OLD10',
          discountPercentage: 10,
          expiresAt: '2020-01-01T00:00:00.000Z',
        },
        adminA,
      ),
    );
    expect(answer).toEqual({
      status: 400,
      message: 'The end date of the coupon is already past.',
    });
    expect(models()).not.toContain('coupon.create');
  });

  it('DELETE: a coupon never used in an order is deleted', async () => {
    const { service, queryOf } = await setup();
    await expect(service.remove('k2', adminA)).resolves.toEqual({
      message: 'Coupon deleted.',
    });
    expect(queryOf('coupon.findUnique')).toEqual({
      where: { id: 'k2' },
      include: { _count: { select: { orders: true } } },
    });
    expect(queryOf('coupon.delete')).toEqual({ where: { id: 'k2' } });
  });

  it('DELETE: a used coupon stays (409, pause it instead); another academy gets 403', async () => {
    const { service, models } = await setup();
    const used = await refusal(service.remove('k1', adminA));
    expect(used).toEqual({
      status: 409,
      message:
        'This coupon was used in an order, so it cannot be deleted: the order keeps its discount. Pause it instead.',
    });
    await expect(service.remove('k2', adminB)).rejects.toThrow(
      ForbiddenException,
    );
    expect(models()).not.toContain('coupon.delete');
  });

  it('the delete route: academy admins and super admins only', () => {
    const handler: unknown = Object.getOwnPropertyDescriptor(
      CouponsController.prototype,
      'remove',
    )?.value;
    expect(Reflect.getMetadata(ROLES_KEY, handler as object)).toEqual([
      'CENTER_ADMIN',
      'SUPER_ADMIN',
    ]);
  });
});
