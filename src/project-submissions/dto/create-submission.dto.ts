import { IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { trimText } from '../../common/text';

// A full https:// address (GitHub, GitLab, a hosted site...)
const LINK = { protocols: ['https'], require_protocol: true };
export const LINK_MAX = 500;

// An empty text is the same as no link
const optionalLink = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : trimText({ value });

// POST /project-submissions: a student sends the project of a course they
// bought: the link to the code and, if any, to the running site.
export class CreateSubmissionDto {
  @IsString()
  @IsNotEmpty({ message: 'Choose the course of the project.' })
  stageId: string;

  @Transform(trimText)
  @IsUrl(LINK, {
    message: 'Enter the full link to your code, starting with https:// (for example https://github.com/you/project).',
  })
  @MaxLength(LINK_MAX, { message: `A link can have at most ${LINK_MAX} characters.` })
  repoUrl: string;

  @IsOptional()
  @Transform(optionalLink)
  @IsUrl(LINK, { message: 'Enter the full link to your site, starting with https://, or leave it empty.' })
  @MaxLength(LINK_MAX, { message: `A link can have at most ${LINK_MAX} characters.` })
  liveUrl?: string;
}
