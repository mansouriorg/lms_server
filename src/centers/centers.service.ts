// src/centers/centers.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCenterDto } from './dto/create-center.dto';
import { UpdateCenterDto } from './dto/update-center.dto';

@Injectable()
export class CentersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCenterDto) {
    const center = await this.prisma.center.create({
      data: dto,
    });
    return { message: 'Centre créé avec succès.', center };
  }

  async findAll() {
    return this.prisma.center.findMany({
      include: {
        _count: { select: { stages: true } } // Shows how many stages each center has
      }
    });
  }

  async findOne(id: string) {
    const center = await this.prisma.center.findUnique({
      where: { id },
      include: { stages: true } // Includes all stages hosted by this center
    });

    if (!center) throw new NotFoundException('Centre introuvable.');
    return center;
  }

  async update(id: string, dto: UpdateCenterDto) {
    const center = await this.prisma.center.findUnique({ where: { id } });
    if (!center) throw new NotFoundException('Centre introuvable.');

    const updatedCenter = await this.prisma.center.update({
      where: { id },
      data: dto,
    });

    return { message: 'Centre mis à jour avec succès.', center: updatedCenter };
  }

  async remove(id: string) {
    const center = await this.prisma.center.findUnique({ where: { id } });
    if (!center) throw new NotFoundException('Centre introuvable.');

    await this.prisma.center.delete({ where: { id } });
    return { message: 'Centre supprimé avec succès.' };
  }
}