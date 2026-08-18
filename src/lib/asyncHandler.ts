import type { NextFunction, Request, RequestHandler, Response } from "express";

/** Express 4는 async 핸들러의 reject를 자동으로 잡아주지 않으므로 next(err)로 전달한다. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
