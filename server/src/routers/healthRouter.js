import {Router} from 'express';
import healthController from '../controllers/healthController.js';

const router = Router();

router.get('/', healthController.get);

export default router;
