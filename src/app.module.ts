import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { envSchema } from './config/env.schema';
import { RATE_LIMITS } from './config/rate-limits';

// FIXED: Removed all .js extensions for standard NestJS compilation!
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
import { ProductsModule } from './products/products.module';
import { CourseModulesModule } from './course-modules/course-modules.module';
import { QuizzesModule } from './quizzes/quizzes.module';

@Module({
  imports: [
    // 1. Environment Variable Validation
    ConfigModule.forRoot({
      isGlobal: true, 
      // The rules live in src/config/env.schema.ts (with unit tests).
      // JWT_SECRET is now required: at least 32 characters.
      validationSchema: envSchema,
      validationOptions: {
        abortEarly: true, // Fails startup immediately on the first missing variable
      },
    }),

    // 2. Rate Limiting (Brute Force & DDoS Protection)
    // Requests per IP address per minute: see src/config/rate-limits.ts
    ThrottlerModule.forRoot([RATE_LIMITS.default]),

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
    ProductsModule,
    CourseModulesModule,
    QuizzesModule,
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