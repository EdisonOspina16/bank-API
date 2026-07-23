import express from 'express';
import cors from 'cors';
import healthRoutes from '../interfaces/http/routes/health.routes';
import exchangeRateRoutes from '../interfaces/http/routes/exchange-rate.routes';
import { errorHandler, notFoundHandler } from '../interfaces/http/middlewares/error.middleware';

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api/health', healthRoutes);
app.use('/api/v1/exchange-rate', exchangeRateRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;