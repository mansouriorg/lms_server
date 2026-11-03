// src/course-modules/dto/create-course-module.dto.ts
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { trimText } from '../../common/text';

// POST /modules: a new module goes at the end of the course.
export class CreateCourseModuleDto {
  @IsString()
  @IsNotEmpty({ message: 'The course ID is required.' })
  stageId: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty({ message: 'Give the module a title.' })
  @MaxLength(200, {
    message: 'The module title can have at most 200 characters.',
  })
  title: string;
}
