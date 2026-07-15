const scanBtn = document.getElementById('scanBtn');
const readerDiv = document.getElementById('reader');
const resultArea = document.getElementById('resultArea');
const barcodeResult = document.getElementById('barcodeResult');
let html5QrcodeScanner;
let loggedInUserId = null;
let currentUsername = "";
let currentSelectedDate = new Date().toISOString().split('T')[0];

// add click handler to scan button
scanBtn.addEventListener('click', () => {
    scanBtn.style.display = 'none';
    readerDiv.style.display = 'block';
    resultArea.style.display = 'none';

    // init QR-Code scanner object
    html5QrcodeScanner = new Html5QrcodeScanner(
        "reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false
    );

    html5QrcodeScanner.render(onScanSuccess);
});

function onScanSuccess(decodedText) {
    html5QrcodeScanner.clear();
    readerDiv.style.display = 'none';
    scanBtn.style.display = 'block';

    resultArea.style.display = 'block';
    barcodeResult.innerText = "EAN: " + decodedText;

    sendToBackend(decodedText);
}

let dailyKcalTarget = 0;
let currentXp = 0;
let currentLevel = 0;
const maxXp = 1000;

// send to backend
async function sendToBackend(barcode) {
    try {
        barcodeResult.innerText = "EAN: " + barcode + "\nSuche in Datenbank...";
        const response = await fetch('/api/scan', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcode: barcode })
        });
        const data = await response.json();

        if(data.success) {
            barcodeResult.innerHTML = `
                        <strong style="font-size: 1.2em;">${data.name}</strong><br><br>
                        Kalorien: <strong>${data.kcal} kcal</strong> pro 100g<br><br>
                        <button class="btn" style="background-color: #4caf50;" onclick="addMeal(${data.kcal}, '${data.name.replace(/'/g, "")}')">Als Mahlzeit eintragen</button>
                    `;
        } else {
            barcodeResult.innerHTML = `<span style="color: red;">${data.message}</span>`;
        }
    } catch (error) {
        console.error("Fehler:", error);
        barcodeResult.innerText = "Verbindungsfehler zum Server.";
    }
}

async function register() {
    const user = document.getElementById('reg-username').value;
    const pass = document.getElementById('reg-password').value;
    const kcal = document.getElementById('reg-kcal').value;

    if (!user || !pass) {
        document.getElementById('reg-message').innerText = "Bitte Nickname und Passwort ausfüllen!";
        return;
    }

    const res = await fetch('/api/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass, daily_kcal: kcal })
    });
    const data = await res.json();

    if (data.success) {
        alert("🎉 Erfolgreich registriert! Du kannst dich jetzt direkt mit deinen Daten einloggen.");
        showLoginView();
        document.getElementById('login-username').value = user;
    } else {
        document.getElementById('reg-message').innerText = data.message;
    }
}

async function login() {
    const user = document.getElementById('login-username').value;
    const pass = document.getElementById('login-password').value;

    const res = await fetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass })
    });
    const data = await res.json();

    if (data.success) {
        localStorage.setItem('nutriQuestToken', data.token);
        loadGame();
    } else {
        document.getElementById('login-message').innerText = data.message;
    }
}

function logout() {
    localStorage.removeItem('nutriQuestToken');
    location.reload();
}

window.onload = () => {
    const savedToken = localStorage.getItem('nutriQuestToken');
    if (savedToken) loadGame();
};

async function loadGame() {
    const token = localStorage.getItem('nutriQuestToken');
    const response = await fetch('/api/user/me', { headers: { 'Authorization': token } });

    if (response.status === 403 || response.status === 401) {
        logout(); return;
    }

    document.getElementById('login-container').style.display = 'none';
    document.getElementById('register-container').style.display = 'none';
    document.getElementById('profile-container').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';

    const data = await response.json();
    dailyKcalTarget = data.daily_kcal;
    currentXp = data.xp;
    currentLevel = data.level;
    currentUsername = data.username;

    document.getElementById('avatarDisplay').innerHTML = `<strong style="color: #007bff; font-size: 1.1em;">${currentUsername}</strong>`;

    updateUI();
    updateDateDisplay();
    loadDiaryEntries();
}

function changeDate(daysOffset) {
    let date = new Date(currentSelectedDate);
    date.setDate(date.getDate() + daysOffset);
    currentSelectedDate = date.toISOString().split('T')[0];

    updateDateDisplay();
    loadDiaryEntries();
}

function updateDateDisplay() {
    const today = new Date().toISOString().split('T')[0];
    const displayObj = document.getElementById('dateDisplay');
    if (currentSelectedDate === today) {
        displayObj.innerText = "📅 Heute (" + currentSelectedDate + ")";
    } else {
        displayObj.innerText = "📅 " + currentSelectedDate;
    }
}

