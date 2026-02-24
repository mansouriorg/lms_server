import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service'; // Removed .js and fixed relative path
import { UpdateUserDto } from './dto/update-user.dto'; // Removed .js

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // Fetch a user's profile securely
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        // licenseNumber has been completely removed!
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable.');
    }

    return user;
  }

  // Update a user's profile
  async updateProfile(userId: string, dto: UpdateUserDto) {
    // Prisma's 'update' method will only modify the fields that are actually provided in the DTO
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        // licenseNumber has been completely removed!
      },
    });

    return {
      message: 'Profil mis à jour avec succès.',
      user: updatedUser,
    };
  }
}