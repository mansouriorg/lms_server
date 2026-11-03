// src/auth/guards/optional-jwt-auth.guard.ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// For routes that anyone may open, like the course catalog.
// - A valid token: request.user is set, exactly like with JwtAuthGuard.
// - No token, or an invalid or expired one: the request goes through with
//   request.user = null, instead of a 401.
// Routes that change data must keep JwtAuthGuard.
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // Called by AuthGuard with what JwtStrategy.validate returned (or false).
  handleRequest<TUser = unknown>(
    _error: unknown,
    user: TUser | false,
  ): TUser | null {
    return user || null;
  }
}
