import { z } from 'zod';
import { AppError } from '../errors/AppError.js';

export function validate<T extends z.ZodType>(
  schema: T,
  input: unknown,
): z.infer<T> {
  const result = schema.safeParse(input);

  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));

    throw new AppError(
      'VALIDATION_ERROR',
      `Request validation failed: ${details
        .map((detail) =>
          detail.path
            ? `${detail.path}: ${detail.message}`
            : detail.message,
        )
        .join('; ')}`,
    );
  }

  return result.data;
}