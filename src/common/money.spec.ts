import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { roundMillimes } from './money';
import { CreateStageDto } from '../stages/dto/create-stage.dto';
import { CreateProductDto } from '../products/dto/create-product.dto';

// Why the price of a course or product form is refused ([] when it is not)
async function refusedPrice(form: new () => object, price: unknown) {
  const errors = await validate(
    plainToInstance(form, { title: 'Node basics', price }),
  );
  return errors
    .filter((error) => error.property === 'price')
    .flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('Amounts in millimes (TND with at most 3 decimals)', () => {
  it('to the nearest millime, a half going up, without the tiny errors', () => {
    expect(roundMillimes(29.99985)).toBe(30);
    expect(roundMillimes(12.499875)).toBe(12.5);
    // 0.5005 * 1000 is 500.49999999999994 in JavaScript
    expect(roundMillimes(0.5005)).toBe(0.501);
    expect(roundMillimes(0.1 + 0.2)).toBe(0.3);
    expect(roundMillimes(87.4994)).toBe(87.499);
    expect(roundMillimes(120)).toBe(120);
    expect(roundMillimes(0)).toBe(0);
  });

  it('a course price: at most 3 decimals, like a digital product', async () => {
    await expect(refusedPrice(CreateStageDto, 99.5)).resolves.toEqual([]);
    await expect(refusedPrice(CreateStageDto, 99.999)).resolves.toEqual([]);
    await expect(refusedPrice(CreateStageDto, 99.9999)).resolves.toEqual([
      'The price must be a number, like 120 or 99.500.',
    ]);
    await expect(refusedPrice(CreateProductDto, 12.5001)).resolves.toContain(
      'The price must be a number, like 25 or 12.500.',
    );
  });
});
