import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy, SIGN_IN_AGAIN, TokenPayload } from './jwt.strategy';

// Passport calls validate() once the signature and the expiry of the token
// are checked. Here it is called directly, on a strategy whose Prisma is a
// fake with the account `account` (null: none) that records its queries.
function strategyWith(account: object | null) {
  const queries: unknown[] = [];
  const prisma = {
    user: {
      findUnique: (query: unknown) => {
        queries.push(query);
        return Promise.resolve(account);
      },
    },
  };
  const strategy = Object.create(JwtStrategy.prototype) as JwtStrategy;
  Object.assign(strategy, { prisma });
  return { strategy, queries };
}

const amira = { id: 'u1', email: 'amira@example.com' };
// The account as Prisma gives it: with its token version
const account = (role: string, tokenVersion = 0) => ({
  ...amira,
  role,
  tokenVersion,
});

describe('JwtStrategy: the account behind a sign-in token', () => {
  it('the role comes from the account now, not from the token', async () => {
    const added = strategyWith(account('CENTER_ADMIN'));
    const token: TokenPayload = {
      sub: 'u1',
      email: 'old@example.com',
      role: 'STUDENT',
    };
    await expect(added.strategy.validate(token)).resolves.toEqual({
      ...amira,
      role: 'CENTER_ADMIN',
    });
    // Never the password
    expect(added.queries).toEqual([
      {
        where: { id: 'u1' },
        select: { id: true, email: true, role: true, tokenVersion: true },
      },
    ]);

    const removed = strategyWith(account('STUDENT'));
    const admin: TokenPayload = { sub: 'u1', role: 'CENTER_ADMIN' };
    await expect(removed.strategy.validate(admin)).resolves.toEqual({
      ...amira,
      role: 'STUDENT',
    });
  });

  it('a deleted account, or a token without an account id: 401', async () => {
    const deleted = strategyWith(null);
    const refusal: unknown = await deleted.strategy
      .validate({ sub: 'u1', role: 'SUPER_ADMIN' })
      .catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(UnauthorizedException);
    expect((refusal as UnauthorizedException).getResponse()).toMatchObject({
      statusCode: 401,
      message: SIGN_IN_AGAIN,
    });

    for (const payload of [{ sub: '' }, {}, { sub: 42 }]) {
      const empty = strategyWith(account('STUDENT'));
      await expect(
        empty.strategy.validate(payload as TokenPayload),
      ).rejects.toThrow(UnauthorizedException);
      expect(empty.queries).toEqual([]);
    }
  });

  it('after a password change, the tokens given before get a 401', async () => {
    const changed = strategyWith(account('STUDENT', 2));
    const now: TokenPayload = { sub: 'u1', ver: 2 };
    await expect(changed.strategy.validate(now)).resolves.toEqual({
      ...amira,
      role: 'STUDENT',
    });
    for (const before of [{ sub: 'u1', ver: 1 }, { sub: 'u1' }]) {
      await expect(changed.strategy.validate(before)).rejects.toThrow(
        UnauthorizedException,
      );
    }
    // A token given before this check existed counts as version 0
    const never = strategyWith(account('STUDENT', 0));
    await expect(never.strategy.validate({ sub: 'u1' })).resolves.toEqual({
      ...amira,
      role: 'STUDENT',
    });
  });
});
