// src/auth/decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';
import { Role } from 'src/generated/prisma/enums';

export const ROLES_KEY = 'roles';

// This decorator takes an array of permitted roles and attaches them to the route's metadata
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);