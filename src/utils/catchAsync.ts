import { NextFunction, Request, RequestHandler, Response } from 'express';

/** Wraps async route handlers so rejections reach the error middleware. */
export const catchAsync =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
