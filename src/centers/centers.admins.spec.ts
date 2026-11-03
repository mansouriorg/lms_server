import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CentersController } from './centers.controller';
import {
  ADMIN_FIELDS,
  CentersService,
  IS_PLATFORM_ADMIN,
  NO_ACCOUNT,
  NOT_AN_ADMIN,
} from './centers.service';
import { AddAcademyAdminDto } from './dto/add-academy-admin.dto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

type Account = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  centerId: string | null;
  center: { name: string } | null;
};

const ACADEMY = { id: 'academy-1', name: 'Code Academy' };
const AMIRA: Account = {
  id: 'u1',
  email: 'amira@example.com',
  firstName: 'Amira',
  lastName: 'Ben Ali',
  role: 'STUDENT',
  centerId: null,
  center: null,
};

function metadataOf(key: string, method: keyof CentersController): unknown {
  const handler: unknown = Object.getOwnPropertyDescriptor(
    CentersController.prototype,
    method,
  )?.value;
  return Reflect.getMetadata(key, handler as object);
}

// A fake Prisma with the academy `academy` and the account `account` (null:
// none). Every query is recorded.
async function setup(academy: object | null, account: Account | null) {
  const queries: { model: string; query: unknown }[] = [];
  const answer = (model: string, result: unknown) => (query: unknown) => {
    queries.push({ model, query });
    return Promise.resolve(result);
  };
  const prisma = {
    center: {
      findUnique: answer('center.findUnique', academy),
      findMany: answer('center.findMany', []),
    },
    user: {
      findUnique: answer('user.findUnique', account),
      update: answer('user.update', { ...AMIRA, role: 'CENTER_ADMIN' }),
    },
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [CentersService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return {
    service: module.get<CentersService>(CentersService),
    models: () => queries.map((item) => item.model),
    queryOf: (model: string) =>
      queries.find((item) => item.model === model)?.query,
  };
}

describe('Academy admins (platform admins only)', () => {
  it('the three routes need a token and the platform admin role', () => {
    for (const method of ['overview', 'addAdmin', 'removeAdmin'] as const) {
      expect(metadataOf('__guards__', method)).toEqual([
        JwtAuthGuard,
        RolesGuard,
      ]);
      expect(metadataOf(ROLES_KEY, method)).toEqual(['SUPER_ADMIN']);
    }
  });

  it('the form: one valid email, trimmed and in lower case', async () => {
    const dto = plainToInstance(AddAcademyAdminDto, {
      email: '  Amira@Example.COM ',
    });
    expect(dto.email).toBe('amira@example.com');
    expect(await validate(dto)).toEqual([]);
    const wrong = plainToInstance(AddAcademyAdminDto, { email: 'amira' });
    const errors = await validate(wrong);
    expect(errors.map((error) => error.property)).toEqual(['email']);
  });

  it('the overview: by name, with what it holds and its admins, no password', async () => {
    const { service, queryOf } = await setup(ACADEMY, null);
    await service.overview();
    const query = queryOf('center.findMany');
    expect(query).toMatchObject({
      orderBy: { name: 'asc' },
      select: {
        _count: { select: { stages: true, products: true, coupons: true } },
        admins: { where: { role: 'CENTER_ADMIN' }, select: ADMIN_FIELDS },
      },
    });
    expect(query).not.toHaveProperty('select.admins.select.passwordHash');
  });

  it('adding: a student becomes an admin of the academy', async () => {
    const { service, queryOf } = await setup(ACADEMY, AMIRA);
    const answer = await service.addAdmin('academy-1', 'amira@example.com');
    expect(answer.message).toMatch(/^Amira Ben Ali is now an admin of Code/);
    expect(queryOf('user.findUnique')).toMatchObject({
      where: { email: 'amira@example.com' },
      select: {
        role: true,
        centerId: true,
        center: { select: { name: true } },
      },
    });
    expect(queryOf('user.update')).toEqual({
      where: { id: 'u1' },
      data: { role: 'CENTER_ADMIN', centerId: 'academy-1' },
      select: ADMIN_FIELDS,
    });
  });

  it('adding is refused: no academy, no account, platform admin, admin already', async () => {
    const add = async (academy: object | null, account: Account | null) => {
      const { service, models } = await setup(academy, account);
      const result = service.addAdmin('academy-1', 'amira@example.com');
      await result.catch(() => undefined);
      expect(models()).not.toContain('user.update');
      return result;
    };
    await expect(add(null, AMIRA)).rejects.toThrow('Academy not found.');
    await expect(add(ACADEMY, null)).rejects.toThrow(NO_ACCOUNT);
    const platform = { ...AMIRA, role: 'SUPER_ADMIN' };
    await expect(add(ACADEMY, platform)).rejects.toThrow(IS_PLATFORM_ADMIN);
    const here = { ...AMIRA, role: 'CENTER_ADMIN', centerId: 'academy-1' };
    await expect(add(ACADEMY, here)).rejects.toThrow(
      'This account is already an admin of Code Academy.',
    );
    const elsewhere = {
      ...here,
      centerId: 'academy-2',
      center: { name: 'Data School' },
    };
    await expect(add(ACADEMY, elsewhere)).rejects.toThrow(
      'This account is an admin of Data School: remove it there first.',
    );
    await expect(add(ACADEMY, elsewhere)).rejects.toThrow(ConflictException);
  });

  it('removing: the admin becomes a student again; others are refused', async () => {
    const admin = { ...AMIRA, role: 'CENTER_ADMIN', centerId: 'academy-1' };
    const { service, queryOf } = await setup(ACADEMY, admin);
    const answer = await service.removeAdmin('academy-1', 'u1');
    expect(answer.message).toMatch(/^Amira Ben Ali is no longer an admin/);
    expect(queryOf('user.findUnique')).toMatchObject({
      where: { id: 'u1' },
      select: { firstName: true, role: true, centerId: true },
    });
    expect(queryOf('user.update')).toMatchObject({
      where: { id: 'u1' },
      data: { role: 'STUDENT', centerId: null },
    });
    const refused = [
      AMIRA,
      { ...admin, centerId: 'academy-2' },
      { ...admin, role: 'SUPER_ADMIN' },
    ];
    for (const account of refused) {
      const other = await setup(ACADEMY, account);
      const removing = other.service.removeAdmin('academy-1', 'u1');
      await expect(removing).rejects.toThrow(NOT_AN_ADMIN);
      expect(other.models()).not.toContain('user.update');
    }
    const missing = await setup(ACADEMY, null);
    const removing = missing.service.removeAdmin('academy-1', 'u1');
    await expect(removing).rejects.toThrow(NotFoundException);
  });
});
