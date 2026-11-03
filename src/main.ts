// src/main.ts
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config'; // <-- Added ConfigService
import { AppModule } from './app.module';
import helmet from 'helmet';
import { join } from 'path';
import { apiDocsEnabled } from './config/api-docs';
import { applyCors } from './config/cors';
import { HttpExceptionFilter } from './common/filters/http-exception.filter'; 

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // Safely grab the ConfigService
  const configService = app.get(ConfigService);

  // 1. CORS: only the web app sites listed in FRONTEND_URLS may call the API
  // from a browser; a page from another site gets a 403 (src/config/cors.ts)
  applyCors(app, configService.get<string>('FRONTEND_URLS'));

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

  // 6. API documentation (Swagger, at /api): on in development and test, off
  // in production unless API_DOCS=on (src/config/api-docs.ts)
  const docs = apiDocsEnabled(
    configService.get<string>('NODE_ENV'),
    configService.get<string>('API_DOCS'),
  );
  if (docs) {
    const config = new DocumentBuilder()
      .setTitle('LMS Academy API')
      .setDescription('API documentation of the LMS Academy platform')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
  }

  // 7. Start the Server using ConfigService
  const port = configService.get<number>('PORT') || 3001;
  await app.listen(port);
  console.log(`🚀 Backend successfully running on: http://localhost:${port}`);
  if (docs) console.log(`📚 Swagger Docs available at: http://localhost:${port}/api`);
}
bootstrap();