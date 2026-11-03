import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

describe('OptionalJwtAuthGuard (public routes)', () => {
  const guard = new OptionalJwtAuthGuard();
  const student = { id: 'u1', email: 'amira@example.com', role: 'STUDENT' };

  it('a valid token: the user is kept', () => {
    expect(guard.handleRequest(null, student)).toBe(student);
  });

  it('no token, or an invalid or expired one: no user and no 401', () => {
    expect(guard.handleRequest(null, false)).toBeNull();
    expect(guard.handleRequest(new Error('jwt expired'), false)).toBeNull();
    expect(guard.handleRequest(null, undefined)).toBeNull();
  });
});
