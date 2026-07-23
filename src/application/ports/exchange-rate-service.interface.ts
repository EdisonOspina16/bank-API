import { ExchangeRate } from '../../domain/entities/exchange-rate.entity';

export interface IExchangeRateService {
  getUSDRate(): Promise<ExchangeRate>;
}
