import { plainToInstance } from 'class-transformer';
import { RegisterDto } from '../auth/dto/register.dto';
import { LoginDto } from '../auth/dto/login.dto';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { CreateStageDto } from '../stages/dto/create-stage.dto';
import { CreateCenterDto } from '../centers/dto/create-center.dto';
import { withoutHtml } from './text';

// The text fields of these forms are cleaned when a request arrives (the
// @Transform decorators, see common/text.ts). If sanitize-html is imported
// the wrong way, that call throws and the request fails with a 500.
describe('form input cleaning (common/text.ts)', () => {
  it('names, cities, phones: no HTML, but "&" and quotes stay as typed', () => {
    const clean = (value: unknown) => withoutHtml({ value });
    expect(clean('  R&D Academy ')).toBe('R&D Academy');
    expect(clean(`Tom & Jerry's "Code" School`)).toBe(
      `Tom & Jerry's "Code" School`,
    );
    expect(clean('Hello<script>alert(1)</script> <b>world</b>')).toBe(
      'Hello world',
    );
    // Angle brackets are dropped, even when typed as &lt; and &gt;
    expect(clean('&lt;b&gt;Bold&lt;/b&gt;')).toBe('bBold/b');
    // A value stored with "&amp;" before this fix, sent again by a form
    expect(clean('R&amp;D Academy')).toBe('R&D Academy');
    // Not text: left for the validators (400 instead of a crash)
    expect(clean(42)).toBe(42);
    expect(clean(null)).toBeNull();
  });

  it('sign-up and sign-in: names without HTML, email trimmed and in lower case', () => {
    const dto = plainToInstance(RegisterDto, {
      email: '  Amira@Example.COM ',
      firstName: '  Amira<script>alert(1)</script> ',
      lastName: 'Ben Ali<img src=x onerror=alert(1)>',
      password: 'a long password',
    });
    expect(dto).toMatchObject({
      email: 'amira@example.com',
      firstName: 'Amira',
      lastName: 'Ben Ali',
    });
    const login = plainToInstance(LoginDto, {
      email: ' Amira@Example.COM',
      password: 'x',
    });
    expect(login.email).toBe('amira@example.com');
    expect(plainToInstance(LoginDto, { email: 42 }).email).toBe(42);
  });

  it('profile: cleans the fields that are sent, leaves the others out', () => {
    const dto = plainToInstance(UpdateUserDto, {
      phone: ' +216 20 000 000<script>x</script>',
      lastName: 'Ben Salah & Co',
    });
    expect(dto).toMatchObject({
      phone: '+216 20 000 000',
      lastName: 'Ben Salah & Co',
    });
    expect(dto).not.toHaveProperty('firstName');
  });

  it('course form: texts kept as typed (code too), only the spaces around removed', () => {
    const dto = plainToInstance(CreateStageDto, {
      title: '  C++ & Rust: Vec<T> and Option<T> ',
      description: 'Line 1: if (a < b && c > d)\nLine 2: List<String>',
      category: ' Web & Mobile ',
      price: 120,
    });
    expect(dto).toMatchObject({
      title: 'C++ & Rust: Vec<T> and Option<T>',
      description: 'Line 1: if (a < b && c > d)\nLine 2: List<String>',
      category: 'Web & Mobile',
    });
  });

  it('academy form: "R&D Academy" is stored as typed, HTML removed', () => {
    const dto = plainToInstance(CreateCenterDto, {
      name: ' R&D Academy<script>x</script>',
      location: 'Tunis ',
      contactEmail: ' Hello@Code.TN ',
      contactPhone: '71 000 000',
    });
    expect(dto).toMatchObject({
      name: 'R&D Academy',
      location: 'Tunis',
      contactEmail: 'hello@code.tn',
      contactPhone: '71 000 000',
    });
  });
});
