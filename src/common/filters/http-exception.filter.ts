// src/common/filters/http-exception.filter.ts
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch() // Catching everything (no specific exception type passed)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Determine the status code
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Determine the error message
    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Une erreur interne du serveur est survenue.';

    // Log the exact error for your backend terminal so you can debug it
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${request.method}] ${request.url} - Erreur critique: ${exception instanceof Error ? exception.message : 'Inconnue'}`,
        exception instanceof Error ? exception.stack : '',
      );
    }

    // Force a clean JSON response for the frontend
    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      error: typeof message === 'string' ? message : (message as any).message || message,
    });
  }
}