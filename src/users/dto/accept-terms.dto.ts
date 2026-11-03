import { Equals, IsString, Matches } from 'class-validator';
import {
  TERMS_REQUIRED,
  TERMS_VERSION_FORMAT,
  TERMS_VERSION_MISSING,
} from '../../config/legal';

// POST /users/me/terms: the signed-in user accepts the Terms of Service and
// the Privacy Policy, in the version (date) the page showed
export class AcceptTermsDto {
  @Equals(true, { message: TERMS_REQUIRED })
  acceptTerms: boolean;

  @IsString({ message: TERMS_VERSION_MISSING })
  @Matches(TERMS_VERSION_FORMAT, { message: TERMS_VERSION_MISSING })
  termsVersion: string;
}
