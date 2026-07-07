import healthService from '../services/healthService.js';

class HealthController {
    get = async (req, res) => {
        const health = healthService.checkHealth();
        res.status(200).json(health);
    
    }
}

export default new HealthController();