async function loadDiaryEntries() {
    const token = localStorage.getItem('nutriQuestToken');
    const res = await fetch('/api/diary/' + currentSelectedDate, {
        headers: { 'Authorization': token }
    });
    const meals = await res.json();

    const listContainer = document.getElementById('mealList');
    let totalEatenToday = 0;
    let dayTarget = dailyKcalTarget;

    if (meals.length === 0) {
        listContainer.innerHTML = "<em>Keine Einträge an diesem Tag.</em>";
    } else {
        if (meals[0].target_kcal) {
            dayTarget = meals[0].target_kcal;
        }

        let html = "<ul style='padding-left: 20px; margin: 0;'>";
        meals.forEach(meal => {
            html += `<li style="margin-bottom: 8px;">
                                <strong>${meal.food_name}</strong>: ${meal.grams}g (${meal.kcal_consumed} kcal)
                                <button onclick="deleteMeal(${meal.id})" style="background: #ff5252; color: white; border: none; border-radius: 4px; padding: 2px 6px; cursor: pointer; margin-left: 10px; font-weight: bold;">X</button>
                             </li>`;
            totalEatenToday += meal.kcal_consumed;
        });
        html += "</ul>";
        listContainer.innerHTML = html;
    }

    let remainingKcal = dayTarget - totalEatenToday;
    const kcalDisplay = document.getElementById('kcalDisplay');
    const kcalSubtext = document.getElementById('kcalSubtext');
    const kcalRing = document.getElementById('kcalRing');

    let percentage = Math.round((totalEatenToday / dayTarget) * 100);

    if (remainingKcal >= 0) {
        kcalDisplay.innerText = remainingKcal + " kcal";
        kcalDisplay.style.color = "#333";
        kcalSubtext.innerText = "übrig";

        kcalRing.style.background = `conic-gradient(#4caf50 ${percentage}%, #eee ${percentage}%)`;
    } else {
        kcalDisplay.innerText = Math.abs(remainingKcal) + " kcal";
        kcalDisplay.style.color = "#ff5252";
        kcalSubtext.innerText = "zu viel";

        kcalRing.style.background = "conic-gradient(#ff5252 100%, #eee 100%)";
    }
}

async function deleteMeal(entryId) {
    if (!confirm("Möchtest du diesen Eintrag wirklich löschen?")) return;

    const token = localStorage.getItem('nutriQuestToken');
    await fetch('/api/diary/' + entryId, {
        method: 'DELETE',
        headers: { 'Authorization': token }
    });

    loadDiaryEntries();
}

function updateUI() {
    document.getElementById('levelDisplay').innerText = "⭐ Level " + currentLevel;
    document.getElementById('xpText').innerText = currentXp + " / " + maxXp + " XP";
    document.getElementById('xpFill').style.width = (currentXp / maxXp * 100) + "%";
}

async function addMeal(kcalPer100g, foodName) {
    let grams = prompt("Wie viel Gramm hast du von '" + foodName + "' gegessen?", "100");

    if (grams !== null && !isNaN(grams) && grams > 0) {
        let consumedKcal = Math.round((kcalPer100g * grams) / 100);

        currentXp += 75;
        if (currentXp >= maxXp) {
            currentLevel++;
            currentXp -= maxXp;
            alert("🎉 LEVEL UP! Du bist jetzt Level " + currentLevel + "!");
        }

        updateUI();
        document.getElementById('resultArea').style.display = 'none';

        const token = localStorage.getItem('nutriQuestToken');

        await fetch('/api/user/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': token },
            body: JSON.stringify({ level: currentLevel, xp: currentXp, daily_kcal: dailyKcalTarget })
        });

        await fetch('/api/diary/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': token },
            body: JSON.stringify({
                date: currentSelectedDate,
                food_name: foodName,
                grams: parseInt(grams),
                kcal_consumed: consumedKcal,
                target_kcal: dailyKcalTarget
            })
        });

        loadDiaryEntries();
    } else {
        alert("Bitte gib eine gültige Grammzahl ein!");
    }
}

function showProfile() {
    // Dashboard verstecken, Profil anzeigen
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('profile-container').style.display = 'block';

    // Aktuelle Werte in die Felder eintragen
    document.getElementById('prof-username').value = currentUsername;
    document.getElementById('prof-kcal').value = dailyKcalTarget;
}

function showDashboard() {
    document.getElementById('profile-container').style.display = 'none';
    loadGame();
}

async function saveProfile() {
    const newName = document.getElementById('prof-username').value;
    const newKcal = parseInt(document.getElementById('prof-kcal').value);

    if (!newName || !newKcal || newKcal < 500) {
        alert("Bitte gib einen gültigen Nicknamen und mindestens 500 kcal ein!");
        return;
    }

    const token = localStorage.getItem('nutriQuestToken');
    const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': token },
        body: JSON.stringify({ username: newName, daily_kcal: newKcal })
    });

    const data = await res.json();
    if (data.success) {
        alert("✅ Profil erfolgreich aktualisiert!");
        showDashboard();
    } else {
        alert("❌ " + data.message);
    }
}

function showRegisterView() {
    document.getElementById('login-container').style.display = 'none';
    document.getElementById('register-container').style.display = 'block';
    document.getElementById('reg-message').innerText = "";
}

function showLoginView() {
    document.getElementById('register-container').style.display = 'none';
    document.getElementById('login-container').style.display = 'block';
    document.getElementById('login-message').innerText = "";
}