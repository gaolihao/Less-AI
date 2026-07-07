class DetectionController {
    detect = async (req, res) => {
        const text = req.body.text;
        const detection = detectionService.detect(text);
        res.status(200).json(detection);
    }
}

export default new DetectionController();