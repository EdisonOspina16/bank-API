import { ExchangeRate } from '../../domain/entities/exchange-rate.entity';
import { TrmHistoryPoint } from '../../domain/entities/trm-history-point.entity';

export interface IExchangeRateService {
  getUSDRate(): Promise<ExchangeRate>;
  getHistoricalRates(): Promise<TrmHistoryPoint[]>;
}
