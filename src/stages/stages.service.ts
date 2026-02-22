// src/stages/stages.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStageDto } from './dto/create-stage.dto';
import { UpdateStageDto } from './dto/update-stage.dto'; // <-- Added this import

@Injectable()
export class StagesService {
  constructor(private readonly prisma: PrismaService) {}

  // 1. Create a new Stage
  async create(dto: CreateStageDto) {
    const newStage = await this.prisma.stage.create({
      data: {
        title: dto.title,
        description: dto.description,
        dateStart: new Date(dto.dateStart),
        dateEnd: new Date(dto.dateEnd),
        location: dto.location,
        price: dto.price,
        capacity: dto.capacity,
        instructor: dto.instructor,
        centerId: dto.centerId,
        // status is automatically set to 'DRAFT' by Prisma as per your schema
      },
    });

    return {
      message: 'Stage créé avec succès.',
      stage: newStage,
    };
  }

  // 2. Fetch all Stages (useful for students browsing available courses)
  async findAll() {
    return this.prisma.stage.findMany({
      orderBy: { dateStart: 'asc' }, // Orders them by upcoming dates first
      include: {
        center: {
          select: { name: true, location: true } // Only include safe center info
        }
      }
    });
  }

  // 3. Fetch a single Stage by its ID
  async findOne(id: string) {
    const stage = await this.prisma.stage.findUnique({
      where: { id },
      include: { center: true }
    });

    if (!stage) {
      throw new NotFoundException('Stage introuvable.');
    }

    return stage;
  }

  // 4. Update an existing Stage
  async update(id: string, dto: UpdateStageDto) {
    // Check if it exists first
    const stage = await this.prisma.stage.findUnique({ where: { id } });
    if (!stage) {
      throw new NotFoundException('Stage introuvable.');
    }

    // Convert date strings to Date objects if they were provided in the update
    const dataToUpdate: any = { ...dto };
    if (dto.dateStart) dataToUpdate.dateStart = new Date(dto.dateStart);
    if (dto.dateEnd) dataToUpdate.dateEnd = new Date(dto.dateEnd);

    const updatedStage = await this.prisma.stage.update({
      where: { id },
      data: dataToUpdate,
    });

    return {
      message: 'Stage mis à jour avec succès.',
      stage: updatedStage,
    };
  }

  // 5. Delete a Stage
  async remove(id: string) {
    // Check if it exists first
    const stage = await this.prisma.stage.findUnique({ where: { id } });
    if (!stage) {
      throw new NotFoundException('Stage introuvable.');
    }

    await this.prisma.stage.delete({
      where: { id },
    });

    return { message: 'Stage supprimé avec succès.' };
  }
}