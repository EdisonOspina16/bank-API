import express from 'express';
import cors from 'cors';
import healthRoutes from '../interfaces/http/routes/health.routes';
import exchangeRateRoutes from '../interfaces/http/routes/exchange-rate.routes';
import authRoutes from '../interfaces/http/routes/auth.routes';
import transferRoutes from '../interfaces/http/routes/transfer.routes';
import movementRoutes from '../interfaces/http/routes/movement.routes';
import accountRoutes from '../interfaces/http/routes/account.routes';
import { errorHandler, notFoundHandler } from '../interfaces/http/middlewares/error.middleware';
import loanRoutes from '../interfaces/http/routes/loan.routes';

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api/health', healthRoutes);
app.use('/api/v1/exchange-rate', exchangeRateRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/transfers', transferRoutes);
app.use('/api/v1/movements', movementRoutes);
app.use('/api/v1/accounts', accountRoutes);
app.use('/api/v1/loans', loanRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;