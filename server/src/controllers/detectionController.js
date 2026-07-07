class DetectionController {
    detect = async (req, res) => {
        res.status(200).json({ message: 'Detection successful' });
    }
}

export default new DetectionController();