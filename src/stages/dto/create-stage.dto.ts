import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, IsUrl } from 'class-validator';
import { Transform } from 'class-transformer';
import sanitizeHtml from 'sanitize-html';

export class CreateStageDto {
  @IsString()
  @IsNotEmpty({ message: 'Le titre est requis.' })
  @Transform(({ value }) => (value ? sanitizeHtml(value.trim()) : value))
  title: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value ? sanitizeHtml(value.trim()) : value))
  description?: string;

  @IsNumber({}, { message: 'Le prix doit être un nombre.' })
  @Min(0, { message: 'Le prix ne peut pas être négatif.' })
  price: number;

  @IsOptional()
  @IsString()
  @IsUrl({}, { message: 'L\'URL de la miniature doit être valide.' })
  thumbnailUrl?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value ? sanitizeHtml(value.trim()) : value))
  category?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value ? sanitizeHtml(value.trim()) : value))
  level?: string;

  @IsString()
  @IsNotEmpty({ message: "L'ID de l'instructeur est requis." })
  instructorId: string; // <-- Fixed: Was 'instructor'

  @IsString()
  @IsNotEmpty({ message: "L'ID du centre (Académie) est requis." })
  centerId: string;
}