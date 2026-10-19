// ============================================================
// SkillLink Backend - USSD/SMS Skilled Worker Marketplace
// ============================================================

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const africastalking = require('africastalking');
const locations = require('./locations');
const skills = require('./skills');
const db = require('./db');
const { usersRepo, requestsRepo, matchesRepo, voiceNotesRepo } = db;
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

let sms = null;
try {
  if (process.env.AT_API_KEY) {
    const AT = africastalking({
      apiKey: process.env.AT_API_KEY,
      username: process.env.AT_USERNAME
    });
    sms = AT.SMS;
    console.log('[AT] Africa\'s Talking initialized');
  } else {
    console.log('[AT] No AT_API_KEY set — SMS will be simulated');
  }
} catch (err) {
  console.error('[AT] Africa\'s Talking init failed:', err.message);
  sms = null;
}

// ============================================================
// HELPERS
// ============================================================

function normalizeVillage(name) {
  return String(name).trim().toLowerCase();
}

function isKnownVillage(name) {
  return Object.prototype.hasOwnProperty.call(locations, normalizeVillage(name));
}

function getCoordinates(village) {
  return locations[normalizeVillage(village)] || null;
}

function normalizePhone(raw) {
  let phone = String(raw || '').trim();
  phone = phone.replace(/^=/, '+');
  if (phone.startsWith(' ')) {
    phone = '+' + phone.trim();
  }
  return phone;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (deg) => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ============================================================
// HEALTH CHECK
// ============================================================

app.get('/', (req, res) => {
  res.send('SkillLink backend is running.');
});

// ============================================================
// AUTHENTICATION & USER API
// ============================================================

// Register (Worker or Client)
app.post('/api/register', (req, res) => {
  const { name, role, pin, village, skill } = req.body;
  const phone = normalizePhone(req.body.phone);

  if (!phone || !name || !role || !pin) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (pin.length !== 4) {
    return res.status(400).json({ error: 'PIN must be 4 digits' });
  }

  if (role === 'worker') {
    if (!village || !skill || !isKnownVillage(village) || !skills.isValidTradeKey(skill)) {
      return res.status(400).json({ error: 'Invalid village or trade for worker' });
    }
  }

  usersRepo.upsert({
    phone,
    name,
    role,
    pin,
    village: role === 'worker' ? village : null,
    skill: role === 'worker' ? skill : null,
    available: true,
    registeredAt: new Date().toISOString()
  });

  console.log(`[API] User registered: ${name} (${phone}) as ${role}`);

  res.status(201).json({
    message: 'User registered',
    user: usersRepo.findByPhone(phone)
  });
});

// Login
app.post('/api/login', (req, res) => {
  const { pin } = req.body;
  const phone = normalizePhone(req.body.phone);

  const user = usersRepo.findByPhone(phone);

  if (!user || user.pin !== pin) {
    return res.status(401).json({ error: 'Invalid phone number or PIN' });
  }

  res.json({ message: 'Login successful', user });
});

// Get all available workers (for Clients to browse)
app.get('/api/workers', (req, res) => {
  const all = usersRepo.allWorkers();
  // Only show available workers to clients
  const available = all.filter(w => w.available === true);
  res.json(available);
});

// Toggle availability
app.post('/api/workers/*phone/toggle', (req, res) => {
  const wildcard = req.params.phone;
  const rawPhone = Array.isArray(wildcard) ? wildcard.join('/') : wildcard;
  const decoded = decodeURIComponent(rawPhone);
  const phone = normalizePhone(decoded);

  const user = usersRepo.findByPhone(phone);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const newStatus = !user.available;
  
  // Update the user's availability
  usersRepo.upsert({
    ...user,
    available: newStatus
  });

  console.log(`[API] ${user.name} toggled availability → ${newStatus ? 'Available' : 'Busy'}`);
  res.json({ 
    message: 'Availability updated', 
    available: newStatus, 
    user: usersRepo.findByPhone(phone) 
  });
});

// Get one worker's profile
app.get('/api/workers/*phone', (req, res) => {
  const wildcard = req.params.phone;
  const rawPhone = Array.isArray(wildcard) ? wildcard.join('/') : wildcard;
  const decoded = decodeURIComponent(rawPhone);
  const phone = normalizePhone(decoded);

  const worker = usersRepo.findByPhone(phone);
  if (!worker) {
    return res.status(404).json({ error: 'Worker not found' });
  }
  res.json(worker);
});

// Rate a worker
app.post('/api/workers/*phone/rate', (req, res) => {
  const wildcard = req.params.phone;
  const rawPhone = Array.isArray(wildcard) ? wildcard[0] : wildcard;
  const decoded = decodeURIComponent(rawPhone);
  const phone = normalizePhone(decoded);

  const rating = parseInt(req.body.rating, 10);
  if (isNaN(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5' });
  }

  const updated = usersRepo.addRating(phone, rating);
  if (!updated) {
    return res.status(404).json({ error: 'Worker not found' });
  }

  console.log(`[API] Rating added: ${phone} → ${rating} stars (new avg: ${updated.rating})`);
  res.json({ message: 'Rating recorded', worker: updated });
});

// ============================================================
// REST API (Trades, Villages, Requests)
// ============================================================

app.get('/api/trades', (req, res) => {
  const categories = Object.entries(skills.CATEGORIES).map(([key, cat]) => ({
    key,
    label: cat.label,
    trades: skills.getTradesByCategory(key).map((t) => ({
      key: t.key,
      label: t.label
    }))
  }));
  res.json(categories);
});

app.get('/api/villages', (req, res) => {
  const villages = Object.keys(locations).map((key) => ({
    name: key.charAt(0).toUpperCase() + key.slice(1),
    lat: locations[key].lat,
    lng: locations[key].lng
  }));
  res.json(villages);
});

app.get('/api/service-requests', (req, res) => {
  res.json(requestsRepo.all());
});

app.get('/api/service-requests/by-client/*phone', (req, res) => {
  const wildcard = req.params.phone;
  const rawPhone = Array.isArray(wildcard) ? wildcard.join('/') : wildcard;
  const decoded = decodeURIComponent(rawPhone);
  const phone = normalizePhone(decoded);

  const all = requestsRepo.all();
  const clientRequests = all.filter(r => r.clientPhone === phone);
  res.json(clientRequests);
});

// ============================================================
// VOICE NOTES
// ============================================================

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const wildcard = req.params.phone;
    const rawPhone = Array.isArray(wildcard) ? wildcard.join('') : (wildcard || 'unknown');
    const digits = rawPhone.replace(/[^0-9]/g, '') || 'unknown';
    const timestamp = Date.now();
    const ext = path.extname(file.originalname) || '.m4a';
    cb(null, `voice_${digits}_${timestamp}${ext}`);
  }
});

