import express from 'express';
import cors from 'cors';
import healthRoutes from '../interfaces/http/routes/health.routes';
import exchangeRateRoutes from '../interfaces/http/routes/exchange-rate.routes';
import authRoutes from '../interfaces/http/routes/auth.routes';
import transferRoutes from '../interfaces/http/routes/transfer.routes';
import movementRoutes from '../interfaces/http/routes/movement.routes';
import accountRoutes from '../interfaces/http/routes/account.routes';
import profileRoutes from '../interfaces/http/routes/profile.routes';
import notificationRoutes from '../interfaces/http/routes/notification.routes';
import creditCardRoutes from '../interfaces/http/routes/credit-card.routes';
import debitCardRoutes from '../interfaces/http/routes/debit-card.routes';
import { errorHandler, notFoundHandler } from '../interfaces/http/middlewares/error.middleware';
import loanRoutes from '../interfaces/http/routes/loan.routes';

const app = express();

app.use(cors());
// Base64 de PDF/JPG (hasta ~5MB) supera el default de 100kb de express.json
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/health', healthRoutes);
app.use('/api/v1/exchange-rate', exchangeRateRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/transfers', transferRoutes);
app.use('/api/v1/movements', movementRoutes);
app.use('/api/v1/accounts', accountRoutes);
app.use('/api/v1/loans', loanRoutes);

// Perfil, notificaciones y tarjetas (rutas del prompt + alias /api/v1)
app.use('/api/perfil', profileRoutes);
app.use('/api/v1/perfil', profileRoutes);
app.use('/api/notificaciones', notificationRoutes);
app.use('/api/v1/notificaciones', notificationRoutes);
app.use('/api/tarjetas-credito', creditCardRoutes);
app.use('/api/v1/tarjetas-credito', creditCardRoutes);
app.use('/api/tarjeta-debito', debitCardRoutes);
app.use('/api/v1/tarjeta-debito', debitCardRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
