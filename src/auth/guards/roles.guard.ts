// src/auth/guards/roles.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from 'generated/prisma/enums';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  // The Reflector allows us to read the metadata attached by our @Roles() decorator
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 1. Look for the @Roles() decorator on the specific route handler or the whole controller
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // 2. If the route doesn't have a @Roles() decorator, let anyone in (who passes the JwtAuthGuard)
    if (!requiredRoles) {
      return true;
    }

    // 3. Get the user object that Passport attached to the request
    const { user } = context.switchToHttp().getRequest();

    // 4. Check if the user's role matches any of the required roles
    // If it returns true, the request proceeds. If false, NestJS automatically throws a 403 error.
    return requiredRoles.some((role) => user?.role === role);
  }
}