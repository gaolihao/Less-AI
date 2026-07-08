import express from 'express';
import healthRouter from './routers/healthRouter.js';
import detectionRouter from './routers/detectionRouter.js';

const app = express();

app.use(express.json());

app.use('/', healthRouter);
app.use('/detection', detectionRouter);

export default app;