const upload = multer({ storage });

app.post('/api/voice-notes/*phone', upload.single('audio'), (req, res) => {
  try {
    const wildcard = req.params.phone;
    const rawPhone = Array.isArray(wildcard) ? wildcard.join('/') : wildcard;
    const decoded = decodeURIComponent(rawPhone);
    const phone = normalizePhone(decoded);

    if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });

    const user = usersRepo.findByPhone(phone);
    if (!user) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: `User not found: ${phone}` });
    }

    voiceNotesRepo.insert({
      workerPhone: phone,
      filePath: req.file.filename,
      durationSec: req.body.duration ? parseInt(req.body.duration, 10) : null
    });

    res.status(201).json({ message: 'Voice note uploaded', file: req.file.filename });
  } catch (err) {
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.get('/api/voice-notes/*phone', (req, res) => {
  const wildcard = req.params.phone;
  const rawPhone = Array.isArray(wildcard) ? wildcard.join('/') : wildcard;
  const decoded = decodeURIComponent(rawPhone);
  const phone = normalizePhone(decoded);

  const note = voiceNotesRepo.findByPhone(phone);
  if (!note) return res.status(404).json({ error: 'No voice note found' });
  res.json(note);
});

app.get('/api/voice-notes/audio/:filename', (req, res) => {
  const filename = req.params.filename;
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filePath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(filePath);
});

// ============================================================
// USSD HANDLER (Kept for backward compatibility)
// ============================================================

app.post('/ussd', async (req, res) => {
  const { text, phoneNumber } = req.body;
  const input = text ? text.split('*') : [''];
  let response = '';

  try {
    if (text === '') {
      response = `CON Welcome to SkillLink
1. Register as Worker
2. Request a Service
3. My Requests
4. Check My Status
5. Exit`;
      return send(res, response);
    }

    if (input[0] === '1') {
      if (!input[1]) {
        response = 'CON Enter your full name:';
      } else if (!input[2]) {
        response = 'CON Enter your village:';
      } else if (!input[3]) {
        const village = input[2];
        if (!isKnownVillage(village)) {
          response = `END Village "${village}" is not recognized.`;
          return send(res, response);
        }
        response = `CON Select your category:\n1. Construction\n2. Beauty\n3. Repair\n4. Home Services\n5. Agriculture\n6. Other`;
      } else if (!input[4]) {
        const cat = skills.getCategoryByCode(input[3]);
        if (!cat) { response = 'END Invalid category.'; return send(res, response); }
        const trades = skills.getTradesByCategory(cat.key);
        let menu = `CON Select your trade (${cat.label}):\n`;
        trades.forEach((t, i) => { menu += `${i + 1}. ${t.label}\n`; });
        response = menu.trim();
      } else {
        const name = input[1];
        const village = input[2];
        const cat = skills.getCategoryByCode(input[3]);
        const trade = skills.getTradeByNumberInCategory(cat.key, input[4]);

        if (!trade) { response = 'END Invalid trade.'; return send(res, response); }

        // Note: USSD users get a default PIN of 1234
        usersRepo.upsert({
          phone: phoneNumber,
          name,
          role: 'worker',
          pin: '1234',
          village,
          skill: trade.key,
          available: true,
          registeredAt: new Date().toISOString()
        });

        response = `END Registration complete, ${name}.\nYou are registered as a ${trade.label}.\nYour login PIN is 1234.`;
        sendSMS(phoneNumber, `Welcome to SkillLink, ${name}! Your PIN is 1234.`);
      }
    }
    
    else if (input[0] === '2') {
        // (Simplified for brevity - you can copy the full logic from your previous file if you use USSD heavily)
        response = 'END Use the mobile app or admin dashboard to post requests for now.';
    }
    
    else if (input[0] === '4') {
      const user = usersRepo.findByPhone(phoneNumber);
      if (user) {
        response = `END ${user.name}\nVillage: ${user.village}\nRole: ${user.role}`;
      } else {
        response = 'END You are not registered. Dial 1.';
      }
    }
    
    else {
      response = 'END Goodbye.';
    }

    send(res, response);
  } catch (error) {
    console.error('USSD ERROR:', error);
    send(res, 'END Something went wrong.');
  }
});

function send(res, message) {
  res.set('Content-Type', 'text/plain');
  res.send(message);
}

async function sendSMS(phoneNumber, message) {
  console.log(`\n===== SMS =====\nTo: ${phoneNumber}\nMessage: ${message}\n===============\n`);
}

// ============================================================
// MATCHING ENGINE (For Clients posting requests)
// ============================================================

const MAX_MATCH_DISTANCE_KM = 30;
const TOP_N_MATCHES = 5;
const WEIGHT_DISTANCE = 0.4;
const WEIGHT_SKILL = 0.4;
const WEIGHT_AVAILABILITY = 0.2;

function calculateMatchScore(worker, request, distanceKm) {
  const distanceScore = Math.max(0, 1 - (distanceKm / MAX_MATCH_DISTANCE_KM));
  const skillScore = worker.skill === request.serviceType ? 1.0 : 0.5;
  const availabilityScore = worker.available ? 1.0 : 0.0;
  const total = (WEIGHT_DISTANCE * distanceScore) + (WEIGHT_SKILL * skillScore) + (WEIGHT_AVAILABILITY * availabilityScore);
  return { total: Number(total.toFixed(3)), distanceScore, skillScore, availabilityScore };
}

async function matchWorkersToRequest(request) {
  const requestCoords = getCoordinates(request.village);
  if (!requestCoords) return [];

  const allWorkers = usersRepo.allWorkers();
  const candidates = [];

  for (const worker of allWorkers) {
    const workerCoords = getCoordinates(worker.village);
    if (!workerCoords) continue;

    const distanceKm = haversineDistance(requestCoords.lat, requestCoords.lng, workerCoords.lat, workerCoords.lng);
    if (distanceKm > MAX_MATCH_DISTANCE_KM) continue;

    const score = calculateMatchScore(worker, request, distanceKm);
    candidates.push({ worker, distanceKm, score });
  }

  candidates.sort((a, b) => b.score.total - a.score.total);
  const topMatches = candidates.slice(0, TOP_N_MATCHES);

  for (const match of topMatches) {
    matchesRepo.insert({
      requestId: request.id,
      workerPhone: match.worker.phone,
      distanceKm: match.distanceKm,
      score: match.score.total,
      distanceScore: match.score.distanceScore,
      skillScore: match.score.skillScore,
      availabilityScore: match.score.availabilityScore
    });
    await sendSMS(match.worker.phone, `New job: ${request.serviceType} in ${request.village}. Log into the app to view.`);
  }
  return topMatches;
}

// ============================================================
// ADMIN DASHBOARD
// ============================================================

app.get('/admin', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SkillLink Admin Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-900 text-slate-200 p-8">
  <div class="max-w-7xl mx-auto">
    <h1 class="text-4xl font-bold mb-8">SkillLink Admin</h1>
    
    <div class="bg-slate-800 rounded-lg p-6 mb-8">
      <h2 class="text-xl font-bold mb-4 text-white">Workers</h2>
      <table class="w-full text-left">
        <thead class="text-slate-400 border-b border-slate-600"><tr><th class="p-2">Name</th><th class="p-2">Phone</th><th class="p-2">Village</th><th class="p-2">Trade</th><th class="p-2">Rating</th></tr></thead>
        <tbody id="workersTable"></tbody>
      </table>
    </div>

    <div class="bg-slate-800 rounded-lg p-6">
      <h2 class="text-xl font-bold mb-4 text-white">Clients</h2>
      <table class="w-full text-left">
        <thead class="text-slate-400 border-b border-slate-600"><tr><th class="p-2">Name</th><th class="p-2">Phone</th></tr></thead>
        <tbody id="clientsTable"></tbody>
      </table>
    </div>
  </div>

  <script>
    async function load() {
      const res = await fetch('/api/workers');
      const workers = await res.json();
      document.getElementById('workersTable').innerHTML = workers.map(w => \`
        <tr class="border-b border-slate-700">
          <td class="p-2">\${w.name}</td><td class="p-2">\${w.phone}</td>
          <td class="p-2">\${w.village}</td><td class="p-2">\${w.skill}</td>
          <td class="p-2 text-yellow-400">\${w.rating} (\${w.ratingCount})</td>
        </tr>
      \`).join('');
    }
    load();
  </script>
</body>
</html>
  `);
});

app.get('/api/workers-all', (req, res) => {
  res.json(usersRepo.allWorkers());
});

app.get('/api/matches-recent', (req, res) => {
  res.json([]);
});

// ============================================================
// START SERVER
// ============================================================

const PORT = process.env.PORT || 3000;

db.init().then(() => {
  app.listen(PORT, () => {
    console.log(`SkillLink backend running on http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('DB init failed:', err);
  process.exit(1);
});