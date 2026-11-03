// src/course-modules/dto/update-course-module.dto.ts
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { trimText } from '../../common/text';

// PATCH /modules/:id renames a module. Its place changes with
// POST /modules/:id/move; it cannot move to another course.
export class UpdateCourseModuleDto {
  @Transform(trimText)
  @IsString()
  @IsNotEmpty({ message: 'Give the module a title.' })
  @MaxLength(200, {
    message: 'The module title can have at most 200 characters.',
  })
  title: string;
}
