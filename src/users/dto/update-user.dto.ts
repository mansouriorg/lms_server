// src/users/dto/update-user.dto.ts
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { withoutHtml } from '../../common/text';

// Fields a user may change on their own profile (PATCH /users/me). Any other
// field (email, role, centerId...) is refused with a 400 by the
// ValidationPipe (forbidNonWhitelisted).
// Names and phone: no HTML, "&" kept (see common/text.ts). A name that is
// sent cannot be empty; an empty phone removes it.
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Transform(withoutHtml)
  @IsNotEmpty({ message: 'Please enter your first name.' })
  @MaxLength(50, { message: 'The first name can have at most 50 characters.' })
  firstName?: string;

  @IsOptional()
  @IsString()
  @Transform(withoutHtml)
  @IsNotEmpty({ message: 'Please enter your last name.' })
  @MaxLength(50, { message: 'The last name can have at most 50 characters.' })
  lastName?: string;

  @IsOptional()
  @IsString()
  @Transform(withoutHtml)
  @Matches(/^$|^\+?[0-9 ().-]{6,25}$/, {
    message: 'Please enter a valid phone number, like +216 20 000 000.',
  })
  phone?: string;
}
