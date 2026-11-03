// src/common/academy-scope.ts
// What an admin may manage: a super admin manages every academy; a center
// admin only manages the academy (center) their own account belongs to.
import { ForbiddenException } from '@nestjs/common';
import { Role } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

// The logged-in admin, as JwtStrategy.validate puts it on the request.
export type Actor = { id: string; role: string };

// `all` is true for a super admin (every academy; centerId is then null).
// Otherwise centerId is the one academy the center admin may manage.
// (A plain object, not a union: with strictNullChecks off, TypeScript cannot
// narrow a union on a true/false field.)
export type AcademyScope = { all: boolean; centerId: string | null };

// A center admin whose account has no academy may manage nothing.
export async function academyScope(
  prisma: PrismaService,
  actor: Actor,
): Promise<AcademyScope> {
  if (actor.role === Role.SUPER_ADMIN) {
    return { all: true, centerId: null };
  }

  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { centerId: true },
  });
  if (user?.centerId) {
    return { all: false, centerId: user.centerId };
  }
  throw new ForbiddenException('Your account is not linked to an academy.');
}

// Throws 403 unless the admin may manage the academy `centerId`.
export async function assertManagesAcademy(
  prisma: PrismaService,
  actor: Actor,
  centerId: string,
): Promise<void> {
  const scope = await academyScope(prisma, actor);
  if (scope.all || scope.centerId === centerId) {
    return;
  }
  throw new ForbiddenException('This belongs to another academy.');
}
