import express, { Request, Response } from 'express';
import path from 'path';

const app = express();

app.use(express.json());

const PORT = 3000;

const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

app.get('/api/status', (req: Request, res: Response) => {
    res.json({ message: "Backend API Test" });
});

app.post('/api/scan', (req: Request, res: Response) => {
    const receivedBarcode = req.body.barcode;
    console.log("Backend hat einen Barcode empfangen:", receivedBarcode);

    res.json({ message: "Barcode erfolgreich im Backend angekommen!", code: receivedBarcode });
});

app.listen(PORT, () => {
    console.log(`Server running: http://localhost:${PORT}`);
});