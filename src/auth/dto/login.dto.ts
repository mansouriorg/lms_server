// src/auth/dto/login.dto.ts
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { emailText } from '../../common/text';

export class LoginDto {
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  @Transform(emailText)
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Please enter your password.' })
  password: string;
}