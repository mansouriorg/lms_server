// src/lessons/dto/create-lesson.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsInt, Min, IsUrl } from 'class-validator';

export class CreateLessonDto {
  @IsString()
  @IsNotEmpty({ message: 'Le titre de la leçon est requis.' })
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Veuillez fournir une URL de vidéo valide.' })
  videoUrl?: string;

  @IsInt()
  @Min(1)
  order: number; // For example: Lesson 1, Lesson 2

  @IsString()
  @IsNotEmpty()
  stageId: string; // The ID of the Bootcamp this lesson belongs to
}