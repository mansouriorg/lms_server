// src/bookings/bookings.controller.ts
import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@Controller('bookings')
@UseGuards(JwtAuthGuard) // Requires a valid JWT token for all routes
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  create(
    @GetUser('id') userId: string, // Extracted directly from the token!
    @Body() createBookingDto: CreateBookingDto
  ) {
    return this.bookingsService.create(userId, createBookingDto);
  }

  @Get('my-bookings')
  getUserBookings(@GetUser('id') userId: string) {
    return this.bookingsService.getUserBookings(userId);
  }
}