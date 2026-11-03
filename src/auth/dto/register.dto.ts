// src/auth/dto/register.dto.ts
import { Equals, IsEmail, IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { emailText, withoutHtml } from '../../common/text';
import {
  TERMS_REQUIRED,
  TERMS_VERSION_FORMAT,
  TERMS_VERSION_MISSING,
} from '../../config/legal';

export class RegisterDto {
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  @Transform(emailText)
  email: string;

  // Names: no HTML, "&" kept (see common/text.ts)
  @IsString()
  @IsNotEmpty()
  @Transform(withoutHtml)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @Transform(withoutHtml)
  lastName: string;

  @IsString()
  @MinLength(8, { message: 'The password must be at least 8 characters long.' })
  password: string;

  // The sign-up checkbox ("I am 18 or older and I agree to the Terms of
  // Service and Privacy Policy"), and the version of the texts it showed
  @Equals(true, { message: TERMS_REQUIRED })
  acceptTerms: boolean;

  @IsString({ message: TERMS_VERSION_MISSING })
  @Matches(TERMS_VERSION_FORMAT, { message: TERMS_VERSION_MISSING })
  termsVersion: string;
}
