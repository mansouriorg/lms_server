import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStageDto } from './dto/create-stage.dto';
import { UpdateStageDto } from './dto/update-stage.dto';

@Injectable()
export class StagesService {
  constructor(private readonly prisma: PrismaService) {}

  // 1. Create a new Stage (Course)
  async create(dto: CreateStageDto) {
    const newStage = await this.prisma.stage.create({
      data: {
        title: dto.title,
        description: dto.description,
        price: dto.price,
        thumbnailUrl: dto.thumbnailUrl,
        category: dto.category,
        level: dto.level,
        instructorId: dto.instructorId,
        centerId: dto.centerId,
        // status is automatically set to 'DRAFT' by Prisma
      },
    });

    return {
      message: 'Cours créé avec succès.',
      stage: newStage,
    };
  }

  // 2. Fetch all Stages (useful for students browsing the public catalog)
  async findAll() {
    return this.prisma.stage.findMany({
      orderBy: { createdAt: 'desc' }, // Order by newest courses first
      include: {
        center: {
          select: { name: true } // Identify which academy created it
        },
        _count: {
          select: { modules: true, orderItems: true } // Easily show how many modules it has and how many students bought it!
        }
      }
    });
  }

  // 3. Fetch a single Stage by its ID (For the Course Player)
  async findOne(id: string) {
    const stage = await this.prisma.stage.findUnique({
      where: { id },
      include: { 
        center: true,
        modules: {
          include: {
            lessons: {
              orderBy: { order: 'asc' } // Ensure lessons are in the right order
            }
          },
          orderBy: { order: 'asc' } // Ensure modules are in the right order
        }
      }
    });

    if (!stage) {
      throw new NotFoundException('Cours introuvable.');
    }

    return stage;
  }

  // 4. Update an existing Stage
  async update(id: string, dto: UpdateStageDto) {
    const stage = await this.prisma.stage.findUnique({ where: { id } });
    if (!stage) {
      throw new NotFoundException('Cours introuvable.');
    }

    // We no longer need date conversions, so we just pass the DTO directly
    const updatedStage = await this.prisma.stage.update({
      where: { id },
      data: dto,
    });

    return {
      message: 'Cours mis à jour avec succès.',
      stage: updatedStage,
    };
  }

  // 5. Delete a Stage
  async remove(id: string) {
    const stage = await this.prisma.stage.findUnique({ where: { id } });
    if (!stage) {
      throw new NotFoundException('Cours introuvable.');
    }

    await this.prisma.stage.delete({
      where: { id },
    });

    return { message: 'Cours supprimé avec succès.' };
  }
}