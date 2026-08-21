import { Router } from 'express';
import agentController from '../controllers/agentController.js';

const router = Router();

router.post('/analyze', agentController.analyze);

export default router;
