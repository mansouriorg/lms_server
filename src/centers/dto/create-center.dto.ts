import { IsString, IsEmail, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import sanitizeHtml from 'sanitize-html';

export class CreateCenterDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => sanitizeHtml(value?.trim()))
  name: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => sanitizeHtml(value?.trim()))
  location: string;

  @IsEmail({}, { message: 'Veuillez fournir un email valide.' })
  @Transform(({ value }) => value?.trim().toLowerCase())
  contactEmail: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => sanitizeHtml(value?.trim()))
  contactPhone: string;
}