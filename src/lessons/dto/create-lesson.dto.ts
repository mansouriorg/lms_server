import { IsString, IsNotEmpty, IsOptional, IsInt, IsUrl } from 'class-validator';

export class CreateLessonDto {
  @IsString()
  @IsNotEmpty({ message: 'Le titre de la leçon est requis.' })
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUrl({}, { message: 'L\'URL de la vidéo doit être valide.' })
  @IsOptional()
  videoUrl?: string;

  @IsInt()
  @IsOptional()
  duration?: number; // Duration in minutes

  @IsInt({ message: 'L\'ordre de la leçon est requis.' })
  @IsNotEmpty()
  order: number;

  @IsString()
  @IsNotEmpty({ message: 'L\'ID du module est requis.' })
  moduleId: string; // Changed from stageId to moduleId
}