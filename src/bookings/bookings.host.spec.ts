import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BookingsService } from './bookings.service';
import { UpdateBookingStatusDto } from './dto/update-booking.dto';
import { PrismaService } from '../prisma/prisma.service';

const host = { id: 'a1', role: 'CENTER_ADMIN' };
const superAdmin = { id: 'x1', role: 'SUPER_ADMIN' };
const LINK = 'https://meet.example.com/abc-defg';

// Two sessions hosted by a1: b1 waits for an answer, b2 was cancelled by the
// student. Every update and every list query is recorded.
async function setup() {
  const sessions = [
    { id: 'b1', userId: 's1', instructorId: 'a1', status: 'PENDING' },
    { id: 'b2', userId: 's1', instructorId: 'a1', status: 'CANCELLED' },
  ];
  const updates: unknown[] = [];
  const lists: unknown[] = [];
  const prisma = {
    booking: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve(
          sessions.find((session) => session.id === query.where.id) ?? null,
        ),
      update: (query: { where: { id: string }; data: object }) => {
        updates.push(query);
        return Promise.resolve({ id: query.where.id, ...query.data });
      },
      findMany: (query: unknown) => {
        lists.push(query);
        return Promise.resolve([]);
      },
    },
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [BookingsService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return {
    service: module.get<BookingsService>(BookingsService),
    updates,
    lists,
  };
}

// The body after validation, and the fields refused (like the app's
// ValidationPipe)
async function check(body: object) {
  const dto = plainToInstance(UpdateBookingStatusDto, body);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, fields: errors.map((error) => error.property) };
}

describe('Live sessions, the academy side (PATCH /bookings/:id/status)', () => {
  it('the form: a status, and a web link (trimmed) or nothing', async () => {
    expect((await check({ status: 'PAID' })).fields).toEqual([]);
    const trimmed = await check({ status: 'PAID', meetingLink: `  ${LINK} ` });
    expect(trimmed.fields).toEqual([]);
    expect(trimmed.dto.meetingLink).toBe(LINK);
    const short = await check({
      status: 'PAID',
      meetingLink: 'meet.example.com/abc',
    });
    expect(short.fields).toEqual([]);
    for (const meetingLink of [
      'javascript:alert(1)',
      'ftp://files.example.com/a',
      'not a link',
      `${LINK}/${'a'.repeat(500)}`,
    ]) {
      expect((await check({ status: 'PAID', meetingLink })).fields).toEqual([
        'meetingLink',
      ]);
    }
    expect((await check({ status: 'DONE' })).fields).toEqual(['status']);
  });

  it('the host confirms with the link; a link is only saved when given', async () => {
    const { service, updates } = await setup();
    await service.updateStatus(host, 'b1', 'PAID', LINK);
    await service.updateStatus(host, 'b1', 'CANCELLED');
    expect(updates).toEqual([
      { where: { id: 'b1' }, data: { status: 'PAID', meetingLink: LINK } },
      { where: { id: 'b1' }, data: { status: 'CANCELLED' } },
    ]);
  });

  it('a cancelled session stays cancelled (400), nothing is saved', async () => {
    const { service, updates } = await setup();
    const error: unknown = await service
      .updateStatus(host, 'b2', 'PAID', LINK)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual({
      statusCode: 400,
      message: 'This session is already cancelled.',
      error: 'Bad Request',
    });
    await expect(service.updateStatus(host, 'b2', 'CANCELLED')).rejects.toThrow(
      BadRequestException,
    );
    expect(updates).toEqual([]);
    // Only a refund can still be recorded
    await service.updateStatus(superAdmin, 'b2', 'REFUNDED');
    expect(updates).toEqual([
      { where: { id: 'b2' }, data: { status: 'REFUNDED' } },
    ]);
  });

  it("the host's list: their sessions, with how to reach the student", async () => {
    const { service, lists } = await setup();
    await service.getInstructorBookings('a1');
    expect(lists).toEqual([
      {
        where: { instructorId: 'a1' },
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
      },
    ]);
  });
});
