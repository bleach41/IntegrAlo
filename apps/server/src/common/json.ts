import { BadRequestException } from '@nestjs/common';
import { ZodTypeAny, z } from 'zod';

/** Parses a JSON payload received from the network; undefined if it is empty or invalid. */
export function parseJson(payload: Buffer): unknown {
  const text = payload.toString('utf8');
  if (text.length === 0) return undefined; // cleared retained message
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Validates an HTTP request body; responds 400 with the zod issues if it does not match. */
export function parseBody<S extends ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  return result.data;
}
