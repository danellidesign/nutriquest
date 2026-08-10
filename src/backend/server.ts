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

    db.run(`CREATE TABLE IF NOT EXISTS diary_entries (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         user_id INTEGER,
         date TEXT,
         food_name TEXT,
         grams INTEGER,
         kcal_consumed INTEGER,
         target_kcal INTEGER,
         FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

    db.run(`CREATE TABLE IF NOT EXISTS daily_quests_claimed (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        date TEXT,
        quest_id TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
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

// port for backend service and path to frontend files
const PORT = 3000;
const frontendPath = path.join(__dirname, '../frontend');

// boot up express server
app.use(express.static(frontendPath));
app.listen(PORT, () => {
    console.log(`Server running: http://localhost:${PORT}`);
});

// api routes

// general routes for stuff like registering, logging in etc.
app.post('/api/register', async (req: Request, res: Response) => {
    const { username, password, daily_kcal } = req.body;

    const targetKcal = parseInt(daily_kcal) || 2000;
    const hashedPassword = await bcrypt.hash(password, 10);

    db.run("INSERT INTO users (username, password, level, xp, daily_kcal) VALUES (?, ?, 1, 0, ?)",
        [username, hashedPassword, targetKcal],
        function(err) {
            if (err) {
                res.status(400).json({ success: false, message: "Nutzername existiert bereits!" });
            } else {
                res.json({ success: true, userId: this.lastID });
            }
        });
});

app.get('/api/status', (req: Request, res: Response) => {
    res.json({ message: "Backend API Test" });
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

// user routes
app.get('/api/user/me', authenticateToken, (req: any, res: Response) => {
    const userId = req.user.userId;

    db.get("SELECT username, level, xp, daily_kcal FROM users WHERE id = ?", [userId], (err, row) => {
        res.json(row);
    });
});

app.put('/api/user/profile', authenticateToken, (req: any, res: Response) => {
    const userId = req.user.userId;
    const { username, daily_kcal } = req.body;

    db.run("UPDATE users SET username = ?, daily_kcal = ? WHERE id = ?",
        [username, daily_kcal, userId],
        function(err) {
            if (err) {
                res.status(400).json({ success: false, message: "Nutzername bereits vergeben oder Fehler!" });
            } else {
                res.json({ success: true });
            }
        }
    );
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

// diary routes
app.post('/api/diary/add', authenticateToken, (req: any, res: Response) => {
    const userId = req.user.userId;
    const { date, food_name, grams, kcal_consumed, target_kcal } = req.body;

    db.run("INSERT INTO diary_entries (user_id, date, food_name, grams, kcal_consumed, target_kcal) VALUES (?, ?, ?, ?, ?, ?)",
        [userId, date, food_name, grams, kcal_consumed, target_kcal],
        (err) => {
            if (err) res.status(500).json({ success: false, error: err.message });
            else res.json({ success: true });
        }
    );
});

app.delete('/api/diary/:id', authenticateToken, (req: any, res: Response) => {
    const userId = req.user.userId;
    const entryId = req.params.id;

    db.run("DELETE FROM diary_entries WHERE id = ? AND user_id = ?", [entryId, userId], (err) => {
        if (err) res.status(500).json({ success: false });
        else res.json({ success: true });
    });
});

app.get('/api/diary/:date', authenticateToken, (req: any, res: Response) => {
    const userId = req.user.userId;
    const date = req.params.date; // format: YYYY-MM-DD

    db.all("SELECT * FROM diary_entries WHERE user_id = ? AND date = ? ORDER BY id DESC",
        [userId, date],
        (err, rows) => {
            if (err) res.status(500).json({ error: err.message });
            else res.json(rows);
        }
    );
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
            console.log(data);

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

// quest routes
const QUEST_RULES: Record<string, { title: string, desc: string, target: number, xp: number }> = {
    'q1': { title: 'Erster Scan', desc: 'Trage 1 Mahlzeit ein', target: 1, xp: 50 },
    'q2': { title: 'Sammler', desc: 'Trage 3 Mahlzeiten ein', target: 3, xp: 100 },
    'q3': { title: 'Energie-Tracker', desc: 'Tracke 1000 kcal', target: 1000, xp: 150 }
};

app.get('/api/quests/:date', authenticateToken, (req: any, res: Response) => {
    const userId = req.user.userId;
    const date = req.params.date;

    db.all("SELECT * FROM diary_entries WHERE user_id = ? AND date = ?", [userId, date], (err, meals: any[]) => {
        const mealCount = meals ? meals.length : 0;
        const totalKcal = meals ? meals.reduce((sum: number, m: any) => sum + m.kcal_consumed, 0) : 0;

        db.all("SELECT quest_id FROM daily_quests_claimed WHERE user_id = ? AND date = ?", [userId, date], (err, claimedRows: any[]) => {
            const claimed = claimedRows ? claimedRows.map((row: any) => row.quest_id) : [];

            const quests = Object.keys(QUEST_RULES).map(id => {
                const rule = QUEST_RULES[id]!;

                let current = (id === 'q3') ? totalKcal : mealCount;

                return {
                    id: id,
                    title: rule.title,
                    desc: rule.desc,
                    target: rule.target,
                    current: current,
                    xp: rule.xp,
                    claimed: claimed.includes(id)
                };
            });
            res.json(quests);
        });
    });
});

app.post('/api/quests/claim', authenticateToken, (req: any, res: Response) => {
    const userId = req.user.userId;
    const { date, quest_id } = req.body;
    const today = new Date().toISOString().split('T')[0];
    if (date !== today) {
        return res.status(400).json({ success: false, message: "Quests können nur am aktuellen Tag eingelöst werden!" });
    }

    const rule = QUEST_RULES[quest_id];
    if (!rule) {
        return res.status(400).json({ success: false, message: "Manipulationsversuch erkannt: Ungültige Quest." });
    }

    const xp_reward = rule.xp;

    db.run("INSERT INTO daily_quests_claimed (user_id, date, quest_id) VALUES (?, ?, ?)", [userId, date, quest_id], function(err) {
        if (err) return res.status(500).json({ success: false });

        db.get("SELECT xp, level FROM users WHERE id = ?", [userId], (err, user: any) => {
            let newXp = user.xp + xp_reward;
            let newLevel = user.level;
            let leveledUp = false;

            if (newXp >= 1000) {
                newLevel++;
                newXp -= 1000;
                leveledUp = true;
            }

            db.run("UPDATE users SET xp = ?, level = ? WHERE id = ?", [newXp, newLevel, userId], () => {
                res.json({ success: true, leveledUp: leveledUp, newLevel: newLevel });
            });
        });
    });
});