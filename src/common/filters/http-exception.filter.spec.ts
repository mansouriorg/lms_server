import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  HttpExceptionFilter,
  INTERNAL_ERROR_MESSAGE,
  readMessages,
} from './http-exception.filter';

type FakeResponse = {
  status(code: number): FakeResponse;
  json(body: Record<string, unknown>): FakeResponse;
};

// Runs the filter on one exception and returns what it sent back.
function run(exception: unknown) {
  const sent: { status?: number; body?: Record<string, unknown> } = {};
  const response: FakeResponse = {
    status(code) {
      sent.status = code;
      return response;
    },
    json(body) {
      sent.body = body;
      return response;
    },
  };
  const request = { method: 'POST', url: '/auth/login' };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  };
  new HttpExceptionFilter().catch(exception, host as unknown as ArgumentsHost);
  return sent;
}

describe('HttpExceptionFilter (the shape of every error response)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('a 404: the readable message, as `message`', () => {
    const sent = run(new NotFoundException('Course not found.'));
    expect(sent.status).toBe(404);
    expect(sent.body).toMatchObject({
      statusCode: 404,
      message: 'Course not found.',
      path: '/auth/login',
    });
    expect(sent.body).not.toHaveProperty('errors');
  });

  it('validation errors: one readable message, plus the list', () => {
    const sent = run(
      new BadRequestException([
        'Please enter a valid email address.',
        'Please enter your password.',
      ]),
    );
    expect(sent.status).toBe(400);
    expect(sent.body).toMatchObject({
      message:
        'Please enter a valid email address. Please enter your password.',
      errors: [
        'Please enter a valid email address.',
        'Please enter your password.',
      ],
    });
  });

  it('an HttpException with a plain text body', () => {
    const sent = run(new HttpException('Too many requests.', 429));
    expect(sent.status).toBe(429);
    expect(sent.body).toMatchObject({ message: 'Too many requests.' });
  });

  it('an unexpected error: a generic message; the details only go to the log', () => {
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const sent = run(new Error('database password is wrong'));

    expect(sent.status).toBe(500);
    expect(sent.body).toMatchObject({ message: INTERNAL_ERROR_MESSAGE });
    expect(JSON.stringify(sent.body)).not.toContain('database password');
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('readMessages: an unknown body still gives a readable message', () => {
    expect(readMessages({})).toEqual(['The request could not be completed.']);
  });
});
