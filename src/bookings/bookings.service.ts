// src/bookings/bookings.service.ts
import { 
  Injectable, 
  NotFoundException, 
  BadRequestException, 
  ConflictException,
  ForbiddenException
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingStatus } from 'generated/prisma/enums';

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

  // Handle document uploads
  async uploadDocuments(
    userId: string, 
    bookingId: string, 
    files: { front?: Express.Multer.File[], back?: Express.Multer.File[] }
  ) {
    // 1. Find the booking
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException('Réservation introuvable.');
    }

    // 2. Security Check: Ensure the user actually owns this booking
    if (booking.userId !== userId) {
      throw new ForbiddenException('Vous ne pouvez pas modifier cette réservation.');
    }

    // 3. Extract the file paths if they were uploaded
    const frontUrl = files.front ? `/uploads/${files.front[0].filename}` : undefined;
    const backUrl = files.back ? `/uploads/${files.back[0].filename}` : undefined;

    // 4. Update the database
    const updatedBooking = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        ...(frontUrl && { licenseFrontUrl: frontUrl }),
        ...(backUrl && { licenseBackUrl: backUrl }),
      },
    });

    return {
      message: 'Documents téléchargés avec succès.',
      booking: updatedBooking,
    };
  }

  // --- NEW: Admin Methods ---

  // 1. Fetch all bookings for admins to review
  async findAllForAdmin() {
    return this.prisma.booking.findMany({
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true, phone: true } // Safe user details
        },
        stage: {
          select: { title: true, dateStart: true, center: true }
        }
      },
      orderBy: { createdAt: 'desc' }, // Newest bookings first
    });
  }

  // 2. Approve or Reject a booking
  async updateStatus(bookingId: string, status: BookingStatus) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException('Réservation introuvable.');
    }

    const updatedBooking = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status },
    });

    return {
      message: 'Le statut de la réservation a été mis à jour avec succès.',
      booking: updatedBooking,
    };
  }
}