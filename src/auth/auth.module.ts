// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PasswordResetController } from './password-reset.controller';
import { PasswordResetService } from './password-reset.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule, // Enables Passport authentication globally for this module
    // We use registerAsync so it waits for the ConfigModule to load the .env file
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { 
          expiresIn: '1d' // Token expires in 1 day for security
        },
      }),
    }),
  ],
  controllers: [AuthController, PasswordResetController],
  providers: [AuthService, PasswordResetService, JwtStrategy], // JwtStrategy must be listed here to work
})
export class AuthModule {}