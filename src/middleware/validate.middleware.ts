import { NextFunction, Request, Response } from 'express';
import { AnyZodObject, ZodError, ZodTypeAny } from 'zod';
import { ApiError } from '../utils/apiError';

interface Schemas {
  body?: ZodTypeAny;
  query?: AnyZodObject;
  params?: AnyZodObject;
}

/** Validates and coerces request parts with Zod; replaces them with parsed values. */
export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params) as never;
      if (schemas.query) req.query = schemas.query.parse(req.query) as never;
      if (schemas.body) req.body = schemas.body.parse(req.body);
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        }));
        return next(
          ApiError.badRequest(details[0]?.message || 'Invalid request', 'VALIDATION_ERROR', details),
        );
      }
      return next(err);
    }
  };
}
