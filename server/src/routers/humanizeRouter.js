import { Router } from 'express';
import humanizeController from '../controllers/humanizeController.js';

const router = Router();

router.post('/analyze', humanizeController.analyze);
router.post('/turn', humanizeController.turn);

export default router;
