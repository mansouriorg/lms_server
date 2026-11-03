// src/users/users.controller.ts
import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { AcceptTermsDto } from './dto/accept-terms.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard) // Locks down every route in this controller
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getProfile(@GetUser('id') userId: string) {
    // We strictly use the ID from the token, preventing any IDOR attack
    return this.usersService.getProfile(userId);
  }

  @Patch('me')
  updateProfile(
    @GetUser('id') userId: string, 
    @Body() dto: UpdateUserDto
  ) {
    return this.usersService.updateProfile(userId, dto);
  }

  // The user accepts the current Terms of Service and Privacy Policy
  @Post('me/terms')
  @HttpCode(200)
  acceptTerms(@GetUser('id') userId: string, @Body() dto: AcceptTermsDto) {
    return this.usersService.acceptTerms(userId, dto);
  }
}