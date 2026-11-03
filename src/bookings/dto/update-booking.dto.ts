// src/bookings/dto/update-booking.dto.ts
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { BookingStatus } from 'src/generated/prisma/enums';
import { trimText } from '../../common/text';

// PATCH /bookings/:id/status: the host confirms a session (PAID, shown as
// "Confirmed" in the app) or cancels it, and can add the link to join it.
export class UpdateBookingStatusDto {
  @IsEnum(BookingStatus, {
    message: 'The status must be PENDING, PAID, CANCELLED or REFUNDED.',
  })
  status: BookingStatus;

  // A web address (http or https), like "https://meet.google.com/abc-defg-hij"
  // or "meet.google.com/abc-defg-hij". Spaces around it are removed.
  @IsOptional()
  @IsString()
  @Transform(trimText)
  @MaxLength(500, {
    message: 'The meeting link can have at most 500 characters.',
  })
  @IsUrl(
    { protocols: ['http', 'https'] },
    { message: 'The meeting link must be a valid web address.' },
  )
  meetingLink?: string;
}
