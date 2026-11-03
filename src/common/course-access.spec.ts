import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertCanOpenCourse,
  canOpenCourse,
  CourseRef,
  isHiddenFrom,
} from './course-access';

const course: CourseRef = {
  id: 'c1',
  centerId: 'academy-1',
  price: 120,
  status: 'ACTIVE',
};
const student = { id: 'u1', role: 'STUDENT' };
const ownAdmin = { id: 'a1', role: 'CENTER_ADMIN' };
const otherAdmin = { id: 'a2', role: 'CENTER_ADMIN' };
const superAdmin = { id: 's1', role: 'SUPER_ADMIN' };

type CountQuery = {
  where: { stageId: string; order: { userId: string; status: string } };
};

// A fake Prisma: admin a1 belongs to academy-1, a2 to academy-2, and the
// users in `buyers` have a PAID order for course c1. Every query is recorded.
function fakePrisma(buyers: string[]) {
  const queries: { model: string; query: unknown }[] = [];
  const academies: Record<string, string> = {
    a1: 'academy-1',
    a2: 'academy-2',
  };
  const prisma = {
    user: {
      findUnique: (query: { where: { id: string } }) => {
        queries.push({ model: 'user', query });
        return Promise.resolve({ centerId: academies[query.where.id] ?? null });
      },
    },
    orderItem: {
      count: (query: CountQuery) => {
        queries.push({ model: 'orderItem', query });
        const { stageId, order } = query.where;
        const paid =
          stageId === 'c1' &&
          order.status === 'PAID' &&
          buyers.includes(order.userId);
        return Promise.resolve(paid ? 1 : 0);
      },
    },
  };
  return { prisma: prisma as unknown as PrismaService, queries };
}

describe('course access', () => {
  describe('canOpenCourse', () => {
    it('super admin: always, without asking the database', async () => {
      const { prisma, queries } = fakePrisma([]);
      await expect(canOpenCourse(prisma, superAdmin, course)).resolves.toBe(
        true,
      );
      expect(queries).toHaveLength(0);
    });

    it('free course (price 0): every logged-in user', async () => {
      const { prisma } = fakePrisma([]);
      const free = { ...course, price: 0 };
      await expect(canOpenCourse(prisma, student, free)).resolves.toBe(true);
    });

    it('student with a PAID order for the course: yes', async () => {
      const { prisma, queries } = fakePrisma(['u1']);
      await expect(canOpenCourse(prisma, student, course)).resolves.toBe(true);
      expect(queries).toEqual([
        {
          model: 'orderItem',
          query: {
            where: {
              stageId: 'c1',
              order: { userId: 'u1', status: 'PAID' },
            },
          },
        },
      ]);
    });

    it('student without a PAID order: no', async () => {
      const { prisma } = fakePrisma([]);
      await expect(canOpenCourse(prisma, student, course)).resolves.toBe(false);
    });

    it('admin of the academy that owns the course: yes', async () => {
      const { prisma } = fakePrisma([]);
      await expect(canOpenCourse(prisma, ownAdmin, course)).resolves.toBe(true);
    });

    it('admin of another academy: no, unless they bought it', async () => {
      await expect(
        canOpenCourse(fakePrisma([]).prisma, otherAdmin, course),
      ).resolves.toBe(false);
      await expect(
        canOpenCourse(fakePrisma(['a2']).prisma, otherAdmin, course),
      ).resolves.toBe(true);
    });
  });

  describe('isHiddenFrom', () => {
    it('students never see draft or cancelled courses', () => {
      expect(isHiddenFrom(student, 'DRAFT')).toBe(true);
      expect(isHiddenFrom(student, 'CANCELLED')).toBe(true);
      expect(isHiddenFrom(student, 'ACTIVE')).toBe(false);
      expect(isHiddenFrom(student, 'FULL')).toBe(false);
      expect(isHiddenFrom(student, 'COMPLETED')).toBe(false);
    });

    it('admins see every course', () => {
      expect(isHiddenFrom(ownAdmin, 'DRAFT')).toBe(false);
      expect(isHiddenFrom(superAdmin, 'CANCELLED')).toBe(false);
    });
  });

  describe('assertCanOpenCourse', () => {
    it('404 for a student opening a draft course they did not buy', async () => {
      const { prisma } = fakePrisma([]);
      const draft = { ...course, status: 'DRAFT' as const };
      await expect(assertCanOpenCourse(prisma, student, draft)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('403 for a student who has not bought the course', async () => {
      const { prisma } = fakePrisma([]);
      await expect(
        assertCanOpenCourse(prisma, student, course),
      ).rejects.toThrow(ForbiddenException);
    });

    it('passes for a student who bought the course', async () => {
      const { prisma } = fakePrisma(['u1']);
      await expect(
        assertCanOpenCourse(prisma, student, course),
      ).resolves.toBeUndefined();
    });
  });
});
