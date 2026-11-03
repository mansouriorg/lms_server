// src/common/course-access.ts
// Who may see a course, who may order it, and who may open its lessons (and
// their video links).
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role, StageStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

// The logged-in user, as JwtStrategy.validate puts it on the request.
export type CourseViewer = { id: string; role: string };

// The course fields the checks below need.
export type CourseRef = {
  id: string;
  centerId: string;
  price: number;
  status: StageStatus;
};

// Out of the catalog: draft and cancelled courses are not listed and cannot
// be ordered. The students who bought one keep access to it (canSeeCourse),
// and the admins of its academy manage it.
export const HIDDEN_FROM_STUDENTS: StageStatus[] = [
  StageStatus.DRAFT,
  StageStatus.CANCELLED,
];

// In the catalog, but closed to new orders ("Full" and "Finished").
export const CLOSED_FOR_ORDERS: StageStatus[] = [
  StageStatus.FULL,
  StageStatus.COMPLETED,
];

// `viewer` is null for visitors who are not signed in (the public catalog).
export function isAdmin(viewer: CourseViewer | null): boolean {
  const role = viewer?.role;
  return role === Role.CENTER_ADMIN || role === Role.SUPER_ADMIN;
}

export function isSuperAdmin(viewer: CourseViewer | null): boolean {
  return viewer?.role === Role.SUPER_ADMIN;
}

// The status alone: is the course out of the catalog for this kind of
// viewer? canSeeCourse also looks at the academy and at purchases.
export function isHiddenFrom(
  viewer: CourseViewer | null,
  status: StageStatus,
): boolean {
  return isAdmin(viewer) ? false : HIDDEN_FROM_STUDENTS.includes(status);
}

// The academy of a center admin; null for every other viewer.
async function adminAcademyId(
  prisma: PrismaService,
  viewer: CourseViewer | null,
): Promise<string | null> {
  if (viewer?.role !== Role.CENTER_ADMIN) {
    return null;
  }
  const admin = await prisma.user.findUnique({
    where: { id: viewer.id },
    select: { centerId: true },
  });
  return admin?.centerId ?? null;
}

// Does the user have a PAID order that contains the course?
async function hasPaidFor(
  prisma: PrismaService,
  userId: string,
  courseId: string,
): Promise<boolean> {
  const paidItems = await prisma.orderItem.count({
    where: {
      stageId: courseId,
      order: { userId, status: 'PAID' },
    },
  });
  return paidItems > 0;
}

// The filter of the course lists (GET /stages, GET /centers/:id):
// - published courses (not draft or cancelled) for everyone;
// - plus the draft and cancelled courses of their own academy for a center
//   admin;
// - every course for a super admin.
// Students find the hidden courses they bought in "My courses".
export async function visibleCoursesWhere(
  prisma: PrismaService,
  viewer: CourseViewer | null,
) {
  if (isSuperAdmin(viewer)) {
    return {};
  }
  const published = { status: { notIn: HIDDEN_FROM_STUDENTS } };
  const centerId = await adminAcademyId(prisma, viewer);
  return centerId === null ? published : { OR: [published, { centerId }] };
}

// May the viewer see this course (its page and its outline)?
// - a published course (also Full or Finished): everyone, visitors too;
// - a draft or cancelled course: super admins, admins of its academy, and
//   the students who bought it (they keep access).
export async function canSeeCourse(
  prisma: PrismaService,
  viewer: CourseViewer | null,
  course: CourseRef,
): Promise<boolean> {
  if (HIDDEN_FROM_STUDENTS.includes(course.status) === false) {
    return true;
  }
  if (viewer === null || viewer === undefined) {
    return false;
  }
  if (isSuperAdmin(viewer)) {
    return true;
  }
  if ((await adminAcademyId(prisma, viewer)) === course.centerId) {
    return true;
  }
  return hasPaidFor(prisma, viewer.id, course.id);
}

// A course's lessons (and their video links) are only for:
// - super admins;
// - every logged-in user when the course is free (price 0);
// - admins of the academy that owns the course;
// - users with a PAID order that contains the course.
export async function canOpenCourse(
  prisma: PrismaService,
  viewer: CourseViewer | null,
  course: CourseRef,
): Promise<boolean> {
  // Visitors who are not signed in never get the lessons, even of a free course
  if (viewer === null || viewer === undefined) {
    return false;
  }
  if (viewer.role === Role.SUPER_ADMIN || course.price === 0) {
    return true;
  }
  if ((await adminAcademyId(prisma, viewer)) === course.centerId) {
    return true;
  }
  return hasPaidFor(prisma, viewer.id, course.id);
}

// Throws the right HTTP error when the viewer may not open the course:
// 404 when they may not see it (same answer as a course that does not
// exist), 403 when they have not bought it.
export async function assertCanOpenCourse(
  prisma: PrismaService,
  viewer: CourseViewer,
  course: CourseRef,
): Promise<void> {
  if ((await canSeeCourse(prisma, viewer, course)) === false) {
    throw new NotFoundException('Course not found.');
  }
  if (await canOpenCourse(prisma, viewer, course)) {
    return;
  }
  throw new ForbiddenException('Buy this course to open its lessons.');
}
