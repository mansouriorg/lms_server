// src/auth/password-reset.controller.ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from 'src/generated/prisma/enums';
import { PasswordResetService } from './password-reset.service';
import { ResetEmailDto, ResetPasswordDto } from './dto/password-reset.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { RATE_LIMITS } from '../config/rate-limits';

// Forgotten passwords: the two public routes (asking, then choosing the new
// password with the link) have the sign-in limit (10 per minute); the others
// are for platform admins only.
@Controller('auth')
export class PasswordResetController {
  constructor(private readonly passwordResetService: PasswordResetService) {}

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: RATE_LIMITS.auth })
  forgotPassword(@Body() dto: ResetEmailDto) {
    return this.passwordResetService.request(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: RATE_LIMITS.auth })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.passwordResetService.reset(dto.token, dto.password);
  }

  // The resets of the last 30 days
  @Get('password-resets')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  list() {
    return this.passwordResetService.list();
  }

  // A reset started by the platform admin, with its link
  @Post('password-resets')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  createForEmail(@Body() dto: ResetEmailDto) {
    return this.passwordResetService.createForEmail(dto.email);
  }

  // A new link for a reset a user asked for
  @Post('password-resets/:id/link')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  createLink(@Param('id') id: string) {
    return this.passwordResetService.createLink(id);
  }
}
