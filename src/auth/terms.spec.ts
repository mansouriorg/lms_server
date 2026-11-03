import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UsersController } from '../users/users.controller';
import { UsersService } from '../users/users.service';
import { AcceptTermsDto } from '../users/dto/accept-terms.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  TERMS_CHANGED,
  TERMS_REQUIRED,
  TERMS_VERSION,
  TERMS_VERSION_MISSING,
} from '../config/legal';

const SIGN_UP = {
  email: 'amira@example.com',
  firstName: 'Amira',
  lastName: 'Ben Ali',
  password: 'a long password',
  acceptTerms: true,
  termsVersion: TERMS_VERSION,
};

// The fields refused in a body, and why (the ValidationPipe rules of main.ts)
async function refused(dto: new () => object, body: object) {
  const errors = await validate(plainToInstance(dto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((error) => ({
    field: error.property,
    messages: [...new Set(Object.values(error.constraints ?? {}))],
  }));
}

type Account = {
  id: string;
  termsVersion: string | null;
  termsAcceptedAt: Date | null;
};
type Query = {
  where: { id?: string; email?: string };
  data?: Record<string, unknown>;
  select?: Record<string, unknown>;
};

// A fake Prisma with the accounts of `accounts`; every query is recorded
async function setup(accounts: Account[] = []) {
  const queries: { kind: string; query: Query }[] = [];
  const terms = (account: Account) => ({
    termsVersion: account.termsVersion,
    termsAcceptedAt: account.termsAcceptedAt,
  });
  const prisma = {
    user: {
      findUnique: (query: Query) => {
        queries.push({ kind: 'findUnique', query });
        const account = accounts.find((item) => item.id === query.where.id);
        return Promise.resolve(account ? terms(account) : null);
      },
      create: (query: Query) => {
        queries.push({ kind: 'create', query });
        return Promise.resolve({ id: 'new', email: SIGN_UP.email });
      },
      update: (query: Query) => {
        queries.push({ kind: 'update', query });
        const account = accounts.find((item) => item.id === query.where.id);
        Object.assign(account, query.data);
        return Promise.resolve(terms(account));
      },
    },
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AuthService,
      UsersService,
      { provide: PrismaService, useValue: prisma },
      { provide: JwtService, useValue: {} },
    ],
  }).compile();
  return {
    auth: module.get<AuthService>(AuthService),
    users: module.get<UsersService>(UsersService),
    queries,
    kinds: () => queries.map((item) => item.kind),
  };
}

