import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service'; // Removed .js and fixed relative path
import { UpdateUserDto } from './dto/update-user.dto'; // Removed .js
import { AcceptTermsDto } from './dto/accept-terms.dto';
import { TERMS_CHANGED, TERMS_VERSION } from '../config/legal';

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
        role: true,
        createdAt: true,
        // The version of the terms accepted, and when (null: not yet)
        termsVersion: true,
        termsAcceptedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return user;
  }

  // Update a user's profile
  async updateProfile(userId: string, dto: UpdateUserDto) {
    // Prisma's 'update' method will only modify the fields that are actually provided in the DTO
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      // An empty phone number removes it
      data: { ...dto, ...(dto.phone === '' ? { phone: null } : {}) },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
      },
    });

    return {
      message: 'Profile updated.',
      user: updatedUser,
    };
  }

  // POST /users/me/terms: the user accepts the current version of the Terms
  // of Service and the Privacy Policy. Recorded once per version.
  async acceptTerms(userId: string, dto: AcceptTermsDto) {
    if (dto.termsVersion !== TERMS_VERSION) {
      throw new BadRequestException(TERMS_CHANGED);
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { termsVersion: true, termsAcceptedAt: true },
    });
    if (user === null) {
      throw new NotFoundException('User not found.');
    }
    const accepted =
      user.termsVersion === TERMS_VERSION
        ? user
        : await this.prisma.user.update({
            where: { id: userId },
            data: { termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION },
            select: { termsVersion: true, termsAcceptedAt: true },
          });
    return {
      message: 'Thank you: your acceptance is recorded.',
      termsVersion: accepted.termsVersion,
      termsAcceptedAt: accepted.termsAcceptedAt,
    };
  }
}