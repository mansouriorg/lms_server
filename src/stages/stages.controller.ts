// src/stages/stages.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { Role } from 'src/generated/prisma/enums';
import { StagesService } from './stages.service';
import { CreateStageDto } from './dto/create-stage.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import type { CourseViewer } from '../common/course-access';
import type { Actor } from '../common/academy-scope';

@Controller('stages')
export class StagesController {
  constructor(private readonly stagesService: StagesService) {}

  // --- ADMIN ONLY ROUTES: a valid token (JwtAuthGuard), then an admin role ---

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  create(@Body() createStageDto: CreateStageDto, @GetUser() user: Actor) {
    return this.stagesService.create(createStageDto, user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  update(
    @Param('id') id: string,
    @Body() updateStageDto: UpdateStageDto,
    @GetUser() user: Actor,
  ) {
    return this.stagesService.update(id, updateStageDto, user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  remove(@Param('id') id: string, @GetUser() user: Actor) {
    return this.stagesService.remove(id, user);
  }

  // The courses this admin manages (their academy; every course for a super
  // admin), whatever their status. Declared before GET :id, like "mine".
  @Get('manage')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  findManaged(@GetUser() user: Actor) {
    return this.stagesService.findManaged(user);
  }

  // The students of the academy (every academy for a super admin): who
  // bought which course, and their progress. Declared before GET :id.
  @Get('students')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  findStudents(@GetUser() user: Actor) {
    return this.stagesService.findStudents(user);
  }

  // One course for its editor, with every lesson and video link. Only for
  // admins of its academy (403 for the others).
  @Get(':id/manage')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  findOneManaged(@Param('id') id: string, @GetUser() user: Actor) {
    return this.stagesService.findOneManaged(id, user);
  }

  // How many of the students of a course completed each of its lessons. Only
  // for admins of its academy (403 for the others).
  @Get(':id/lesson-progress')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  lessonProgress(@Param('id') id: string, @GetUser() user: Actor) {
    return this.stagesService.lessonProgress(id, user);
  }

  // --- STUDENTS: "My courses" (a valid token) ---
  // Declared before GET :id, so that "mine" is not read as a course ID.

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  findMine(@GetUser('id') userId: string) {
    return this.stagesService.findMine(userId);
  }

  // --- PUBLIC CATALOG: anyone, signed in or not (OptionalJwtAuthGuard) ---
  // Visitors and students see the published courses and their outline;
  // admins also see drafts; video links only go to viewers who may open the
  // course (see common/course-access.ts).

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  findAll(@GetUser() user: CourseViewer | null) {
    return this.stagesService.findAll(user);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  findOne(@Param('id') id: string, @GetUser() user: CourseViewer | null) {
    return this.stagesService.findOneForViewer(id, user);
  }
}
