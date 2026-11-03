// src/course-modules/course-modules.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Actor, assertManagesAcademy } from '../common/academy-scope';
import { Direction, moveInOrder } from '../common/reorder';
import { CreateCourseModuleDto } from './dto/create-course-module.dto';
import { UpdateCourseModuleDto } from './dto/update-course-module.dto';

// The modules of a course: the chapters that group its lessons. Admins may
// only change the modules of their own academy's courses (every academy for
// a super admin).
@Injectable()
export class CourseModulesService {
  constructor(private readonly prisma: PrismaService) {}

  // The module and its course, after checking the academy (404, then 403).
  private async managedModule(id: string, actor: Actor) {
    const courseModule = await this.prisma.module.findUnique({
      where: { id },
      select: {
        id: true,
        stageId: true,
        stage: { select: { centerId: true } },
      },
    });
    if (courseModule === null) {
      throw new NotFoundException('Module not found.');
    }
    await assertManagesAcademy(this.prisma, actor, courseModule.stage.centerId);
    return courseModule;
  }

  // POST /modules: at the end of the course.
  async create(dto: CreateCourseModuleDto, actor: Actor) {
    const stage = await this.prisma.stage.findUnique({
      where: { id: dto.stageId },
      select: { centerId: true },
    });
    if (stage === null) {
      throw new NotFoundException('Course not found.');
    }
    await assertManagesAcademy(this.prisma, actor, stage.centerId);

    const last = await this.prisma.module.aggregate({
      where: { stageId: dto.stageId },
      _max: { order: true },
    });
    const courseModule = await this.prisma.module.create({
      data: {
        stageId: dto.stageId,
        title: dto.title,
        order: (last._max.order ?? 0) + 1,
      },
    });
    return { message: 'Module added.', module: courseModule };
  }

  // PATCH /modules/:id: a new title.
  async update(id: string, dto: UpdateCourseModuleDto, actor: Actor) {
    await this.managedModule(id, actor);
    const courseModule = await this.prisma.module.update({
      where: { id },
      data: { title: dto.title },
    });
    return { message: 'Module renamed.', module: courseModule };
  }

  // DELETE /modules/:id: the database also deletes its lessons, with the
  // students' progress and questions on them (onDelete: Cascade).
  async remove(id: string, actor: Actor) {
    await this.managedModule(id, actor);
    await this.prisma.module.delete({ where: { id } });
    return { message: 'Module deleted.' };
  }

  // POST /modules/:id/move: one place up or down. The modules of the course
  // are then numbered 1, 2, 3... in one transaction (this also repairs equal
  // or missing numbers).
  async move(id: string, direction: Direction, actor: Actor) {
    const courseModule = await this.managedModule(id, actor);
    const siblings = await this.prisma.module.findMany({
      where: { stageId: courseModule.stageId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    const current = siblings.map((sibling) => sibling.id);
    const ids = moveInOrder(current, id, direction);
    if (ids === null) {
      return { message: 'The module is already there.', order: current };
    }
    await this.prisma.$transaction(
      ids.map((moduleId, index) =>
        this.prisma.module.update({
          where: { id: moduleId },
          data: { order: index + 1 },
        }),
      ),
    );
    return { message: 'Module moved.', order: ids };
  }
}
