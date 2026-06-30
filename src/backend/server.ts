import express, { Request, Response } from 'express';
import path from 'path';

const app = express();
const PORT = 3000;

const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

app.get('/api/status', (req: Request, res: Response) => {
    res.json({ message: "Backend API Test" });
});

app.listen(PORT, () => {
    console.log(`Server running: http://localhost:${PORT}`);
});