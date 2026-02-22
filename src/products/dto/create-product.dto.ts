import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, IsUrl, IsBoolean } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty({ message: 'Le titre du produit est requis.' })
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0, { message: 'Le prix ne peut pas être négatif.' })
  price: number;

  @IsUrl({}, { message: 'Veuillez fournir un lien valide vers le fichier (AWS S3, Google Drive, etc.).' })
  @IsNotEmpty()
  fileUrl: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}