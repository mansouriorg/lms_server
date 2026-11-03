// src/auth/dto/change-password.dto.ts
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

// POST /auth/change-password. Passwords are not trimmed: a space can be part
// of a password.
export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Please enter your current password.' })
  currentPassword: string;

  @IsString()
  @MinLength(8, {
    message: 'The new password must be at least 8 characters long.',
  })
  @MaxLength(128, {
    message: 'The new password can have at most 128 characters.',
  })
  newPassword: string;
}
