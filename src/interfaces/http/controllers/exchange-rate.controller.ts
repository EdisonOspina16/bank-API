import type { Request, Response, NextFunction } from 'express';
import { GetUSDExchangeRateUseCase } from '../../../application/use-cases/get-usd-exchange-rate.use-case';
import { DolarApiService } from '../../../infrastructure/services/dolar-api.service';

const dolarApiService = new DolarApiService();
const getUSDExchangeRateUseCase = new GetUSDExchangeRateUseCase(dolarApiService);

async function getUSDRate(_request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const exchangeRate = await getUSDExchangeRateUseCase.execute();
    response.status(200).json(exchangeRate);
  } catch (error) {
    next(error);
  }
}

export { getUSDRate };
