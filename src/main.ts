// src/main.ts
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config'; // <-- Added ConfigService
import { AppModule } from './app.module';
import helmet from 'helmet';
import { join } from 'path';
import { HttpExceptionFilter } from './common/filters/http-exception.filter'; 

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // Safely grab the ConfigService
  const configService = app.get(ConfigService);

  // 1. Strict CORS using ConfigService
  const frontendUrls = configService.get<string>('FRONTEND_URLS');
  const allowedOrigins = frontendUrls ? frontendUrls.split(',') : ['http://localhost:3000'];
  
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Blocked by CORS policy'));
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // 2. Helmet Security
  app.use(helmet({ 
    crossOriginResourcePolicy: { policy: "cross-origin" } 
  }));

  // 3. Global Validation & Sanitization
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true, 
      transform: true,
    }),
  );

  // 4. Global Exception Filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // 5. Serve the 'uploads' folder publicly
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });

  // 6. Swagger Configuration (UPDATED TITLE)
  const config = new DocumentBuilder()
    .setTitle('E-Learning Academy API') // <-- Updated!
    .setDescription('Official API documentation for the E-Learning platform') // <-- Updated!
    .setVersion('1.0')
    .addBearerAuth()
    .build();
    
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document); 

  // 7. Start the Server using ConfigService
  const port = configService.get<number>('PORT') || 3001;
  await app.listen(port);
  console.log(`🚀 Backend successfully running on: http://localhost:${port}`);
  console.log(`📚 Swagger Docs available at: http://localhost:${port}/api`);
}
bootstrap();