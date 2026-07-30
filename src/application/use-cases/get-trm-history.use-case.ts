import { TrmHistoryPoint } from '../../domain/entities/trm-history-point.entity';
import { IExchangeRateService } from '../ports/exchange-rate-service.interface';

export class GetTrmHistoryUseCase {
  constructor(private readonly exchangeRateService: IExchangeRateService) {}

  async execute(): Promise<TrmHistoryPoint[]> {
    return this.exchangeRateService.getHistoricalRates();
  }
}
