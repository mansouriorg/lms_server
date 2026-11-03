import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertCanOpenCourse,
  canSeeCourse,
  CourseRef,
  visibleCoursesWhere,
} from './course-access';

const cancelled: CourseRef = {
  id: 'c1',
  centerId: 'academy-1',
  price: 120,
  status: 'CANCELLED',
};
const published: CourseRef = { ...cancelled, status: 'FULL' };
const buyer = { id: 'u1', role: 'STUDENT' };
const student = { id: 'u2', role: 'STUDENT' };
const ownAdmin = { id: 'a1', role: 'CENTER_ADMIN' };
const otherAdmin = { id: 'a2', role: 'CENTER_ADMIN' };
const superAdmin = { id: 's1', role: 'SUPER_ADMIN' };

type CountQuery = {
  where: { stageId: string; order: { userId: string; status: string } };
};

// A fake Prisma: admin a1 belongs to academy-1, a2 to academy-2; student u1
// has a PAID order for course c1. Every query is recorded.
function fakePrisma() {
  const queries: string[] = [];
  const academies: Record<string, string> = {
    a1: 'academy-1',
    a2: 'academy-2',
  };
  const prisma = {
    user: {
      findUnique: (query: { where: { id: string } }) => {
        queries.push('user');
        return Promise.resolve({ centerId: academies[query.where.id] ?? null });
      },
    },
    orderItem: {
      count: (query: CountQuery) => {
        queries.push('orderItem');
        const { stageId, order } = query.where;
        const paid =
          stageId === 'c1' && order.status === 'PAID' && order.userId === 'u1';
        return Promise.resolve(paid ? 1 : 0);
      },
    },
  };
  return { prisma: prisma as unknown as PrismaService, queries };
}

describe('who sees a course (canSeeCourse, visibleCoursesWhere)', () => {
  it('a published course, also Full or Finished: everyone, without asking the database', async () => {
    const { prisma, queries } = fakePrisma();
    await expect(canSeeCourse(prisma, null, published)).resolves.toBe(true);
    await expect(canSeeCourse(prisma, student, published)).resolves.toBe(true);
    expect(queries).toEqual([]);
  });

  it('a cancelled course: the students who bought it keep it, the others do not see it', async () => {
    const { prisma } = fakePrisma();
    await expect(canSeeCourse(prisma, buyer, cancelled)).resolves.toBe(true);
    await expect(canSeeCourse(prisma, student, cancelled)).resolves.toBe(false);
    await expect(canSeeCourse(prisma, null, cancelled)).resolves.toBe(false);
  });

  it('a cancelled course: admins of its academy and super admins, not other academies', async () => {
    const { prisma } = fakePrisma();
    await expect(canSeeCourse(prisma, ownAdmin, cancelled)).resolves.toBe(true);
    await expect(canSeeCourse(prisma, superAdmin, cancelled)).resolves.toBe(
      true,
    );
    await expect(canSeeCourse(prisma, otherAdmin, cancelled)).resolves.toBe(
      false,
    );
  });

  it('opening the lessons: the buyer of a cancelled course still can, other students get a 404', async () => {
    const { prisma } = fakePrisma();
    await expect(
      assertCanOpenCourse(prisma, buyer, cancelled),
    ).resolves.toBeUndefined();
    await expect(
      assertCanOpenCourse(prisma, student, cancelled),
    ).rejects.toThrow(NotFoundException);
  });

  it('the lists: published courses, plus the hidden ones of their own academy for an admin', async () => {
    const { prisma, queries } = fakePrisma();
    const publishedOnly = { status: { notIn: ['DRAFT', 'CANCELLED'] } };
    await expect(visibleCoursesWhere(prisma, null)).resolves.toEqual(
      publishedOnly,
    );
    await expect(visibleCoursesWhere(prisma, student)).resolves.toEqual(
      publishedOnly,
    );
    expect(queries).toEqual([]);
    await expect(visibleCoursesWhere(prisma, otherAdmin)).resolves.toEqual({
      OR: [publishedOnly, { centerId: 'academy-2' }],
    });
    await expect(visibleCoursesWhere(prisma, superAdmin)).resolves.toEqual({});
  });
});
