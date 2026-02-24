import { IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';
import { BookingStatus } from 'src/generated/prisma/enums'; // Adjust this import if your Prisma enums are located elsewhere

export class UpdateBookingStatusDto {
  @IsEnum(BookingStatus)
  status: BookingStatus;

  // Added the meetingLink property as an optional string
  @IsOptional()
  @IsString()
  @IsUrl({}, { message: 'Le lien de la réunion doit être une URL valide.' })
  meetingLink?: string;
}