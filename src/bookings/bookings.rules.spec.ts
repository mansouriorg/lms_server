import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

type Person = { id: string; role: string; centerId: string | null };

// Student s1 bought a course of academy-1 (twice, in two orders). a1 is an
// admin of academy-1, a2 of academy-2; s2 is another student.
const PEOPLE: Person[] = [
  { id: 's1', role: 'STUDENT', centerId: null },
  { id: 's2', role: 'STUDENT', centerId: null },
  { id: 'a1', role: 'CENTER_ADMIN', centerId: 'academy-1' },
  { id: 'a2', role: 'CENTER_ADMIN', centerId: 'academy-2' },
];
const SESSIONS = [
  { id: 'b1', userId: 's1', instructorId: 'a1', status: 'PENDING' },
  { id: 'b2', userId: 's1', instructorId: 'a1', status: 'CANCELLED' },
];

const REQUEST = {
  title: 'Help with my project',
  type: 'MENTORSHIP' as const,
  date: '2099-01-05',
  startTime: '14:00',
  endTime: '15:00',
  instructorId: 'a1',
};

// What Nest reads on a controller method: guards and roles.
function metadataOf(key: string, method: keyof BookingsController): unknown {
  const handler: unknown = Object.getOwnPropertyDescriptor(
    BookingsController.prototype,
    method,
  )?.value;
  return Reflect.getMetadata(key, handler as object);
}

