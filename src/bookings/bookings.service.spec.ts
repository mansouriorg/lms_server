import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BookingsService } from './bookings.service';
import { PrismaService } from '../prisma/prisma.service';

const superAdmin = { id: 's1', role: 'SUPER_ADMIN' };
const host = { id: 'a1', role: 'CENTER_ADMIN' }; // hosts booking b1
const otherAdmin = { id: 'a2', role: 'CENTER_ADMIN' };

// A fake Prisma with one live session (b1) hosted by a1. `exists` false makes
// the lookup find nothing. Every database call is recorded by name.
async function setup(exists = true) {
  const calls: string[] = [];
  const booking = { id: 'b1', instructorId: 'a1', status: 'PENDING' };
  const answer = (name: string, result: unknown) => () => {
    calls.push(name);
    return Promise.resolve(result);
  };
  const prisma = {
    booking: {
      findUnique: answer('booking.findUnique', exists ? booking : null),
      update: answer('booking.update', booking),
    },
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [BookingsService, { provide: PrismaService, useValue: prisma }],
  }).compile();

  return { service: module.get<BookingsService>(BookingsService), calls };
}

describe('BookingsService', () => {
  it('should be defined', async () => {
    const { service } = await setup();
    expect(service).toBeDefined();
  });

  describe('update a live session (PATCH /bookings/:id/status)', () => {
    it('the hosting instructor can update it', async () => {
      const { service, calls } = await setup();
      await service.updateStatus(host, 'b1', 'PAID');
      expect(calls).toContain('booking.update');
    });

    it('another center admin cannot (403)', async () => {
      const { service, calls } = await setup();
      await expect(
        service.updateStatus(otherAdmin, 'b1', 'CANCELLED'),
      ).rejects.toThrow(ForbiddenException);
      expect(calls).not.toContain('booking.update');
    });

    it('a super admin can update every session', async () => {
      const { service, calls } = await setup();
      await service.updateStatus(superAdmin, 'b1', 'CANCELLED');
      expect(calls).toContain('booking.update');
    });

    it('unknown session: 404', async () => {
      const { service } = await setup(false);
      await expect(service.updateStatus(host, 'b1', 'PAID')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
