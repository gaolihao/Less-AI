import {Router} from 'express';
import detectionController from '../controllers/detectionController.js';

const router = Router();

router.get('/', detectionController.detect);

export default router;
