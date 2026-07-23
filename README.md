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

The API runs on `http://localhost:3000` by default. Set `PORT` to use another port.

## Health check

```http
GET /api/health/
```

## Structure

- `src/domain`: business entities, value objects, services, and repository contracts.
- `src/application`: use cases and application orchestration.
- `src/interfaces`: HTTP controllers, routes, middleware, and transport adapters.
- `src/infrastructure`: database, external services, and concrete repository implementations.
- `src/main`: application composition, configuration, and server bootstrap.
