// src/auth/auth.controller.ts
import { Controller, Post, Body, HttpCode, HttpStatus, Get, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GetUser } from './decorators/get-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // --- NEW PROTECTED ROUTE ---
  @Get('me')
  @UseGuards(JwtAuthGuard) // 1. The Guard intercepts the request and verifies the JWT
  getProfile(@GetUser() user: any) { // 2. The Decorator cleanly extracts the user payload
    // If the token is invalid or missing, NestJS throws a 401 Unauthorized before this code even runs.
    // If we make it here, the user is 100% authenticated.
    return {
      message: 'Voici vos informations de session sécurisées.',
      user: user,
    };
  }
}