// src/bookings/bookings.controller.ts
// Live sessions (mentoring calls and webinars). Every route needs a token.
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingStatusDto } from './dto/update-booking.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import type { Actor } from '../common/academy-scope';
import { Role } from 'src/generated/prisma/enums';

@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  // --- STUDENT ROUTES (the user of the token) ---

  // Who the student can book: the admins of the academies of their courses
  @Get('instructors')
  getBookableInstructors(@GetUser('id') userId: string) {
    return this.bookingsService.bookableInstructors(userId);
  }

  @Post()
  create(
    @GetUser('id') userId: string,
    @Body() createBookingDto: CreateBookingDto,
  ) {
    return this.bookingsService.create(userId, createBookingDto);
  }

  @Get('my-bookings')
  getUserBookings(@GetUser('id') userId: string) {
    return this.bookingsService.getUserBookings(userId);
  }

  @Patch(':id/cancel')
  cancelOwn(@GetUser('id') userId: string, @Param('id') bookingId: string) {
    return this.bookingsService.cancelOwn(userId, bookingId);
  }

  // --- INSTRUCTOR / ADMIN ROUTES ---

  // CENTER_ADMIN acts as the instructor role
  @Get('instructor/my-sessions')
  @UseGuards(RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  getInstructorBookings(@GetUser('id') instructorId: string) {
    return this.bookingsService.getInstructorBookings(instructorId);
  }

  @Get('admin/all')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  findAllForAdmin() {
    return this.bookingsService.findAllForAdmin();
  }

  // Confirm (PAID) or cancel a session, and add its meeting link: the host
  // only (or a super admin)
  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  updateStatus(
    @Param('id') bookingId: string,
    @Body() dto: UpdateBookingStatusDto,
    @GetUser() user: Actor,
  ) {
    return this.bookingsService.updateStatus(
      user,
      bookingId,
      dto.status,
      dto.meetingLink,
    );
  }
}
