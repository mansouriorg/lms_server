// src/auth/dto/password-reset.dto.ts
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { emailText } from '../../common/text';

// POST /auth/forgot-password (anyone) and POST /auth/password-resets (a
// platform admin): the email of the account, cleaned like at sign in
export class ResetEmailDto {
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  @Transform(emailText)
  email: string;
}

// POST /auth/reset-password: the secret of the link, and the new password
// (not trimmed: a space can be part of a password)
export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'This link is not complete: open it again.' })
  @MaxLength(100, { message: 'This link is not complete: open it again.' })
  token: string;

  @IsString()
  @MinLength(8, {
    message: 'The new password must be at least 8 characters long.',
  })
  @MaxLength(128, {
    message: 'The new password can have at most 128 characters.',
  })
  password: string;
}
