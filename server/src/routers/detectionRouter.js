import {Router} from 'express';
import detectionController from '../controllers/detectionController.js';

const router = Router();

router.post('/', detectionController.detect);

export default router;
