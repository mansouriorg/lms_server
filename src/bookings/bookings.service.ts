import { 
  Injectable, 
  NotFoundException, 
  BadRequestException, 
  ForbiddenException
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
// Assuming your DTO has been updated to match the new schema fields:
// title, type, date, startTime, endTime, instructorId
import { CreateBookingDto } from './dto/create-booking.dto'; 
import { BookingStatus } from 'src/generated/prisma/enums';// Import from generated Prisma client

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateBookingDto) {
    // 1. Verify that the requested instructor actually exists
    const instructor = await this.prisma.user.findUnique({
      where: { id: dto.instructorId },
    });

    if (!instructor) {
      throw new NotFoundException('Instructeur introuvable.');
    }

    // 2. Prevent the user from booking a session with themselves
    if (userId === dto.instructorId) {
      throw new BadRequestException('Vous ne pouvez pas réserver une session avec vous-même.');
    }

    // 3. Create the mentoring/webinar booking
    const newBooking = await this.prisma.booking.create({
      data: {
        title: dto.title,
        type: dto.type, // e.g., MENTORSHIP or WEBINAR
        date: new Date(dto.date),
        startTime: dto.startTime,
        endTime: dto.endTime,
        userId: userId,
        instructorId: dto.instructorId,
        // status defaults to PENDING based on the Prisma schema
      },
    });

    return {
      message: 'Réservation effectuée avec succès.',
      booking: newBooking,
    };
  }

  // Allow a student to view their own booking history (Upcoming and Past)
  async getUserBookings(userId: string) {
    return this.prisma.booking.findMany({
      where: { userId: userId },
      orderBy: [
        { date: 'asc' }, // Show upcoming sessions first
        { startTime: 'asc' }
      ],
    });
  }

  // Allow an instructor to view all the sessions students have booked with them
  async getInstructorBookings(instructorId: string) {
    return this.prisma.booking.findMany({
      where: { instructorId: instructorId },
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true, avatarUrl: true }
        }
      },
      orderBy: [
        { date: 'asc' },
        { startTime: 'asc' }
      ],
    });
  }

  // --- Admin / Instructor Methods ---

  // 1. Fetch all bookings for platform admins to review
  async findAllForAdmin() {
    return this.prisma.booking.findMany({
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true, phone: true } 
        }
      },
      orderBy: { createdAt: 'desc' }, // Newest booking requests first
    });
  }

  // 2. Approve, Reject, or Complete a booking (and optionally add a meeting link)
  async updateStatus(bookingId: string, status: BookingStatus, meetingLink?: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException('Réservation introuvable.');
    }

    const updatedBooking = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { 
        status,
        ...(meetingLink && { meetingLink }) // Only update the link if one was provided
      },
    });

    return {
      message: 'Le statut de la réservation a été mis à jour avec succès.',
      booking: updatedBooking,
    };
  }
}