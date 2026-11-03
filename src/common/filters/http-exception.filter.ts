// src/common/filters/http-exception.filter.ts
// Every error response has the same shape, and `message` is always one
// readable sentence the web app can show as it is:
//   { statusCode, message, errors?, path, timestamp }
// `errors` lists each message when there are several (validation errors).
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

// Shown for unexpected errors; the details only go to the server log.
export const INTERNAL_ERROR_MESSAGE =
  'Something went wrong on our side. Please try again.';

// An HttpException body is a string, or an object whose `message` is a
// string or (for validation errors) a list of strings.
export function readMessages(body: unknown): string[] {
  if (typeof body === 'string') {
    return [body];
  }
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const { message } = body as { message: unknown };
    if (Array.isArray(message)) {
      return message.map((item) => String(item));
    }
    if (typeof message === 'string') {
      return [message];
    }
  }
  return ['The request could not be completed.'];
}

@Catch() // Catches everything, not only HttpException
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const messages =
      exception instanceof HttpException
        ? readMessages(exception.getResponse())
        : [INTERNAL_ERROR_MESSAGE];

    // Server errors are logged with their details, for the developer only
    if (status >= 500) {
      const details =
        exception instanceof Error ? exception.message : 'unknown error';
      this.logger.error(
        `[${request.method}] ${request.url} - ${details}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      statusCode: status,
      message: messages.join(' '),
      ...(messages.length > 1 ? { errors: messages } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
