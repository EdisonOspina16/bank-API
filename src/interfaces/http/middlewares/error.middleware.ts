import type { ErrorRequestHandler, Request, Response, NextFunction } from 'express';

function notFoundHandler(_request: Request, response: Response): void {
  response.status(404).json({
    error: 'Route not found'
  });
}

const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction
): void => {
  console.error(error);
  response.status(500).json({
    error: 'Internal server error'
  });
};

export { errorHandler, notFoundHandler };