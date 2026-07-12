import express, { Request, Response } from 'express';
import path from 'path';
import sqlite3 from 'sqlite3';

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
        id INTEGER PRIMARY KEY,
        level INTEGER,
        xp INTEGER,
        daily_kcal INTEGER
    )`);

    //
    db.get("SELECT count(*) as count FROM users", (err, row: any) => {
        if (row.count === 0) {
            db.run("INSERT INTO users (id, level, xp, daily_kcal) VALUES (1, 5, 850, 1200)");
        }
    });
});

// api routes for db

// get user data
app.get('/api/user', (req: Request, res: Response) => {
    db.get("SELECT * FROM users WHERE id = 1", (err, row) => {
        res.json(row);
    });
});

// save userdata
app.post('/api/user/update', (req: Request, res: Response) => {
    const { level, xp, daily_kcal } = req.body;
    db.run("UPDATE users SET level = ?, xp = ?, daily_kcal = ? WHERE id = 1",
        [level, xp, daily_kcal],
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