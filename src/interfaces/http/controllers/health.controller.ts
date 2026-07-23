import type { Request, Response } from 'express';
import getHealthStatus from '../../../application/use-cases/get-health-status.use-case';

function getStatus(_request: Request, response: Response): void {
  response.status(200).json(getHealthStatus());
}

export { getStatus };