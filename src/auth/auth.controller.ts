// src/auth/auth.controller.ts
import { Controller, Post, Body, HttpCode, HttpStatus, Get, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GetUser } from './decorators/get-user.decorator';
import { Throttle } from '@nestjs/throttler';
import { RATE_LIMITS } from '../config/rate-limits';
import { ChangePasswordDto } from './dto/change-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: RATE_LIMITS.auth }) // Stricter limit: 10 per minute
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: RATE_LIMITS.auth }) // Stricter limit: 10 per minute
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // The signed-in user changes their password; the current one is checked
  // first. Same limit as sign-in (10 per minute), against password guessing.
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: RATE_LIMITS.auth })
  changePassword(
    @GetUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(userId, dto);
  }

  // Signs out every other browser and device of the signed-in user (Settings);
  // the answer holds a new token for this one
  @Post('sign-out-others')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: RATE_LIMITS.auth })
  signOutOthers(@GetUser('id') userId: string) {
    return this.authService.signOutOthers(userId);
  }

  // --- NEW PROTECTED ROUTE ---
  @Get('me')
  @UseGuards(JwtAuthGuard) // 1. The Guard intercepts the request and verifies the JWT
  getProfile(@GetUser() user: any) { // 2. The Decorator cleanly extracts the user payload
    // If the token is invalid or missing, NestJS throws a 401 Unauthorized before this code even runs.
    // If we make it here, the user is 100% authenticated.
    return {
      message: 'Here is your session information.',
      user: user,
    };
  }
}