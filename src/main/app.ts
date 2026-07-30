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

const app = express();

app.use(cors());
app.use(express.json());

// Main Jes Bank API Routes
app.use('/api/health', healthRoutes);
app.use('/api/v1/exchange-rate', exchangeRateRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/transfers', transferRoutes);
app.use('/api/v1/movements', movementRoutes);
app.use('/api/v1/accounts', accountRoutes);

// New Connected Features (supporting both paths)
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