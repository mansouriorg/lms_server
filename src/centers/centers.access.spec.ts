import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CentersController } from './centers.controller';
import { CentersService } from './centers.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

type Counts = {
  stages: number;
  products: number;
  coupons: number;
  admins: number;
};

// What Nest reads on a controller method: its guards (@UseGuards) and its
// roles (@Roles).
function metadataOf(key: string, method: keyof CentersController): unknown {
  const handler: unknown = Object.getOwnPropertyDescriptor(
    CentersController.prototype,
    method,
  )?.value;
  return Reflect.getMetadata(key, handler as object);
}

// A fake Prisma with one academy, "Code Academy" (academy-1), that still has
// `counts` courses, digital products, coupons and admins (null: no such
// academy).
// Every query is recorded.
async function setup(counts: Counts | null = null) {
  const queries: { model: string; query: unknown }[] = [];
  const answer = (model: string, result: unknown) => (query: unknown) => {
    queries.push({ model, query });
    return Promise.resolve(result);
  };
  const center =
    counts === null
      ? null
      : { id: 'academy-1', name: 'Code Academy', _count: counts, stages: [] };
  const prisma = {
    center: {
      findMany: answer('center.findMany', []),
      findUnique: answer('center.findUnique', center),
      delete: answer('center.delete', center),
    },
    user: { findUnique: answer('user.findUnique', { centerId: null }) },
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [CentersService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  const models = () => queries.map((q) => q.model);
  return {
    service: module.get<CentersService>(CentersService),
    queries,
    models,
  };
}

describe('Academies: who may create, delete and read them', () => {
  it('routes: only super admins create or delete an academy; everyone reads them', () => {
    expect(
      Reflect.getMetadata('__guards__', CentersController),
    ).toBeUndefined();
    expect(metadataOf('__guards__', 'create')).toEqual([
      JwtAuthGuard,
      RolesGuard,
    ]);
    expect(metadataOf(ROLES_KEY, 'create')).toEqual(['SUPER_ADMIN']);
    expect(metadataOf('__guards__', 'remove')).toEqual([
      JwtAuthGuard,
      RolesGuard,
    ]);
    expect(metadataOf(ROLES_KEY, 'remove')).toEqual(['SUPER_ADMIN']);
    expect(metadataOf(ROLES_KEY, 'update')).toEqual([
      'SUPER_ADMIN',
      'CENTER_ADMIN',
    ]);
    expect(metadataOf('__guards__', 'findAll')).toEqual([OptionalJwtAuthGuard]);
    expect(metadataOf('__guards__', 'findOne')).toEqual([OptionalJwtAuthGuard]);
  });

  it('the list: by name, counting only the courses students can see', async () => {
    const { service, queries } = await setup();
    await service.findAll();
    expect(queries).toMatchObject([
      {
        model: 'center.findMany',
        query: {
          orderBy: { name: 'asc' },
          include: {
            _count: {
              select: {
                stages: {
                  where: { status: { notIn: ['DRAFT', 'CANCELLED'] } },
                },
              },
            },
          },
        },
      },
    ]);
  });

  it('an academy page for a visitor (no token): its published courses, newest first', async () => {
    const { service, queries } = await setup({
      stages: 0,
      products: 0,
      coupons: 0,
      admins: 0,
    });
    await service.findOne('academy-1', null);
    expect(queries).toMatchObject([
      {
        model: 'center.findUnique',
        query: {
          where: { id: 'academy-1' },
          include: {
            stages: {
              where: { status: { notIn: ['DRAFT', 'CANCELLED'] } },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    ]);
  });

  it('delete: refused while the academy has courses, digital products, coupons or admins (409, nothing deleted)', async () => {
    const first = await setup({
      stages: 2,
      products: 0,
      coupons: 1,
      admins: 0,
    });
    const refusal: unknown = await first.service
      .remove('academy-1')
      .catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(ConflictException);
    expect((refusal as ConflictException).getResponse()).toMatchObject({
      statusCode: 409,
      message:
        'Code Academy still has 2 courses and 1 coupon: only an academy without courses, digital products, coupons or admins can be deleted.',
    });
    expect(first.models()).not.toContain('center.delete');

    const second = await setup({
      stages: 1,
      products: 1,
      coupons: 3,
      admins: 2,
    });
    const again: unknown = await second.service
      .remove('academy-1')
      .catch((error: unknown) => error);
    expect((again as ConflictException).getResponse()).toMatchObject({
      message:
        'Code Academy still has 1 course, 1 digital product, 3 coupons and 2 admins: only an academy without courses, digital products, coupons or admins can be deleted.',
    });
    expect(second.models()).not.toContain('center.delete');

    // Only admins left: deleting would leave them without an academy
    const third = await setup({
      stages: 0,
      products: 0,
      coupons: 0,
      admins: 1,
    });
    const admins: unknown = await third.service
      .remove('academy-1')
      .catch((error: unknown) => error);
    expect((admins as ConflictException).getResponse()).toMatchObject({
      message:
        'Code Academy still has 1 admin: only an academy without courses, digital products, coupons or admins can be deleted.',
    });
    expect(third.models()).not.toContain('center.delete');
    expect(third.queries[0].query).toMatchObject({
      include: { _count: { select: { admins: true } } },
    });
  });

  it('delete: an empty academy is deleted; an unknown one is a 404', async () => {
    const empty = await setup({
      stages: 0,
      products: 0,
      coupons: 0,
      admins: 0,
    });
    await expect(empty.service.remove('academy-1')).resolves.toEqual({
      message: 'Academy deleted.',
    });
    expect(empty.models()).toEqual(['center.findUnique', 'center.delete']);

    const unknown = await setup(null);
    await expect(unknown.service.remove('nope')).rejects.toThrow(
      NotFoundException,
    );
    expect(unknown.models()).not.toContain('center.delete');
  });
});
