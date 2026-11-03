import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { academyScope, assertManagesAcademy } from './academy-scope';

const superAdmin = { id: 's1', role: 'SUPER_ADMIN' };
const adminA = { id: 'a1', role: 'CENTER_ADMIN' };
const noAcademy = { id: 'a3', role: 'CENTER_ADMIN' };

// A fake Prisma: admin a1 belongs to academy-1, a3 has no academy.
function fakePrisma() {
  const lookups: string[] = [];
  const academies: Record<string, string> = { a1: 'academy-1' };
  const prisma = {
    user: {
      findUnique: (query: { where: { id: string } }) => {
        lookups.push(query.where.id);
        return Promise.resolve({ centerId: academies[query.where.id] ?? null });
      },
    },
  };
  return { prisma: prisma as unknown as PrismaService, lookups };
}

describe('academy scope', () => {
  it('super admin: every academy, without asking the database', async () => {
    const { prisma, lookups } = fakePrisma();
    await expect(academyScope(prisma, superAdmin)).resolves.toEqual({
      all: true,
      centerId: null,
    });
    expect(lookups).toHaveLength(0);
  });

  it('center admin: only the academy of their own account', async () => {
    const { prisma, lookups } = fakePrisma();
    await expect(academyScope(prisma, adminA)).resolves.toEqual({
      all: false,
      centerId: 'academy-1',
    });
    expect(lookups).toEqual(['a1']);
  });

  it('center admin without an academy: 403', async () => {
    const { prisma } = fakePrisma();
    await expect(academyScope(prisma, noAcademy)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('assertManagesAcademy: own academy passes, another one is a 403', async () => {
    const { prisma } = fakePrisma();
    await expect(
      assertManagesAcademy(prisma, adminA, 'academy-1'),
    ).resolves.toBeUndefined();
    await expect(
      assertManagesAcademy(prisma, adminA, 'academy-2'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('assertManagesAcademy: a super admin manages every academy', async () => {
    const { prisma } = fakePrisma();
    await expect(
      assertManagesAcademy(prisma, superAdmin, 'academy-2'),
    ).resolves.toBeUndefined();
  });
});
