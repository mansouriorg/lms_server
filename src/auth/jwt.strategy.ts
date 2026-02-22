// src/auth/jwt.strategy.ts
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      // Automatically extracts the token from the "Authorization: Bearer <token>" header
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false, // If the token is expired, instantly reject with 401 Unauthorized
      
      // FIXED: Added the '!' at the end to tell TypeScript this will NEVER be undefined
      secretOrKey: configService.get<string>('JWT_SECRET')!, 
    });
  }

  // If the signature is valid, this method is called automatically with the decoded payload.
  // Whatever we return here gets attached to the 'request.user' object for our controllers to use.
  async validate(payload: any) {
    return { 
      id: payload.sub, 
      email: payload.email, 
      role: payload.role 
    };
  }
}