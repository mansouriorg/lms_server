// src/bookings/dto/create-booking.dto.ts
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { BookingType } from 'src/generated/prisma/enums';
import { trimText } from '../../common/text';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// POST /bookings: a student asks an academy admin for a live session (a
// mentoring call or a webinar). The service also checks that the day exists
// and is not past, that the end is after the start, and who may be booked.
export class CreateBookingDto {
  @IsString()
  @Transform(trimText)
  @IsNotEmpty({ message: 'Please give the session a title.' })
  @MaxLength(120, { message: 'The title can have at most 120 characters.' })
  title: string;

  @IsEnum(BookingType, {
    message: 'The session type must be MENTORSHIP or WEBINAR.',
  })
  type: BookingType;

  // A calendar day
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'The date must look like 2026-11-05.',
  })
  date: string;

  @IsString()
  @Matches(TIME, { message: 'The start time must look like 14:00.' })
  startTime: string;

  @IsString()
  @Matches(TIME, { message: 'The end time must look like 15:00.' })
  endTime: string;

  @IsString()
  @IsNotEmpty({ message: 'Please choose who you want to meet.' })
  instructorId: string;
}
