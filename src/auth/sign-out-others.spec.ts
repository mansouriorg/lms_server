import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

// A fake Prisma with one account whose token version becomes 5, and a fake
// JwtService that gives the payload as the token. The updates are recorded.
async function setup() {
  const updates: unknown[] = [];
  const prisma = {
    user: {
      update: (query: unknown) => {
        updates.push(query);
        return Promise.resolve({
          id: 'u1',
          email: 'amira@example.com',
          role: 'STUDENT',
          tokenVersion: 5,
        });
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

describe('Signing out the other browsers (POST /auth/sign-out-others)', () => {
  it('only for a signed-in user, for their own account', async () => {
    const handler: unknown = Object.getOwnPropertyDescriptor(
      AuthController.prototype,
      'signOutOthers',
    )?.value;
    expect(Reflect.getMetadata('__guards__', handler as object)).toEqual([
      JwtAuthGuard,
    ]);
    const calls: string[] = [];
    const controller = new AuthController({
      signOutOthers: (userId: string) => {
        calls.push(userId);
        return Promise.resolve({ message: 'ok', access_token: 't' });
      },
    } as unknown as AuthService);
    await controller.signOutOthers('u1');
    expect(calls).toEqual(['u1']);
  });

  it('the tokens given before stop working; this browser gets a new one', async () => {
    const { service, updates } = await setup();
    const answer = await service.signOutOthers('u1');
    expect(updates).toEqual([
      {
        where: { id: 'u1' },
        data: { tokenVersion: { increment: 1 } },
        select: { id: true, email: true, role: true, tokenVersion: true },
      },
    ]);
    expect(answer.message).toBe(
      'Your other browsers and devices are signed out.',
    );
    expect(JSON.parse(answer.access_token)).toEqual({
      sub: 'u1',
      email: 'amira@example.com',
      role: 'STUDENT',
      ver: 5,
    });
  });
});
