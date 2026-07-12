import type { NextFunction, Response, Request } from "express";

// Wraps an async Express handler and forwards any thrown errors to the error middleware
const asyncHandler =
  (fun: Function) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fun(req, res, next)).catch((error) => next(error));
  };

export default asyncHandler;