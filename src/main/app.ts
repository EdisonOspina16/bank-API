import express from 'express';
import healthRoutes from '../interfaces/http/routes/health.routes';
import { errorHandler, notFoundHandler } from '../interfaces/http/middlewares/error.middleware';

const app = express();

app.use(express.json());
app.use('/api/health', healthRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;