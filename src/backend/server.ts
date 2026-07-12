import express, { Request, Response } from 'express';
import path from 'path';
import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const SECRET_KEY = "a-very-secret-key";
const app = express();

app.use(express.json());

// init db
const db = new sqlite3.Database('./nutriquest.db', (err) => {
    if (err) console.error("Datenbank-Fehler:", err.message);
    else console.log("💾 Mit SQLite-Datenbank verbunden.");
});

// create table if it does not exist
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
                     id INTEGER PRIMARY KEY AUTOINCREMENT,
                     username TEXT UNIQUE,
                     password TEXT,
                     level INTEGER,
                     xp INTEGER,
                     daily_kcal INTEGER
            )`);
});

app.post('/api/register', async (req: Request, res: Response) => {
    const { username, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    db.run("INSERT INTO users (username, password, level, xp, daily_kcal) VALUES (?, ?, 1, 0, 2000)",
        [username, hashedPassword],
        function(err) {
            if (err) {
                res.status(400).json({ success: false, message: "Nutzername existiert bereits!" });
            } else {
                res.json({ success: true, userId: this.lastID });
            }
        });
});

app.post('/api/login', (req: Request, res: Response) => {
    const { username, password } = req.body;

    db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user: any) => {
        if (!user) return res.status(400).json({ success: false, message: "Nutzer nicht gefunden!" });

        const match = await bcrypt.compare(password, user.password);
        if (match) {
            const token = jwt.sign({ userId: user.id }, SECRET_KEY, { expiresIn: '24h' });
            res.json({ success: true, token: token });
        } else {
            res.status(400).json({ success: false, message: "Falsches Passwort!" });
        }
    });
});

const authenticateToken = (req: any, res: Response, next: any) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json({ message: "Kein Token gefunden" });

    jwt.verify(token, SECRET_KEY, (err: any, decodedUser: any) => {
        if (err) return res.status(403).json({ message: "Token ungültig oder abgelaufen" });
        req.user = decodedUser;
        next();
    });
};

// api routes for db

// get user data
app.get('/api/user/me', authenticateToken, (req: any, res: Response) => {
    const userId = req.user.userId;
    db.get("SELECT level, xp, daily_kcal FROM users WHERE id = ?", [userId], (err, row) => {
        res.json(row);
    });
});

app.post('/api/user/update', authenticateToken, (req: any, res: Response) => {
    const userId = req.user.userId;
    const { level, xp, daily_kcal } = req.body;
    db.run("UPDATE users SET level = ?, xp = ?, daily_kcal = ? WHERE id = ?",
        [level, xp, daily_kcal, userId],
        (err) => {
            if (err) res.status(500).json({ success: false });
            else res.json({ success: true });
        }
    );
});

const PORT = 3000;

const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

app.get('/api/status', (req: Request, res: Response) => {
    res.json({ message: "Backend API Test" });
});

app.post('/api/scan', async (req: Request, res: Response) => {
    const receivedBarcode = req.body.barcode;
    console.log(`Backend sucht nach Barcode: ${receivedBarcode}`);

    try {
        // fetch data from openfoodfacts api
        const apiUrl = `https://world.openfoodfacts.org/api/v0/product/${receivedBarcode}.json`;
        const apiResponse = await fetch(apiUrl);
        const data = await apiResponse.json();

        // check if any data relating to barcode exists
        if (data.status === 1) {
            const product = data.product;
            const name = product.product_name || "Unbekanntes Produkt";
            const kcal = product.nutriments['energy-kcal_100g'] || 0;

            console.log(`✅ Gefunden: ${name} (${kcal} kcal/100g)`);

            // send json response to frontend
            res.json({ success: true, name: name, kcal: kcal });
        } else {
            console.log("❌ Produkt nicht gefunden.");
            res.json({ success: false, message: "Produkt nicht in der Datenbank gefunden." });
        }
    } catch (error) {
        console.error("Fehler bei der API-Abfrage:", error);
        res.status(500).json({ success: false, message: "Server-Fehler bei der API-Abfrage." });
    }
});

app.listen(PORT, () => {
    console.log(`Server running: http://localhost:${PORT}`);
});