// src/bookings/bookings.service.ts
// Live sessions: a student asks an admin of an academy whose course they
// bought for a mentoring call or a webinar (status PENDING); the admin
// confirms it (status PAID, shown as "Confirmed") with a meeting link, or
// cancels it. The student can cancel their own request.
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Actor } from '../common/academy-scope';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingStatus, Role } from 'src/generated/prisma/enums';

// "2026-11-05" -> that day at 00:00 UTC, or null when the day does not exist
// (2026-02-30).
function calendarDay(day: string): Date | null {
  const date = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10) === day ? date : null;
}

// The academy admins a student may book: their names and academy.
const INSTRUCTOR_FIELDS = {
  id: true,
  firstName: true,
  lastName: true,
  center: { select: { id: true, name: true } },
} as const;

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  // The academies of the courses the student bought (a PAID order).
  private async academiesOf(userId: string): Promise<string[]> {
    const items = await this.prisma.orderItem.findMany({
      where: { order: { userId, status: 'PAID' }, stageId: { not: null } },
      select: { stage: { select: { centerId: true } } },
    });
    const ids = items
      .map((item) => item.stage?.centerId ?? null)
      .filter((id): id is string => id !== null);
    return [...new Set(ids)];
  }

  // GET /bookings/instructors: who the student can book, the admins of the
  // academies of the courses they bought.
  async bookableInstructors(userId: string) {
    const academies = await this.academiesOf(userId);
    if (academies.length === 0) return [];
    return this.prisma.user.findMany({
      where: { role: Role.CENTER_ADMIN, centerId: { in: academies } },
      select: INSTRUCTOR_FIELDS,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  // POST /bookings
  async create(userId: string, dto: CreateBookingDto) {
    const day = calendarDay(dto.date);
    if (day === null) {
      throw new BadRequestException('This date does not exist.');
    }
    const today = new Date().toISOString().slice(0, 10);
    if (dto.date < today) {
      throw new BadRequestException('Please choose a day that is not past.');
    }
    if (dto.endTime <= dto.startTime) {
      throw new BadRequestException('The session must end after it starts.');
    }
    if (dto.instructorId === userId) {
      throw new BadRequestException('You cannot book a session with yourself.');
    }

    // Only an academy admin, of an academy whose course the student bought
    const instructor = await this.prisma.user.findUnique({
      where: { id: dto.instructorId },
      select: { id: true, role: true, centerId: true },
    });
    if (
      instructor === null ||
      instructor.role !== Role.CENTER_ADMIN ||
      instructor.centerId === null
    ) {
      throw new NotFoundException('Instructor not found.');
    }
    const academies = await this.academiesOf(userId);
    if (academies.includes(instructor.centerId) === false) {
      throw new ForbiddenException(
        'You can book a session with the academies of the courses you bought.',
      );
    }

    const booking = await this.prisma.booking.create({
      data: {
        title: dto.title,
        type: dto.type,
        date: day,
        startTime: dto.startTime,
        endTime: dto.endTime,
        userId,
        instructorId: instructor.id,
        // status: PENDING (the default), until the academy confirms it
      },
    });
    return { message: 'Session requested.', booking };
  }

  // GET /bookings/my-bookings: the student's sessions, the soonest first,
  // with the name and academy of who they meet.
  async getUserBookings(userId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: { userId },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
    const ids = [...new Set(bookings.map((booking) => booking.instructorId))];
    const instructors =
      ids.length === 0
        ? []
        : await this.prisma.user.findMany({
            where: { id: { in: ids } },
            select: INSTRUCTOR_FIELDS,
          });
    const byId = new Map(instructors.map((person) => [person.id, person]));
    return bookings.map((booking) => ({
      ...booking,
      instructor: byId.get(booking.instructorId) ?? null,
    }));
  }

  // PATCH /bookings/:id/cancel: the student cancels their own request or
  // session. Someone else's session is a 404, like one that does not exist.
  async cancelOwn(userId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, userId: true, status: true },
    });
    if (booking === null || booking.userId !== userId) {
      throw new NotFoundException('Session not found.');
    }
    if (
      booking.status === BookingStatus.CANCELLED ||
      booking.status === BookingStatus.REFUNDED
    ) {
      throw new BadRequestException('This session is already cancelled.');
    }
    const updated = await this.prisma.booking.update({
      where: { id: booking.id },
      data: { status: BookingStatus.CANCELLED },
    });
    return { message: 'Session cancelled.', booking: updated };
  }

  // GET /bookings/instructor/my-sessions: the sessions students booked with
  // this admin, the soonest first, with how to reach the student.
  async getInstructorBookings(instructorId: string) {
    return this.prisma.booking.findMany({
      where: { instructorId },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
  }

  // GET /bookings/admin/all (super admins): every session, newest first
  async findAllForAdmin() {
    return this.prisma.booking.findMany({
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true, phone: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // PATCH /bookings/:id/status: confirm (PAID), cancel... and optionally add
  // the meeting link. Only the instructor who hosts the session (or a super
  // admin) may change it.
  async updateStatus(
    actor: Actor,
    bookingId: string,
    status: BookingStatus,
    meetingLink?: string,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (booking === null) {
      throw new NotFoundException('Session not found.');
    }

    if (actor.role !== 'SUPER_ADMIN' && booking.instructorId !== actor.id) {
      throw new ForbiddenException('Only the session host can change it.');
    }

    // A cancelled session stays cancelled (the student may have cancelled it
    // in the meantime); only a refund can still be recorded.
    if (
      (booking.status === BookingStatus.CANCELLED ||
        booking.status === BookingStatus.REFUNDED) &&
      status !== BookingStatus.REFUNDED
    ) {
      throw new BadRequestException('This session is already cancelled.');
    }

    const updatedBooking = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status,
        ...(meetingLink && { meetingLink }), // Only update the link if one was provided
      },
    });

    return {
      message: 'Session status updated.',
      booking: updatedBooking,
    };
  }
}
