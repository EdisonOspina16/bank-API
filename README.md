# Bank API

Backend base for the banking API, built with Express, TypeScript, and Clean Architecture.

## Run locally

```bash
npm install
npm run dev
```

`npm run dev` executes the TypeScript source directly with `tsx`. For a production-style run:

```bash
npm run build
npm start
```

The API runs on `http://localhost:5000` by default. Set `PORT` to use another port.

## Endpoints

### Health check

```http
GET /api/health/
```

### TRM del día (Dólar)

```http
GET /api/v1/exchange-rate/usd
```

**Respuesta exitosa (200 OK):**
```json
{
  "currency": "USD",
  "rate": 3238.19,
  "date": "2026-07-22",
  "source": "DolarAPI Colombia"
}
```

**Respuesta de error de proveedor (502 Bad Gateway):**
```json
{
  "error": "Bad Gateway",
  "message": "No se pudo obtener la TRM desde el proveedor externo (DolarAPI)...",
  "details": "External API Error: ..."
}
```

## Structure

- `src/domain`: business entities (`ExchangeRate`), value objects, services, and repository contracts.
- `src/application`: use cases (`GetUSDExchangeRateUseCase`), ports (`IExchangeRateService`), and application orchestration.
- `src/interfaces`: HTTP controllers (`exchange-rate.controller`), routes (`exchange-rate.routes`), middleware (`error.middleware` with 502/500 mappings), and transport adapters.
- `src/infrastructure`: database, external services (`DolarApiService` consuming DolarAPI via Axios), and concrete repository implementations.
- `src/main`: application composition, configuration (`env`), and server bootstrap.
