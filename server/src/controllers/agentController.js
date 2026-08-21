import agentService from '../services/agentService.js';

class AgentController {
    analyze = async (req, res) => {
        try {
            const text = req.body?.text ?? '';
            const options = normalizeOptions(req.body?.options);
            const analysis = await agentService.analyze(text, options);
            res.status(200).json(analysis);
        } catch (err) {
            console.error('Agent analyze failed:', err.message);
            const status = err.statusCode === 400 ? 400 : 503;
            res.status(status).json({
                error:
                    status === 400
                        ? err.message
                        : 'Detection service unavailable',
            });
        }
    };

    turn = async (req, res) => {
        try {
            const result = await agentService.turn({
                action: req.body?.action,
                sessionId: req.body?.sessionId ?? null,
                text: req.body?.text,
                options: normalizeOptions(req.body?.options),
            });
            res.status(200).json(result);
        } catch (err) {
            console.error('Agent turn failed:', err.message);
            const status = err.statusCode || 503;
            res.status(status).json({
                error:
                    status === 503
                        ? 'Detection service unavailable'
                        : err.message,
            });
        }
    };
}

function normalizeOptions(options = {}) {
    const normalized = {};
    if (typeof options.flagThreshold === 'number') {
        normalized.flagThreshold = options.flagThreshold;
    } else if (typeof options.flagThresholdPercent === 'number') {
        normalized.flagThreshold = options.flagThresholdPercent / 100;
    }
    return normalized;
}

export default new AgentController();
