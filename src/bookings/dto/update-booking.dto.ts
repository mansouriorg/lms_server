// src/bookings/dto/update-booking-status.dto.ts
import { IsEnum } from 'class-validator';
import { BookingStatus } from 'generated/prisma/enums'; // Using the exact import path from your schema setup

export class UpdateBookingStatusDto {
  @IsEnum(BookingStatus, { message: 'Statut de réservation invalide.' })
  status: BookingStatus;
}