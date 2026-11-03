// src/course-modules/course-modules.module.ts
import { Module } from '@nestjs/common';
import { CourseModulesController } from './course-modules.controller';
import { CourseModulesService } from './course-modules.service';

// POST, PATCH, DELETE /modules and POST /modules/:id/move
@Module({
  controllers: [CourseModulesController],
  providers: [CourseModulesService],
})
export class CourseModulesModule {}
