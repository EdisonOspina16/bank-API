import type { Request, Response, NextFunction } from 'express';
import { GetUSDExchangeRateUseCase } from '../../../application/use-cases/get-usd-exchange-rate.use-case';
import { GetTrmHistoryUseCase } from '../../../application/use-cases/get-trm-history.use-case';
import { DolarApiService } from '../../../infrastructure/services/dolar-api.service';

const dolarApiService = new DolarApiService();
const getUSDExchangeRateUseCase = new GetUSDExchangeRateUseCase(dolarApiService);
const getTrmHistoryUseCase = new GetTrmHistoryUseCase(dolarApiService);

async function getUSDRate(_request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const exchangeRate = await getUSDExchangeRateUseCase.execute();
    response.status(200).json(exchangeRate);
  } catch (error) {
    next(error);
  }
}

async function getTrmHistory(_request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const history = await getTrmHistoryUseCase.execute();
    response.status(200).json({ history });
  } catch (error) {
    next(error);
  }
}

export { getUSDRate, getTrmHistory };
