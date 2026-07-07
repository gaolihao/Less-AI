const healthController = {
    get: (req, res) => {
        res.status(200).json({ status: 'ok' });
    
    }
}

export default healthController;
