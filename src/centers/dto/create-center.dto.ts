// src/centers/dto/create-center.dto.ts
import { IsString, IsEmail, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { emailText, withoutHtml } from '../../common/text';

// The academy form. Name, city and phone: no HTML, "&" kept, so "R&D
// Academy" is stored and shown as typed (see common/text.ts).
export class CreateCenterDto {
  @IsString()
  @IsNotEmpty()
  @Transform(withoutHtml)
  name: string;

  @IsString()
  @IsNotEmpty()
  @Transform(withoutHtml)
  location: string;

  @IsEmail({}, { message: 'Please enter a valid email address.' })
  @Transform(emailText)
  contactEmail: string;

  @IsString()
  @IsNotEmpty()
  @Transform(withoutHtml)
  contactPhone: string;
}
