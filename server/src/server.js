import express from 'express';
import healthRouter from './routers/healthRouter.js';
import detectionRouter from './routers/detectionRouter.js';

const app = express();
const PORT = 3000 || process.env.PORT;

app.use(express.json());

app.use('/', healthRouter);
app.use('/detection', detectionRouter);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