async function refused(body: object) {
  const errors = await validate(plainToInstance(CreateBookingDto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((error) => ({
    field: error.property,
    messages: Object.values(error.constraints ?? {}),
  }));
}

// A fake Prisma over PEOPLE and SESSIONS. Every query is recorded.
async function setup() {
  const queries: { model: string; query: unknown }[] = [];
  const record = (model: string, query: unknown) => {
    queries.push({ model, query });
  };
  const prisma = {
    orderItem: {
      findMany: (query: { where: { order: { userId: string } } }) => {
        record('orderItem.findMany', query);
        return Promise.resolve(
          query.where.order.userId === 's1'
            ? [
                { stage: { centerId: 'academy-1' } },
                { stage: { centerId: 'academy-1' } },
              ]
            : [],
        );
      },
    },
    user: {
      findUnique: (query: { where: { id: string } }) => {
        record('user.findUnique', query);
        return Promise.resolve(
          PEOPLE.find((person) => person.id === query.where.id) ?? null,
        );
      },
      findMany: (query: unknown) => {
        record('user.findMany', query);
        return Promise.resolve([
          {
            id: 'a1',
            firstName: 'Sami',
            lastName: 'Trabelsi',
            center: { id: 'academy-1', name: 'Code Academy' },
          },
        ]);
      },
    },
    booking: {
      create: (query: { data: object }) => {
        record('booking.create', query);
        return Promise.resolve({ id: 'b9', status: 'PENDING', ...query.data });
      },
      findMany: (query: unknown) => {
        record('booking.findMany', query);
        return Promise.resolve([SESSIONS[0]]);
      },
      findUnique: (query: { where: { id: string } }) => {
        record('booking.findUnique', query);
        return Promise.resolve(
          SESSIONS.find((session) => session.id === query.where.id) ?? null,
        );
      },
      update: (query: { data: object }) => {
        record('booking.update', query);
        return Promise.resolve({ id: 'b1', ...query.data });
      },
    },
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [BookingsService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  const models = () => queries.map((entry) => entry.model);
  const queriesOf = (model: string) =>
    queries
      .filter((entry) => entry.model === model)
      .map((entry) => entry.query);
  return {
    service: module.get<BookingsService>(BookingsService),
    models,
    queriesOf,
  };
}

// The HTTP status and message of a refused call
async function refusal(call: Promise<unknown>) {
  const error: unknown = await call.catch((caught: unknown) => caught);
  const response = (error as BadRequestException).getResponse() as {
    statusCode: number;
    message: string;
  };
  return { status: response.statusCode, message: response.message };
}

describe('Live sessions: who books whom, and when (/bookings)', () => {
  it('routes: a token everywhere; the academy side needs an admin role', () => {
    expect(Reflect.getMetadata('__guards__', BookingsController)).toEqual([
      JwtAuthGuard,
    ]);
    for (const method of [
      'getBookableInstructors',
      'create',
      'getUserBookings',
      'cancelOwn',
    ] as const) {
      expect(metadataOf(ROLES_KEY, method)).toBeUndefined();
    }
    expect(metadataOf(ROLES_KEY, 'getInstructorBookings')).toEqual([
      'CENTER_ADMIN',
      'SUPER_ADMIN',
    ]);
    expect(metadataOf(ROLES_KEY, 'updateStatus')).toEqual([
      'CENTER_ADMIN',
      'SUPER_ADMIN',
    ]);
  });

  it('the form: a title, a day like 2026-11-05 and times like 14:00', async () => {
    await expect(refused(REQUEST)).resolves.toEqual([]);
    const fields = (
      await refused({
        ...REQUEST,
        title: '   ',
        date: '05/01/2099',
        startTime: '2pm',
        endTime: '25:00',
        userId: 's2',
      })
    ).map((error) => error.field);
    expect(fields.sort()).toEqual([
      'date',
      'endTime',
      'startTime',
      'title',
      'userId',
    ]);
  });

  it('who can be booked: the admins of the academies of the courses bought', async () => {
    const { service, queriesOf } = await setup();
    await expect(service.bookableInstructors('s1')).resolves.toHaveLength(1);
    expect(queriesOf('orderItem.findMany')).toMatchObject([
      { where: { order: { userId: 's1', status: 'PAID' } } },
    ]);
    expect(queriesOf('user.findMany')).toMatchObject([
      { where: { role: 'CENTER_ADMIN', centerId: { in: ['academy-1'] } } },
    ]);

    const nothingBought = await setup();
    await expect(
      nothingBought.service.bookableInstructors('s2'),
    ).resolves.toEqual([]);
    expect(nothingBought.models()).not.toContain('user.findMany');
  });

  it('a request to an admin of their academy: saved, waiting for the academy', async () => {
    const { service, queriesOf } = await setup();
    await expect(
      service.create('s1', { ...REQUEST, title: 'Help with my project' }),
    ).resolves.toMatchObject({ message: 'Session requested.' });
    expect(queriesOf('booking.create')).toEqual([
      {
        data: {
          title: 'Help with my project',
          type: 'MENTORSHIP',
          date: new Date('2099-01-05T00:00:00.000Z'),
          startTime: '14:00',
          endTime: '15:00',
          userId: 's1',
          instructorId: 'a1',
        },
      },
    ]);
  });

  it('another academy, a student or an unknown account: refused, nothing saved', async () => {
    const { service, models } = await setup();
    await expect(
      refusal(service.create('s1', { ...REQUEST, instructorId: 'a2' })),
    ).resolves.toEqual({
      status: 403,
      message:
        'You can book a session with the academies of the courses you bought.',
    });
    await expect(
      service.create('s1', { ...REQUEST, instructorId: 's2' }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.create('s1', { ...REQUEST, instructorId: 'nobody' }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.create('s2', { ...REQUEST, instructorId: 'a1' }),
    ).rejects.toThrow(ForbiddenException);
    expect(models()).not.toContain('booking.create');
  });

  it('a past day, a day that does not exist, an end before the start, yourself: 400', async () => {
    const { service, models } = await setup();
    await expect(
      refusal(service.create('s1', { ...REQUEST, date: '2020-01-05' })),
    ).resolves.toEqual({
      status: 400,
      message: 'Please choose a day that is not past.',
    });
    await expect(
      refusal(service.create('s1', { ...REQUEST, date: '2099-02-30' })),
    ).resolves.toEqual({ status: 400, message: 'This date does not exist.' });
    await expect(
      refusal(
        service.create('s1', {
          ...REQUEST,
          startTime: '15:00',
          endTime: '15:00',
        }),
      ),
    ).resolves.toEqual({
      status: 400,
      message: 'The session must end after it starts.',
    });
    await expect(
      service.create('a1', { ...REQUEST, instructorId: 'a1' }),
    ).rejects.toThrow(BadRequestException);
    expect(models()).not.toContain('booking.create');
  });

  it("the student's sessions: with the name and academy of who they meet", async () => {
    const { service, queriesOf } = await setup();
    await expect(service.getUserBookings('s1')).resolves.toEqual([
      {
        ...SESSIONS[0],
        instructor: {
          id: 'a1',
          firstName: 'Sami',
          lastName: 'Trabelsi',
          center: { id: 'academy-1', name: 'Code Academy' },
        },
      },
    ]);
    expect(queriesOf('booking.findMany')).toMatchObject([
      { where: { userId: 's1' } },
    ]);
  });

  it('cancelling: their own session only; once', async () => {
    const { service, queriesOf } = await setup();
    await expect(service.cancelOwn('s1', 'b1')).resolves.toMatchObject({
      message: 'Session cancelled.',
    });
    expect(queriesOf('booking.update')).toEqual([
      { where: { id: 'b1' }, data: { status: 'CANCELLED' } },
    ]);
    await expect(service.cancelOwn('s2', 'b1')).rejects.toThrow(
      NotFoundException,
    );
    await expect(refusal(service.cancelOwn('s1', 'b2'))).resolves.toEqual({
      status: 400,
      message: 'This session is already cancelled.',
    });
    expect(queriesOf('booking.update')).toHaveLength(1);
  });
});
