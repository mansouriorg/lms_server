// src/centers/dto/add-academy-admin.dto.ts
import { IsEmail } from 'class-validator';
import { Transform } from 'class-transformer';
import { emailText } from '../../common/text';

// POST /centers/:id/admins: the email of the account that becomes an admin of
// the academy (trimmed and in lower case, like the emails of the accounts)
export class AddAcademyAdminDto {
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  @Transform(emailText)
  email: string;
}
