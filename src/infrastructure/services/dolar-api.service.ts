import axios from 'axios';
import { ExchangeRate } from '../../domain/entities/exchange-rate.entity';
import { IExchangeRateService } from '../../application/ports/exchange-rate-service.interface';
import { apiCambioUrl } from '../../main/config/env';

export class DolarApiService implements IExchangeRateService {
  async getUSDRate(): Promise<ExchangeRate> {
    try {
      const response = await axios.get(`${apiCambioUrl}/v1/trm`);
      const data = response.data;

      if (!data || typeof data.valor !== 'number') {
        throw new Error('Invalid response structure from DolarAPI');
      }

      // Extract date and format it as YYYY-MM-DD
      const rawDate = data.fechaActualizacion ? new Date(data.fechaActualizacion) : new Date();
      const formattedDate = rawDate.toISOString().split('T')[0];

      return {
        currency: 'USD',
        rate: data.valor,
        date: formattedDate,
        source: 'DolarAPI Colombia',
      };
    } catch (error: any) {
      const message = error.response?.data?.message || error.message || 'Error fetching USD rate';
      throw new Error(`External API Error: ${message}`);
    }
  }
}
