import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 1. Strict CORS: Only allow your specific Next.js frontend
  const allowedOrigins = process.env.FRONTEND_URLS?.split(',') || ['http://localhost:3000'];
  app.enableCors({
    origin: (origin, callback) => {
      // Allow if no origin (like a mobile app) or if in the allowed list
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Blocked by CORS policy'));
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true, // Required for secure JWT cookies later
  });

  // 2. Helmet: Set 12+ security headers to prevent XSS and clickjacking
  app.use(helmet());

  // 3. Global Validation & Sanitization
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strips any fields not defined in the DTO
      forbidNonWhitelisted: true, // Rejects the request if extra fields exist
      transform: true, // Automatically converts data to the right types
    }),
  );

  await app.listen(process.env.PORT || 3001);
}
bootstrap();