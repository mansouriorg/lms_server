// src/stages/dto/create-stage.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsDateString, IsNumber, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import sanitizeHtml from 'sanitize-html';

export class CreateStageDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => sanitizeHtml(value?.trim()))
  title: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => sanitizeHtml(value?.trim()))
  description?: string;

  @IsDateString({}, { message: 'dateStart doit être une date ISO valide.' })
  dateStart: string;

  @IsDateString({}, { message: 'dateEnd doit être une date ISO valide.' })
  dateEnd: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => sanitizeHtml(value?.trim()))
  location: string;

  @IsNumber()
  @Min(0, { message: 'Le prix ne peut pas être négatif.' })
  price: number;

  @IsNumber()
  @Min(1, { message: 'La capacité doit être au moins de 1.' })
  capacity: number;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => sanitizeHtml(value?.trim()))
  instructor: string;

  @IsString()
  @IsNotEmpty()
  centerId: string; // The ID of the Center hosting this stage
}