// src/stages/dto/create-stage.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, IsUrl, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { trimText } from '../../common/text';

export const PROJECT_BRIEF_MAX = 4000;

// The project brief: kept as typed (spaces around removed); an empty text
// becomes null, which removes the project of the course
const briefText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value;

// The course form. Title, description, category and level are kept as typed
// (only the spaces around are removed), like module and lesson titles: they
// can contain code such as `List<T>`, and the client shows them as text.
export class CreateStageDto {
  @IsString()
  @IsNotEmpty({ message: 'The title is required.' })
  @Transform(trimText)
  title: string;

  @IsOptional()
  @IsString()
  @Transform(trimText)
  description?: string;

  // In dinars, at most 3 decimals (the millimes), like digital products
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'The price must be a number, like 120 or 99.500.' },
  )
  @Min(0, { message: 'The price cannot be negative.' })
  price: number;

  @IsOptional()
  @IsString()
  @IsUrl({}, { message: 'The thumbnail URL must be valid.' })
  thumbnailUrl?: string;

  @IsOptional()
  @IsString()
  @Transform(trimText)
  category?: string;

  @IsOptional()
  @IsString()
  @Transform(trimText)
  level?: string;

  // The final project: what the students build and send. Empty: no project.
  @IsOptional()
  @Transform(briefText)
  @IsString({ message: 'The project brief must be text.' })
  @MaxLength(PROJECT_BRIEF_MAX, {
    message: `The project brief can have at most ${PROJECT_BRIEF_MAX} characters.`,
  })
  projectBrief?: string | null;

  // Optional: by default the admin who creates the course is its instructor
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: "The instructor ID cannot be empty." })
  instructorId?: string;

  // Optional for academy admins (their academy is used); super admins must
  // choose the academy (see StagesService.create)
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: "The academy (center) ID cannot be empty." })
  centerId?: string;
}
