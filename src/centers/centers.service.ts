// src/centers/centers.service.ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../generated/prisma/enums';
import { Actor, assertManagesAcademy } from '../common/academy-scope';
import {
  CourseViewer,
  HIDDEN_FROM_STUDENTS,
  visibleCoursesWhere,
} from '../common/course-access';
import { CreateCenterDto } from './dto/create-center.dto';
import { UpdateCenterDto } from './dto/update-center.dto';

// "1 course", "3 courses"
function countOf(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

// "a", "a and b", "a, b and c"
function listOf(parts: string[]): string {
  if (parts.length < 2) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

// What the platform admins see of an academy admin (never the password)
export const ADMIN_FIELDS = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} as const;

export const NO_ACCOUNT =
  'No account uses this email. The person signs up first, then you add them.';
export const IS_PLATFORM_ADMIN =
  'This account is a platform admin: it already manages every academy.';
export const NOT_AN_ADMIN = 'This account is not an admin of this academy.';

// "Amira Ben Ali", or the email when the account has no name
function personName(user: {
  firstName: string;
  lastName: string;
  email: string;
}): string {
  const name = `${user.firstName} ${user.lastName}`.trim();
  return name === '' ? user.email : name;
}

@Injectable()
export class CentersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCenterDto) {
    const center = await this.prisma.center.create({
      data: dto,
    });
    return { message: 'Academy created.', center };
  }

  // GET /centers (public): every academy, by name, with the number of
  // courses students can see (not the drafts or cancelled ones)
  async findAll() {
    return this.prisma.center.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            stages: { where: { status: { notIn: HIDDEN_FROM_STUDENTS } } },
          },
        },
      },
    });
  }

  // GET /centers/:id (public): the academy and its courses, the newest first.
  // Visitors and students see the published ones; the academy's own admins
  // and super admins also see the drafts and cancelled ones.
  async findOne(id: string, viewer: CourseViewer | null) {
    const center = await this.prisma.center.findUnique({
      where: { id },
      include: {
        stages: {
          where: await visibleCoursesWhere(this.prisma, viewer),
          orderBy: { createdAt: 'desc' },
          include: { _count: { select: { modules: true } } },
        },
      },
    });

    if (center === null) throw new NotFoundException('Academy not found.');
    return center;
  }

  // GET /centers/admin/overview (platform admins): every academy, by name,
  // with its contact details, its numbers of courses (drafts too), digital
  // products and coupons (an academy is only deleted without them), and its
  // admins
  async overview() {
    return this.prisma.center.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        location: true,
        contactEmail: true,
        contactPhone: true,
        createdAt: true,
        _count: { select: { stages: true, products: true, coupons: true } },
        admins: {
          where: { role: Role.CENTER_ADMIN },
          orderBy: { createdAt: 'asc' },
          select: ADMIN_FIELDS,
        },
      },
    });
  }

  // POST /centers/:id/admins (platform admins): an existing account becomes
  // an admin of the academy. A platform admin, or the admin of another
  // academy, is refused (409). The new role counts from the next request
  // (src/auth/jwt.strategy.ts reads it on every request).
  async addAdmin(centerId: string, email: string) {
    const center = await this.prisma.center.findUnique({
      where: { id: centerId },
      select: { id: true, name: true },
    });
    if (center === null) throw new NotFoundException('Academy not found.');

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        role: true,
        centerId: true,
        center: { select: { name: true } },
      },
    });
    if (user === null) throw new NotFoundException(NO_ACCOUNT);
    if (user.role === Role.SUPER_ADMIN) {
      throw new ConflictException(IS_PLATFORM_ADMIN);
    }
    if (user.role === Role.CENTER_ADMIN && user.centerId === centerId) {
      throw new ConflictException(
        `This account is already an admin of ${center.name}.`,
      );
    }
    if (user.role === Role.CENTER_ADMIN && user.centerId !== null) {
      const other = user.center?.name ?? 'another academy';
      throw new ConflictException(
        `This account is an admin of ${other}: remove it there first.`,
      );
    }

    const admin = await this.prisma.user.update({
      where: { id: user.id },
      data: { role: Role.CENTER_ADMIN, centerId },
      select: ADMIN_FIELDS,
    });
    return {
      message: `${personName(admin)} is now an admin of ${center.name}. The app opens the academy space for them the next time they load it.`,
      admin,
    };
  }

  // DELETE /centers/:id/admins/:userId (platform admins): the account is a
  // student account again, without an academy
  async removeAdmin(centerId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ...ADMIN_FIELDS, role: true, centerId: true },
    });
    if (
      user === null ||
      user.role !== Role.CENTER_ADMIN ||
      user.centerId !== centerId
    ) {
      throw new NotFoundException(NOT_AN_ADMIN);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { role: Role.STUDENT, centerId: null },
      select: { id: true },
    });
    return {
      message: `${personName(user)} is no longer an admin of this academy: the account is a student account again.`,
    };
  }

  async update(id: string, dto: UpdateCenterDto, actor: Actor) {
    // Center admins may only edit their own academy
    await assertManagesAcademy(this.prisma, actor, id);
    const center = await this.prisma.center.findUnique({ where: { id } });
    if (center === null) throw new NotFoundException('Academy not found.');

    const updatedCenter = await this.prisma.center.update({
      where: { id },
      data: dto,
    });

    return { message: 'Academy updated.', center: updatedCenter };
  }

  // DELETE /centers/:id (super admins). Refused (409) while the academy
  // still has courses (the database refused them with a 500 before), digital
  // products, coupons or admins: deleting the academy turned its coupons into
  // platform-wide ones, valid on every academy's courses, and left its admins
  // as academy admins without an academy.
  async remove(id: string) {
    const center = await this.prisma.center.findUnique({
      where: { id },
      include: {
        _count: {
          select: { stages: true, products: true, coupons: true, admins: true },
        },
      },
    });
    if (center === null) throw new NotFoundException('Academy not found.');

    const left = [
      center._count.stages > 0 ? countOf(center._count.stages, 'course') : '',
      center._count.products > 0
        ? countOf(center._count.products, 'digital product')
        : '',
      center._count.coupons > 0 ? countOf(center._count.coupons, 'coupon') : '',
      center._count.admins > 0 ? countOf(center._count.admins, 'admin') : '',
    ].filter((part) => part !== '');
    if (left.length > 0) {
      throw new ConflictException(
        `${center.name} still has ${listOf(left)}: only an academy without courses, digital products, coupons or admins can be deleted.`,
      );
    }

    await this.prisma.center.delete({ where: { id } });
    return { message: 'Academy deleted.' };
  }
}
