import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import * as argon2 from 'argon2';
import { PasswordResetController } from './password-reset.controller';
import {
  FORGOT_ANSWER,
  LINK_REFUSED,
  PasswordResetService,
  resetState,
  tokenHashOf,
} from './password-reset.service';
import { ResetEmailDto, ResetPasswordDto } from './dto/password-reset.dto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { ROLES_KEY } from './decorators/roles.decorator';

const HOUR = 60 * 60 * 1000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR);

type Row = {
  id: string;
  userId: string;
  requestedAt: Date | null;
  tokenHash: string | null;
  expiresAt: Date | null;
  usedAt: Date | null;
  createdAt: Date;
};
type Where = {
  id?: string;
  userId?: string;
  tokenHash?: string;
  usedAt?: null;
  expiresAt?: { gt: Date };
  createdAt?: { gte: Date };
};

// The accounts: a student, an academy admin and a platform admin
const USERS = [
  { id: 'u1', email: 'amira@example.com', role: 'STUDENT' },
  { id: 'a1', email: 'sami@code.example.com', role: 'CENTER_ADMIN' },
  { id: 'p1', email: 'boss@lms.example.com', role: 'SUPER_ADMIN' },
];

// A fake Prisma that keeps the resets in `rows` and applies the filters the
// service uses. The password updates are recorded.
async function setup(rows: Row[] = []) {
  const updates: {
    where: { id: string };
    data: { passwordHash: string; tokenVersion?: unknown };
  }[] = [];
  const queries: { model: string; query: unknown }[] = [];
  let next = rows.length;
  let refuseClaim = false;
  const matches = (row: Row, where: Where) =>
    (where.id === undefined || row.id === where.id) &&
    (where.userId === undefined || row.userId === where.userId) &&
    (where.tokenHash === undefined || row.tokenHash === where.tokenHash) &&
    (where.usedAt === undefined || row.usedAt === null) &&
    (where.expiresAt === undefined ||
      (row.expiresAt !== null && row.expiresAt > where.expiresAt.gt)) &&
    (where.createdAt === undefined || row.createdAt >= where.createdAt.gte);
  // The rows that match, the newest first
  const newestFirst = (where: Where) => {
    const found = rows.filter((row) => matches(row, where));
    return found.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  };
  const withUser = (row: Row) => ({
    ...row,
    user: USERS.find((user) => user.id === row.userId),
  });
  const prisma = {
    user: {
      findUnique: (query: { where: { email: string } }) =>
        Promise.resolve(
          USERS.find((user) => user.email === query.where.email) ?? null,
        ),
      update: (query: {
        where: { id: string };
        data: { passwordHash: string };
      }) => {
        updates.push(query);
        return Promise.resolve({ id: query.where.id });
      },
    },
    passwordReset: {
      findFirst: (query: { where: Where }) => {
        queries.push({ model: 'findFirst', query });
        return Promise.resolve(newestFirst(query.where)[0] ?? null);
      },
      findUnique: (query: { where: Where }) => {
        const found = rows.find((row) => matches(row, query.where));
        return Promise.resolve(found === undefined ? null : withUser(found));
      },
      findMany: (query: { where: Where }) => {
        queries.push({ model: 'findMany', query });
        return Promise.resolve(newestFirst(query.where).map(withUser));
      },
      create: (query: { data: { userId: string; requestedAt?: Date } }) => {
        next += 1;
        const row: Row = {
          id: `r${next}`,
          userId: query.data.userId,
          requestedAt: query.data.requestedAt ?? null,
          tokenHash: null,
          expiresAt: null,
          usedAt: null,
          createdAt: new Date(),
        };
        rows.push(row);
        return Promise.resolve({ id: row.id });
      },
      update: (query: { where: { id: string }; data: Partial<Row> }) => {
        const row = rows.find((item) => item.id === query.where.id);
        Object.assign(row, query.data);
        return Promise.resolve({ id: row.id });
      },
      updateMany: (query: { where: Where; data: Partial<Row> }) => {
        if (refuseClaim) {
          refuseClaim = false;
          return Promise.resolve({ count: 0 });
        }
        const found = rows.filter((row) => matches(row, query.where));
        found.forEach((row) => Object.assign(row, query.data));
        return Promise.resolve({ count: found.length });
      },
    },
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PasswordResetService,
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();
  return {
    service: module.get<PasswordResetService>(PasswordResetService),
    rows,
    updates,
    queries,
    // The next claim of a link finds it already used (a second tab)
    raceOnce: () => {
      refuseClaim = true;
    },
  };
}

// A reset row of user u1 (open, without a link) created `hours` ago
const row = (id: string, hours: number, extra: Partial<Row> = {}): Row => ({
  id,
  userId: 'u1',
  requestedAt: ago(hours),
  tokenHash: null,
  expiresAt: null,
  usedAt: null,
  createdAt: ago(hours),
  ...extra,
});

// The guards and roles Nest runs for a controller method
function access(method: keyof PasswordResetController) {
  const handler: unknown = Object.getOwnPropertyDescriptor(
    PasswordResetController.prototype,
    method,
  )?.value;
  return {
    guards: Reflect.getMetadata('__guards__', handler as object) as unknown,
    roles: Reflect.getMetadata(ROLES_KEY, handler as object) as unknown,
  };
}

// The fields refused in a body (the ValidationPipe rules of main.ts)
async function refused(type: new () => object, body: object) {
  const errors = await validate(plainToInstance(type, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((error) => error.property).sort();
}

describe('Forgotten passwords (/auth/forgot-password, /auth/password-resets, /auth/reset-password)', () => {
  it('asking and choosing the new password need no token; the rest a platform admin', () => {
    expect(access('forgotPassword')).toEqual({
      guards: undefined,
      roles: undefined,
    });
    expect(access('resetPassword')).toEqual({
      guards: undefined,
      roles: undefined,
    });
    for (const method of ['list', 'createForEmail', 'createLink'] as const) {
      expect(access(method)).toEqual({
        guards: [JwtAuthGuard, RolesGuard],
        roles: ['SUPER_ADMIN'],
      });
    }
  });

  it('the forms: an email (cleaned), the secret of the link, 8 to 128 characters', async () => {
    const email = plainToInstance(ResetEmailDto, {
      email: ' Amira@Example.com ',
    });
    expect(email.email).toBe('amira@example.com');
    expect(await refused(ResetEmailDto, { email: 'nope' })).toEqual(['email']);
    expect(
      await refused(ResetPasswordDto, { token: 'x', password: '12345678' }),
    ).toEqual([]);
    expect(
      await refused(ResetPasswordDto, { token: '', password: 'short' }),
    ).toEqual(['password', 'token']);
    expect(
      await refused(ResetPasswordDto, {
        token: 'x'.repeat(101),
        password: 'p'.repeat(129),
        userId: 'u1',
      }),
    ).toEqual(['password', 'token', 'userId']);
  });

  it('asking: the same answer for everyone; one open reset per account', async () => {
    const { service, rows } = await setup();
    for (const email of ['nobody@example.com', 'boss@lms.example.com']) {
      await expect(service.request(email)).resolves.toEqual(FORGOT_ANSWER);
    }
    expect(rows).toEqual([]);
    await expect(service.request('amira@example.com')).resolves.toEqual(
      FORGOT_ANSWER,
    );
    const first = rows[0].requestedAt;
    await new Promise((resolve) => setTimeout(resolve, 5));
    await service.request('amira@example.com');
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({ userId: 'u1', tokenHash: null });
    expect(rows[0].requestedAt > first).toBe(true);
  });

  it('a link: a one-time secret of which only the sha256 is kept, for 24 hours', async () => {
    const { service, rows } = await setup([row('r1', 2)]);
    const made = await service.createLink('r1');
    expect(made.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(rows[0].tokenHash).toBe(tokenHashOf(made.token));
    expect(rows[0].tokenHash).not.toBe(made.token);
    const late = made.expiresAt.getTime() - Date.now() - 24 * HOUR;
    expect(Math.abs(late)).toBeLessThan(5000);
    // A new link replaces the first one
    const again = await service.createLink('r1');
    expect(again.token).not.toBe(made.token);
    expect(rows[0].tokenHash).toBe(tokenHashOf(again.token));
    await expect(service.createLink('r404')).rejects.toThrow(NotFoundException);
    rows[0].usedAt = new Date();
    await expect(service.createLink('r1')).rejects.toThrow(BadRequestException);
  });

  it('started by the platform admin: the open reset of the account or a new one', async () => {
    const { service, rows } = await setup([row('r1', 2)]);
    await service.createForEmail('amira@example.com');
    expect(rows.length).toBe(1);
    expect(rows[0].tokenHash).not.toBeNull();
    await service.createForEmail('sami@code.example.com');
    expect(rows.length).toBe(2);
    expect(rows[1]).toMatchObject({ userId: 'a1', requestedAt: null });
    expect(rows[1].tokenHash).not.toBeNull();
    await expect(service.createForEmail('nobody@example.com')).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      service.createForEmail('boss@lms.example.com'),
    ).rejects.toThrow(ForbiddenException);
    // Nothing is kept for a platform admin account
    expect(rows.map((item) => item.userId)).toEqual(['u1', 'a1']);
  });

  it('the new password: once, before the link expires; the other open resets close', async () => {
    const { service, rows, updates } = await setup([
      row('r1', 2),
      row('r2', 50),
    ]);
    const { token } = await service.createLink('r1');
    await expect(service.reset(token, 'new password 1')).resolves.toEqual({
      message: 'Your password is changed. You can sign in with it now.',
    });
    expect(updates.length).toBe(1);
    expect(updates[0].where).toEqual({ id: 'u1' });
    await expect(
      argon2.verify(updates[0].data.passwordHash, 'new password 1'),
    ).resolves.toBe(true);
    // Its sign-in tokens stop working
    expect(updates[0].data.tokenVersion).toEqual({ increment: 1 });
    expect(rows.every((item) => item.usedAt !== null)).toBe(true);
    // The same link again, an unknown one
    await expect(service.reset(token, 'another one 2')).rejects.toThrow(
      LINK_REFUSED,
    );
    await expect(service.reset('made-up', 'another one 2')).rejects.toThrow(
      LINK_REFUSED,
    );

    const later = await setup([row('r1', 2)]);
    const old = await later.service.createLink('r1');
    const fresh = await later.service.createLink('r1');
    // A link replaced by a newer one
    await expect(
      later.service.reset(old.token, 'new password 1'),
    ).rejects.toThrow(LINK_REFUSED);
    // A link opened twice at the same time: the second one is refused
    later.raceOnce();
    await expect(
      later.service.reset(fresh.token, 'new password 1'),
    ).rejects.toThrow(LINK_REFUSED);
    expect(later.updates).toEqual([]);
    // An expired link
    later.rows[0].expiresAt = ago(1);
    await expect(
      later.service.reset(fresh.token, 'new password 1'),
    ).rejects.toThrow(LINK_REFUSED);
    expect(later.updates).toEqual([]);
  });

  it('the list for the platform admin: the last 30 days, newest first, with the state', async () => {
    const now = new Date();
    const { service, queries } = await setup([
      row('r1', 3),
      row('r2', 1, { tokenHash: 'h2', expiresAt: ago(-20) }),
      row('r3', 30, { tokenHash: 'h3', expiresAt: ago(6) }),
      row('r4', 48, { usedAt: ago(47) }),
      row('r5', 24 * 31),
    ]);
    const list = await service.list();
    expect(list.map((item) => [item.id, item.state])).toEqual([
      ['r2', 'link-active'],
      ['r1', 'requested'],
      ['r3', 'link-expired'],
      ['r4', 'used'],
    ]);
    expect(list[0].user).toMatchObject({ email: 'amira@example.com' });
    const where = (queries[0].query as { where: Where }).where;
    const days = (now.getTime() - where.createdAt.gte.getTime()) / 24 / HOUR;
    expect(Math.round(days)).toBe(30);
    expect(resetState({ expiresAt: null, usedAt: null }, now)).toBe(
      'requested',
    );
  });
});
