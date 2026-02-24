import { IsString, IsNotEmpty, IsEnum, IsDateString } from 'class-validator';
import { BookingType } from 'src/generated/prisma/enums'; // Make sure this import path matches your Prisma setup

export class CreateBookingDto {
  @IsString()
  @IsNotEmpty({ message: 'Le titre de la session est requis.' })
  title: string;

  @IsEnum(BookingType, { message: 'Le type de réservation doit être MENTORSHIP ou WEBINAR.' })
  @IsNotEmpty({ message: 'Le type est requis.' })
  type: BookingType;

  @IsDateString({}, { message: 'La date doit être un format ISO valide (ex: 2026-10-24T00:00:00.000Z).' })
  @IsNotEmpty({ message: 'La date est requise.' })
  date: string;

  @IsString()
  @IsNotEmpty({ message: 'L\'heure de début est requise (ex: 14:00).' })
  startTime: string;

  @IsString()
  @IsNotEmpty({ message: 'L\'heure de fin est requise (ex: 15:00).' })
  endTime: string;

  @IsString()
  @IsNotEmpty({ message: 'L\'ID de l\'instructeur est requis.' })
  instructorId: string;
}