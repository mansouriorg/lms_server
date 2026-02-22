import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import * as Joi from 'joi';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { StagesModule } from './stages/stages.module';
import { BookingsModule } from './bookings/bookings.module';
import { CentersModule } from './centers/centers.module';
import { LessonsModule } from './lessons/lessons.module';
import { ProjectSubmissionsModule } from './project-submissions/project-submissions.module';
import { QuestionsModule } from './questions/questions.module';
import { OrdersModule } from './orders/orders.module';
import { CouponsModule } from './coupons/coupons.module';

@Module({
  imports: [
    // 1. Environment Variable Validation
    ConfigModule.forRoot({
      isGlobal: true, 
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number().default(3001),
        DATABASE_URL: Joi.string().required(),
        FRONTEND_URLS: Joi.string().required(),
        // JWT_SECRET: Joi.string().min(32).required(), // We will uncomment this when we build the JWT Auth
      }),
      // FIXED: Joi-specific settings must go inside validationOptions
      validationOptions: {
        abortEarly: true, // Fails startup immediately on the first missing variable
      },
    }),

    // 2. Rate Limiting (Brute Force & DDoS Protection)
    ThrottlerModule.forRoot([{
      ttl: 60000, // Time-to-live: 60 seconds
      limit: 10,  // Maximum of 10 requests per IP within the 60-second window
    }]),

    // 3. Your Domain Modules
    PrismaModule,
    UsersModule,
    AuthModule,
    StagesModule,
    BookingsModule,
    CentersModule,
    LessonsModule,
    ProjectSubmissionsModule,
    QuestionsModule,
    OrdersModule,
    CouponsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // 4. Apply the Rate Limiter globally to intercept all incoming requests
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}