import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { trimText } from '../../common/text';

export class CreateLessonDto {
  @Transform(trimText)
  @IsString()
  @IsNotEmpty({ message: 'Give the lesson a title.' })
  @MaxLength(200, {
    message: 'The lesson title can have at most 200 characters.',
  })
  title: string;

  @Transform(trimText)
  @IsString()
  @IsOptional()
  description?: string;

  // A full web address (YouTube, Vimeo or a video file), http or https only.
  // require_tld: false also accepts a server without a domain name, such as
  // http://localhost:3001/uploads/intro.mp4 during development.
  @IsOptional()
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true, require_tld: false },
    {
      message:
        'The video link must be a full web address starting with https:// (or http://).',
    },
  )
  videoUrl?: string;

  @IsOptional()
  @IsInt({ message: 'The duration is a whole number of minutes.' })
  @Min(1, { message: 'The duration is at least 1 minute.' })
  @Max(1440, { message: 'The duration is at most 1440 minutes (24 hours).' })
  duration?: number; // Duration in minutes

  // Optional: without it, the lesson goes after the last one of its module
  @IsOptional()
  @IsInt({ message: 'The lesson number must be a whole number.' })
  order?: number;

  @IsString()
  @IsNotEmpty({ message: 'The module ID is required.' })
  moduleId: string; // Changed from stageId to moduleId
}