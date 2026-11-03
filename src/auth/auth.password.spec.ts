import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import * as argon2 from 'argon2';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

const OLD_PASSWORD = 'old password 123';
const NEW_PASSWORD = 'new password 456';

// The guards Nest runs for a controller method (set by @UseGuards).
function guardsOf(method: keyof AuthController): unknown {
  const handler: unknown = Object.getOwnPropertyDescriptor(
    AuthController.prototype,
    method,
  )?.value;
  return Reflect.getMetadata('__guards__', handler as object);
}

// The fields the API refuses in a request body, and why (the ValidationPipe
// rules of main.ts: whitelist and forbidNonWhitelisted).
async function refused(body: object) {
  const errors = await validate(plainToInstance(ChangePasswordDto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((error) => ({
    field: error.property,
    messages: Object.values(error.constraints ?? {}),
  }));
}

type Update = {
  where: { id: string };
  data: { passwordHash: string; tokenVersion?: unknown };
};

// A fake Prisma with one account (u1, amira@example.com) whose password is
// OLD_PASSWORD and whose token version is 3. The password updates are
// recorded; the fake JwtService gives the payload as the token.
async function setup() {
  const passwordHash = await argon2.hash(OLD_PASSWORD);
  const account = {
    id: 'u1',
    email: 'amira@example.com',
    firstName: 'Amira',
    lastName: 'Ben Ali',
    role: 'STUDENT',
    passwordHash,
    tokenVersion: 3,
  };
  const updates: Update[] = [];
  const prisma = {
    user: {
      findUnique: (query: { where: { id?: string; email?: string } }) =>
        Promise.resolve(
          query.where.id === 'u1' || query.where.email === account.email
            ? account
            : null,
        ),
      update: (query: Update) => {
        updates.push(query);
        return Promise.resolve({ ...account, tokenVersion: 4 });
      },
    },
  };
  const jwt = { sign: (payload: object) => JSON.stringify(payload) };
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AuthService,
      { provide: PrismaService, useValue: prisma },
      { provide: JwtService, useValue: jwt },
    ],
  }).compile();
  return { service: module.get<AuthService>(AuthService), updates };
}

describe('Changing the password (POST /auth/change-password)', () => {
  it('only for a signed-in user', () => {
    expect(guardsOf('changePassword')).toEqual([JwtAuthGuard]);
  });

  it('the form: both passwords, the new one with 8 to 128 characters', async () => {
    await expect(
      refused({ currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD }),
    ).resolves.toEqual([]);
    await expect(
      refused({ currentPassword: '', newPassword: 'short' }),
    ).resolves.toEqual([
      {
        field: 'currentPassword',
        messages: ['Please enter your current password.'],
      },
      {
        field: 'newPassword',
        messages: ['The new password must be at least 8 characters long.'],
      },
    ]);
    const fields = (
      await refused({
        currentPassword: OLD_PASSWORD,
        newPassword: NEW_PASSWORD,
        userId: 'someone-else',
      })
    ).map((error) => error.field);
    expect(fields).toEqual(['userId']);
  });

  it('a wrong current password: 400, nothing changed', async () => {
    const { service, updates } = await setup();
    const refusal: unknown = await service
      .changePassword('u1', {
        currentPassword: 'not my password',
        newPassword: NEW_PASSWORD,
      })
      .catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(BadRequestException);
    expect((refusal as BadRequestException).getResponse()).toMatchObject({
      message: 'Your current password is not correct.',
    });
    expect(updates).toEqual([]);
  });

  it('the same password again: 400, nothing changed', async () => {
    const { service, updates } = await setup();
    const refusal: unknown = await service
      .changePassword('u1', {
        currentPassword: OLD_PASSWORD,
        newPassword: OLD_PASSWORD,
      })
      .catch((error: unknown) => error);
    expect((refusal as BadRequestException).getResponse()).toMatchObject({
      message: 'Choose a new password that is different from the current one.',
    });
    expect(updates).toEqual([]);
  });

  it('the right current password: the new one is stored hashed, the old one stops working', async () => {
    const { service, updates } = await setup();
    const answer = await service.changePassword('u1', {
      currentPassword: OLD_PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    expect(answer.message).toBe('Password changed.');
    expect(updates).toHaveLength(1);
    expect(updates[0].where).toEqual({ id: 'u1' });
    // The tokens given before stop working; the answer holds a new one
    expect(updates[0].data.tokenVersion).toEqual({ increment: 1 });
    expect(JSON.parse(answer.access_token)).toEqual({
      sub: 'u1',
      email: 'amira@example.com',
      role: 'STUDENT',
      ver: 4,
    });
    const stored = updates[0].data.passwordHash;
    expect(stored).not.toBe(NEW_PASSWORD);
    await expect(argon2.verify(stored, NEW_PASSWORD)).resolves.toBe(true);
    await expect(argon2.verify(stored, OLD_PASSWORD)).resolves.toBe(false);
  });

  it('sign-in: the token holds the token version of the account', async () => {
    const { service } = await setup();
    const signedIn = await service.login({
      email: 'amira@example.com',
      password: OLD_PASSWORD,
    });
    expect(JSON.parse(signedIn.access_token)).toEqual({
      sub: 'u1',
      email: 'amira@example.com',
      role: 'STUDENT',
      ver: 3,
    });
    expect(signedIn.user).toEqual({
      id: 'u1',
      email: 'amira@example.com',
      firstName: 'Amira',
      lastName: 'Ben Ali',
      role: 'STUDENT',
    });
  });

  it('an account that no longer exists: 401', async () => {
    const { service } = await setup();
    await expect(
      service.changePassword('gone', {
        currentPassword: OLD_PASSWORD,
        newPassword: NEW_PASSWORD,
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
