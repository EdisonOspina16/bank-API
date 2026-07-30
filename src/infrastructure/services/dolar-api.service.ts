import axios from 'axios';
import { ExchangeRate } from '../../domain/entities/exchange-rate.entity';
import { TrmHistoryPoint } from '../../domain/entities/trm-history-point.entity';
import { IExchangeRateService } from '../../application/ports/exchange-rate-service.interface';
import { apiCambioUrl, trmHistoricalApiUrl } from '../../main/config/env';

interface DatosGovTrmRow {
  valor: string;
  unidad: string;
  vigenciadesde: string;
  vigenciahasta: string;
}

export class DolarApiService implements IExchangeRateService {
  private buildOrderedUrl(limit: number): string {
    if (!apiCambioUrl) {
      throw new Error('API_CAMBIO_URL_KEY is not configured.');
    }
    const separator = apiCambioUrl.includes('?') ? '&' : '?';
    return `${apiCambioUrl}${separator}$order=vigenciadesde DESC&$limit=${limit}`;
  }

  private parseRows(rows: DatosGovTrmRow[]): TrmHistoryPoint[] {
    return rows
      .map((row) => ({
        date: row.vigenciadesde?.split('T')[0] ?? '',
        rate: Number.parseFloat(row.valor),
      }))
      .filter((point) => point.date && !Number.isNaN(point.rate));
  }

  async getUSDRate(): Promise<ExchangeRate> {
    try {
      const url = this.buildOrderedUrl(1);
      const response = await axios.get<DatosGovTrmRow[]>(url);
      const data = response.data?.[0];

      if (!data || !data.valor) {
        throw new Error('Invalid response structure from Datos Abiertos Colombia');
      }

      const rate = Number.parseFloat(data.valor);
      if (Number.isNaN(rate)) {
        throw new Error('Invalid TRM value from Datos Abiertos Colombia');
      }

      return {
        currency: 'USD',
        rate,
        date: data.vigenciadesde?.split('T')[0] ?? new Date().toISOString().split('T')[0],
        source: 'Datos Abiertos Colombia',
      };
    } catch (error: any) {
      const message = error.response?.data?.message || error.message || 'Error fetching USD rate';
      throw new Error(`External API Error: ${message}`);
    }
  }

  async getHistoricalRates(): Promise<TrmHistoryPoint[]> {
    try {
      const url = trmHistoricalApiUrl ?? this.buildOrderedUrl(30);
      const response = await axios.get<DatosGovTrmRow[]>(url);
      const points = this.parseRows(response.data ?? []);

      if (points.length === 0) {
        throw new Error('No historical TRM data available');
      }

      return points.reverse();
    } catch (error: any) {
      const message = error.response?.data?.message || error.message || 'Error fetching historical TRM';
      throw new Error(`External API Error: ${message}`);
    }
  }
}
