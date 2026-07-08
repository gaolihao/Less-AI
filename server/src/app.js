import express from 'express';
import healthRouter from './routers/healthRouter.js';
import detectionRouter from './routers/detectionRouter.js';
import cors from 'cors';

const app = express();

const corsOptions = {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
};

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', corsOptions.origin);
    res.setHeader('Access-Control-Allow-Methods', corsOptions.methods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', corsOptions.allowedHeaders.join(', '));

    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }

    next();
});

app.use(cors(corsOptions));
app.use(express.json());

app.use('/', healthRouter);
app.use('/detection', detectionRouter);

export default app;
