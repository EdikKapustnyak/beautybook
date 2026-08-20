import { ValidationError } from '../errors/AppError.js';

export function requireParam(value: string | undefined, paramName: string): string {
  if (!value) {
    throw new ValidationError(`Missing required path parameter: ${paramName}.`);
  }
  return value;
}
