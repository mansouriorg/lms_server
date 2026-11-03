// src/auth/jwt.strategy.ts
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

// What the sign-in token holds (signed by AuthService.login). ver: the
// account's tokenVersion when the token was given (absent from the tokens
// given before it existed, which count as 0).
export type TokenPayload = {
  sub: string;
  email?: string;
  role?: string;
  ver?: number;
};

// A token of a deleted account, one without an account id, or one given
// before the last password change
export const SIGN_IN_AGAIN =
  'Your sign-in is no longer valid. Please sign in again.';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      // The token comes in the "Authorization: Bearer <token>" header
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // An expired token is refused with a 401
      ignoreExpiration: false,
      // The app does not start without JWT_SECRET (src/config/env.schema.ts)
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  // Passport calls this once the signature and the expiry of the token are
  // checked; what it returns is request.user. The account is read again on
  // every request: a role given or taken away (an academy admin added or
  // removed, a platform admin made with admin:make) counts from the next
  // request, not when the token expires. A deleted account, or a token given
  // before the last password change, gets a 401.
  async validate(payload: TokenPayload) {
    if (typeof payload.sub !== 'string' || payload.sub === '') {
      throw new UnauthorizedException(SIGN_IN_AGAIN);
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, tokenVersion: true },
    });
    if (user === null || (payload.ver ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException(SIGN_IN_AGAIN);
    }
    return { id: user.id, email: user.email, role: user.role };
  }
}
