// src/auth/decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';
import { Role } from 'generated/prisma/enums';// Import the Enum directly from your Prisma schema

export const ROLES_KEY = 'roles';

// This decorator takes an array of permitted roles and attaches them to the route's metadata
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);