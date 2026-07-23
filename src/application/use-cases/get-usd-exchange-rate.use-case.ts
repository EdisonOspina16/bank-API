import { ExchangeRate } from '../../domain/entities/exchange-rate.entity';
import { IExchangeRateService } from '../ports/exchange-rate-service.interface';

export class GetUSDExchangeRateUseCase {
  constructor(private readonly exchangeRateService: IExchangeRateService) {}

  async execute(): Promise<ExchangeRate> {
    return this.exchangeRateService.getUSDRate();
  }
}
