import detectionService from '../services/detectionService.js';

class DetectionController {
    detect = async (req, res) => {
        try {
            const text = req.body?.text ?? '';
            const detection = await detectionService.detect(text);
            res.status(200).json(detection);
        } catch (err) {
            console.error('Detection failed:', err.message);
            res.status(503).json({ error: 'Detection service unavailable' });
        }
    };
}

export default new DetectionController();
