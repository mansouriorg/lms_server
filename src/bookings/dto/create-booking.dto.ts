// src/bookings/dto/create-booking.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';

export class CreateBookingDto {
  @IsString()
  @IsNotEmpty({ message: 'L\'ID du stage est requis.' })
  stageId: string;
}