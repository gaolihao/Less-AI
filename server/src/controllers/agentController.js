import agentService from '../services/agentService.js';

class AgentController {
    analyze = async (req, res) => {
        try {
            const text = req.body?.text ?? '';
            const analysis = await agentService.analyze(text);
            res.status(200).json(analysis);
        } catch (err) {
            console.error('Agent analyze failed:', err.message);
            res.status(503).json({ error: 'Detection service unavailable' });
        }
    };
}

export default new AgentController();
