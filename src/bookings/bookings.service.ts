// src/bookings/bookings.service.ts
import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateBookingDto) {
    // 1. Find the stage and count how many bookings it already has
    const stage = await this.prisma.stage.findUnique({
      where: { id: dto.stageId },
      include: {
        _count: {
          select: { bookings: true }, // Prisma easily counts relations for us
        },
      },
    });

    if (!stage) {
      throw new NotFoundException('Stage introuvable.');
    }

    // 2. Check if capacity is reached
    if (stage._count.bookings >= stage.capacity) {
      throw new BadRequestException('Ce stage est complet.');
    }

    // 3. Check if the user already booked this stage
    // Your Prisma schema enforces this with @@unique([userId, stageId]), 
    // but catching it here gives the user a cleaner error message.
    const existingBooking = await this.prisma.booking.findFirst({
      where: {
        userId: userId,
        stageId: dto.stageId,
      },
    });

    if (existingBooking) {
      throw new ConflictException('Vous avez déjà réservé une place pour ce stage.');
    }

    // 4. Create the booking
    const newBooking = await this.prisma.booking.create({
      data: {
        userId: userId,
        stageId: dto.stageId,
      },
      include: {
        stage: {
          select: { title: true, dateStart: true, location: true },
        },
      },
    });

    return {
      message: 'Réservation effectuée avec succès.',
      booking: newBooking,
    };
  }

  // Allow a student to view their own booking history
  async getUserBookings(userId: string) {
    return this.prisma.booking.findMany({
      where: { userId: userId },
      include: {
        stage: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}