// src/users/dto/update-user.dto.ts
import { IsString, IsOptional, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import sanitizeHtml from 'sanitize-html';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => sanitizeHtml(value?.trim()))
  firstName?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => sanitizeHtml(value?.trim()))
  lastName?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => sanitizeHtml(value?.trim()))
  phone?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => sanitizeHtml(value?.trim()))
  licenseNumber?: string;
}