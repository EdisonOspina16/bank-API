import type { ErrorRequestHandler, Request, Response, NextFunction } from 'express';

function notFoundHandler(_request: Request, response: Response): void {
  response.status(404).json({
    error: 'Route not found'
  });
}

const errorHandler: ErrorRequestHandler = (
  error: any,
  _request: Request,
  response: Response,
  _next: NextFunction
): void => {
  console.error('Centralized Error Logger:', error);

  // Body demasiado grande (subida de documentos en base64)
  if (error?.type === 'entity.too.large' || error?.status === 413) {
    response.status(413).json({
      error: 'El archivo es demasiado grande. Máximo permitido: 5MB.',
    });
    return;
  }

  const message = error.message || 'Internal server error';

  if (message.startsWith('External API Error')) {
    response.status(502).json({
      error: 'Bad Gateway',
      message: 'No se pudo obtener la TRM desde el proveedor externo. Por favor, intenta de nuevo más tarde.',
      details: message
    });
    return;
  }

  response.status(500).json({
    error: message || 'Internal server error',
    message: 'Ha ocurrido un error interno en el servidor.'
  });
};

export { errorHandler, notFoundHandler };