describe('Accepting the terms (sign-up and POST /users/me/terms)', () => {
  it('sign-up form: the checkbox and the version of the texts are required', async () => {
    await expect(refused(RegisterDto, SIGN_UP)).resolves.toEqual([]);
    const wrong = { ...SIGN_UP, acceptTerms: false, termsVersion: 'v2' };
    await expect(refused(RegisterDto, wrong)).resolves.toEqual([
      { field: 'acceptTerms', messages: [TERMS_REQUIRED] },
      { field: 'termsVersion', messages: [TERMS_VERSION_MISSING] },
    ]);
    // Only a real "true": not the text "true", not a missing field
    const fields = async (body: object) =>
      (await refused(RegisterDto, body)).map((error) => error.field);
    const asText = await fields({ ...SIGN_UP, acceptTerms: 'true' });
    expect(asText).toEqual(['acceptTerms']);
    const { email, firstName, lastName, password } = SIGN_UP;
    const missing = await fields({ email, firstName, lastName, password });
    expect(missing).toEqual(['acceptTerms', 'termsVersion']);
  });

  it('sign-up: the account records when and which version was accepted', async () => {
    const { auth, queries } = await setup();
    const before = Date.now();
    await auth.register(plainToInstance(RegisterDto, SIGN_UP));
    const create = queries.find((item) => item.kind === 'create').query;
    expect(create.data).toMatchObject({
      email: 'amira@example.com',
      termsVersion: TERMS_VERSION,
    });
    const acceptedAt = create.data.termsAcceptedAt as Date;
    expect(acceptedAt).toBeInstanceOf(Date);
    expect(acceptedAt.getTime() >= before).toBe(true);
    expect(create.select).not.toHaveProperty('passwordHash');
  });

  it('sign-up: a page that showed another version is refused, nothing is created', async () => {
    const { auth, kinds } = await setup();
    const old = { ...SIGN_UP, termsVersion: '2026-01-01' };
    await expect(auth.register(old as RegisterDto)).rejects.toThrow(
      BadRequestException,
    );
    await expect(auth.register(old as RegisterDto)).rejects.toThrow(
      TERMS_CHANGED,
    );
    expect(kinds()).toEqual([]);
  });

  it('GET /users/me: the version accepted and its date, never the password', async () => {
    const { users, queries } = await setup([
      { id: 'u1', termsVersion: null, termsAcceptedAt: null },
    ]);
    await users.getProfile('u1');
    expect(queries[0].query).toMatchObject({
      where: { id: 'u1' },
      select: { termsVersion: true, termsAcceptedAt: true },
    });
    expect(queries[0].query.select).not.toHaveProperty('passwordHash');
  });

  it('POST /users/me/terms: a token is needed, only the two fields are read', async () => {
    expect(Reflect.getMetadata('__guards__', UsersController)).toEqual([
      JwtAuthGuard,
    ]);
    const accept: unknown = Object.getOwnPropertyDescriptor(
      UsersController.prototype,
      'acceptTerms',
    )?.value;
    expect(Reflect.getMetadata('__httpCode__', accept as object)).toBe(200);
    const body = { acceptTerms: true, termsVersion: TERMS_VERSION };
    await expect(refused(AcceptTermsDto, body)).resolves.toEqual([]);
    // Nobody accepts for another account: the user is the one of the token
    const extra = await refused(AcceptTermsDto, { ...body, userId: 'u2' });
    expect(extra.map((error) => error.field)).toEqual(['userId']);
  });

  it('POST /users/me/terms: records the current version once', async () => {
    const accounts: Account[] = [
      { id: 'u1', termsVersion: null, termsAcceptedAt: null },
      { id: 'u2', termsVersion: '2025-01-01', termsAcceptedAt: new Date(0) },
    ];
    const { users, kinds } = await setup(accounts);
    const body = { acceptTerms: true, termsVersion: TERMS_VERSION };
    const first = await users.acceptTerms('u1', body);
    expect(first).toMatchObject({
      message: 'Thank you: your acceptance is recorded.',
      termsVersion: TERMS_VERSION,
    });
    expect(first.termsAcceptedAt).toBeInstanceOf(Date);
    // Again: nothing changes, the first date stays
    const again = await users.acceptTerms('u1', body);
    expect(again.termsAcceptedAt).toBe(first.termsAcceptedAt);
    // An account that accepted an older version accepts the new one
    await users.acceptTerms('u2', body);
    expect(accounts[1].termsVersion).toBe(TERMS_VERSION);
    expect(kinds()).toEqual([
      'findUnique',
      'update',
      'findUnique',
      'findUnique',
      'update',
    ]);
  });

  it('POST /users/me/terms: another version or an unknown account is refused', async () => {
    const { users, kinds } = await setup([
      { id: 'u1', termsVersion: null, termsAcceptedAt: null },
    ]);
    const old = { acceptTerms: true, termsVersion: '2026-01-01' };
    await expect(users.acceptTerms('u1', old)).rejects.toThrow(TERMS_CHANGED);
    expect(kinds()).toEqual([]);
    const body = { acceptTerms: true, termsVersion: TERMS_VERSION };
    await expect(users.acceptTerms('gone', body)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('the server asks for the version shown on the pages', () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // client/lib/legal.ts, when the web app is in the same project
    const pages = join(__dirname, '../../../client/lib/legal.ts');
    if (existsSync(pages)) {
      const text = readFileSync(pages, 'utf8');
      const shown = /LEGAL_UPDATED = '([^']+)'/.exec(text);
      expect(shown && shown[1]).toBe(TERMS_VERSION);
    }
  });
});
