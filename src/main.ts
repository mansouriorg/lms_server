// src/main.ts
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express'; // <-- Added for static files
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { join } from 'path'; // <-- Added for resolving the uploads directory
import { HttpExceptionFilter } from './common/filters/http-exception.filter'; // <-- NEW IMPORT

async function bootstrap() {
  // 1. Tell NestJS we are specifically using Express underneath so we can serve static files
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 2. Strict CORS: Only allow your specific Next.js frontend
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

  // 3. Helmet: Set 12+ security headers to prevent XSS and clickjacking
  // Note: crossOriginResourcePolicy must be 'cross-origin' so your frontend can load the uploaded images
  app.use(helmet({ 
    crossOriginResourcePolicy: { policy: "cross-origin" } 
  }));

  // 4. Global Validation & Sanitization
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strips any fields not defined in the DTO
      forbidNonWhitelisted: true, // Rejects the request if extra fields exist
      transform: true, // Automatically converts data to the right types
    }),
  );

  // --- NEW: Global Exception Filter ---
  app.useGlobalFilters(new HttpExceptionFilter());

  // 5. Serve the 'uploads' folder publicly at the '/uploads' URL
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });

  await app.listen(process.env.PORT || 3001);
}
bootstrap();