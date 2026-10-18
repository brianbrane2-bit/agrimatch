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
const { workersRepo, requestsRepo, matchesRepo, voiceNotesRepo } = db;
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
// REST API
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

app.get('/api/workers/*phone', (req, res) => {
  const wildcard = req.params.phone;
  const rawPhone = Array.isArray(wildcard) ? wildcard.join('/') : wildcard;
  const decoded = decodeURIComponent(rawPhone);
  const phone = normalizePhone(decoded);

  const worker = workersRepo.findByPhone(phone);
  if (!worker) {
    return res.status(404).json({ error: 'Worker not found' });
  }
  res.json(worker);
});

app.post('/api/workers', (req, res) => {
  const name = req.body.name;
  const village = req.body.village;
  const skillKey = req.body.skill;
  const phone = normalizePhone(req.body.phone);

  if (!phone || !name || !village || !skillKey) {
    return res.status(400).json({
      error: 'Missing required fields: phone, name, village, skill'
    });
  }

  if (!isKnownVillage(village)) {
    return res.status(400).json({ error: `Unknown village: ${village}` });
  }

  if (!skills.isValidTradeKey(skillKey)) {
    return res.status(400).json({ error: `Unknown skill: ${skillKey}` });
  }

  workersRepo.upsert({
    phone,
    name,
    village,
    skill: skillKey,
    available: true,
    registeredAt: new Date().toISOString()
  });

  const trade = skills.getTradeByKey(skillKey);
  console.log(`[API] Worker registered: ${name} (${phone}) from ${village} as ${trade.label}`);

  res.status(201).json({
    message: 'Worker registered',
    worker: workersRepo.findByPhone(phone)
  });
});

app.post('/api/workers/*phone/rate', (req, res) => {
  const wildcard = req.params.phone;
  const rawPhone = Array.isArray(wildcard) ? wildcard[0] : wildcard;
  const decoded = decodeURIComponent(rawPhone);
  const phone = normalizePhone(decoded);

  const rating = parseInt(req.body.rating, 10);
  if (isNaN(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5' });
  }

  const updated = workersRepo.addRating(phone, rating);
  if (!updated) {
    return res.status(404).json({ error: 'Worker not found' });
  }

  console.log(`[API] Rating added: ${phone} → ${rating} stars (new avg: ${updated.rating})`);
  res.json({ message: 'Rating recorded', worker: updated });
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

app.post('/api/service-requests/*id/accept', (req, res) => {
  const wildcard = req.params.id;
  const requestId = Array.isArray(wildcard) ? wildcard[0] : wildcard;
  const workerPhone = normalizePhone(req.body.workerPhone);

  if (!workerPhone) {
    return res.status(400).json({ error: 'Missing workerPhone' });
  }

  const updated = requestsRepo.accept(requestId, workerPhone);
  if (!updated) {
    return res.status(404).json({ error: 'Request not found' });
  }

  console.log(`[API] Request ${requestId} accepted by ${workerPhone}`);
  res.json({ message: 'Request accepted', request: updated });
});

app.post('/api/service-requests/*id/complete', (req, res) => {
  const wildcard = req.params.id;
  const requestId = Array.isArray(wildcard) ? wildcard[0] : wildcard;

  const updated = requestsRepo.complete(requestId);
  if (!updated) {
    return res.status(404).json({ error: 'Request not found' });
  }

  console.log(`[API] Request ${requestId} completed`);
  res.json({ message: 'Request completed', request: updated });
});

app.get('/api/service-requests/*id/matches', (req, res) => {
  const wildcard = req.params.id;
  const requestId = Array.isArray(wildcard) ? wildcard[0] : wildcard;

  const matches = matchesRepo.findByRequest(requestId);
  res.json(matches);
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

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/wav',
      'audio/x-m4a', 'audio/aac', 'audio/3gpp', 'audio/webm',
      'application/octet-stream'
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported audio format: ${file.mimetype}`));
    }
  }
});

app.post('/api/voice-notes/*phone', upload.single('audio'), (req, res) => {
  try {
    const wildcard = req.params.phone;
    const rawPhone = Array.isArray(wildcard) ? wildcard.join('/') : wildcard;
    const decoded = decodeURIComponent(rawPhone);
    const phone = normalizePhone(decoded);

    console.log(`[API] Voice note upload attempt for phone: ${phone}`);

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    const worker = workersRepo.findByPhone(phone);
    if (!worker) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: `Worker not found: ${phone}` });
    }

    const durationSec = req.body.duration ? parseInt(req.body.duration, 10) : null;
    voiceNotesRepo.insert({
      workerPhone: phone,
      filePath: req.file.filename,
      durationSec
    });

    console.log(`[API] Voice note uploaded: ${worker.name} (${phone}) → ${req.file.filename}`);

    res.status(201).json({
      message: 'Voice note uploaded',
      file: req.file.filename,
      size: req.file.size
    });
  } catch (err) {
    console.error('[API] Voice note upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.get('/api/voice-notes/*phone', (req, res) => {
  const wildcard = req.params.phone;
  const rawPhone = Array.isArray(wildcard) ? wildcard.join('/') : wildcard;
  const decoded = decodeURIComponent(rawPhone);
  const phone = normalizePhone(decoded);

  const note = voiceNotesRepo.findByPhone(phone);
  if (!note) {
    return res.status(404).json({ error: 'No voice note found' });
  }
  res.json(note);
});

app.get('/api/voice-notes/audio/:filename', (req, res) => {
  const filename = req.params.filename;
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filePath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.sendFile(filePath);
});

// ============================================================
// USSD HANDLER — 5 options with My Requests
// ============================================================

app.post('/ussd', async (req, res) => {
  const { text, phoneNumber } = req.body;

  console.log('--- USSD Request ---');
  console.log('Phone:', phoneNumber);
  console.log('Text:', text || '(empty)');

  const input = text ? text.split('*') : [''];

  let response = '';

  try {
    // ---------- MAIN MENU ----------
    if (text === '') {
      response = `CON Welcome to SkillLink
1. Register as Worker
2. Request a Service
3. My Requests
4. Check My Status
5. Exit`;
      return send(res, response);
    }

    // ---------- 1. REGISTER ----------
    if (input[0] === '1') {
      if (!input[1]) {
        response = 'CON Enter your full name:';
      } else if (!input[2]) {
        response = 'CON Enter your village:';
      } else if (!input[3]) {
        const village = input[2];
        if (!isKnownVillage(village)) {
          response = `END Village "${village}" is not recognized.
Try one of:
Bamenda, Mankon, Nkwen, Bambili,
Bambui, Bafut, Bali, Batibo, Mbengwi,
Mbouda, Wum, Kumbo, Fundong, Ndop, Nkambe.`;
          return send(res, response);
        }
        response = `CON Select your category:
1. Construction
2. Beauty
3. Repair
4. Home Services
5. Agriculture
6. Other`;
      } else if (!input[4]) {
        const cat = skills.getCategoryByCode(input[3]);
        if (!cat) {
          response = 'END Invalid category. Please dial again.';
          return send(res, response);
        }
        const trades = skills.getTradesByCategory(cat.key);
        let menu = `CON Select your trade (${cat.label}):\n`;
        trades.forEach((t, i) => {
          menu += `${i + 1}. ${t.label}\n`;
        });
        response = menu.trim();
      } else {
        const name = input[1];
        const village = input[2];
        const catCode = input[3];
        const tradeNumber = input[4];

        const cat = skills.getCategoryByCode(catCode);
        if (!cat) {
          response = 'END Invalid category. Please dial again.';
          return send(res, response);
        }

        const trade = skills.getTradeByNumberInCategory(cat.key, tradeNumber);
        if (!trade) {
          response = 'END Invalid trade. Please dial again.';
          return send(res, response);
        }

        workersRepo.upsert({
          phone: phoneNumber,
          name,
          village,
          skill: trade.key,
          available: true,
          registeredAt: new Date().toISOString()
        });

        response = `END Registration complete, ${name}.
You are registered in ${village}
as a ${trade.label}.
You will receive SMS alerts when clients need you.`;

        sendSMS(phoneNumber, `Welcome to SkillLink, ${name}! You are registered as a ${trade.label}.`);
      }
    }

    // ---------- 2. REQUEST A SERVICE ----------
    else if (input[0] === '2') {
      if (!input[1]) {
        response = `CON What type of service do you need?
1. Construction
2. Beauty
3. Repair
4. Home Services
5. Agriculture
6. Other`;
      } else if (!input[2]) {
        const cat = skills.getCategoryByCode(input[1]);
        if (!cat) {
          response = 'END Invalid category. Please dial again.';
          return send(res, response);
        }
        const trades = skills.getTradesByCategory(cat.key);
        let menu = `CON Select the service (${cat.label}):\n`;
        trades.forEach((t, i) => {
          menu += `${i + 1}. ${t.label}\n`;
        });
        response = menu.trim();
      } else if (!input[3]) {
        response = 'CON Enter your village:';
      } else if (!input[4]) {
        response = 'CON Enter your budget in XAF (e.g., 5000):';
      } else {
        const catCode = input[1];
        const tradeNumber = input[2];
        const village = input[3];
        const budget = parseInt(input[4], 10);

        const cat = skills.getCategoryByCode(catCode);
        if (!cat) {
          response = 'END Invalid category. Please dial again.';
          return send(res, response);
        }

        const trade = skills.getTradeByNumberInCategory(cat.key, tradeNumber);
        if (!trade) {
          response = 'END Invalid service. Please dial again.';
          return send(res, response);
        }

        if (!isKnownVillage(village)) {
          response = `END Village "${village}" is not recognized. Please dial again.`;
          return send(res, response);
        }

        if (isNaN(budget) || budget <= 0) {
          response = 'END Invalid budget. Please dial again.';
          return send(res, response);
        }

        const requestId = 'R' + Date.now();

        const request = {
          id: requestId,
          serviceType: trade.key,
          budget,
          village,
          clientPhone: phoneNumber,
          status: 'open',
          createdAt: new Date().toISOString()
        };

        requestsRepo.insert(request);

        response = `END Request posted.
Service: ${trade.label}
Village: ${village}
Budget: ${budget} XAF
ID: ${requestId}
We will notify matching workers.`;

        matchWorkersToRequest(request);
      }
    }

    // ---------- 3. MY REQUESTS ----------
    else if (input[0] === '3') {
      const all = requestsRepo.all();
      const myRequests = all.filter(r => r.clientPhone === phoneNumber);

      if (!input[1]) {
        if (myRequests.length === 0) {
          response = 'END You have no requests yet. Dial 2 to post one.';
          return send(res, response);
        }
        let menu = `CON Your requests:\n`;
        myRequests.slice(0, 8).forEach((r, i) => {
          const trade = skills.getTradeByKey(r.serviceType);
          const tradeLabel = trade ? trade.label : r.serviceType;
          menu += `${i + 1}. ${r.id.slice(-6)} - ${tradeLabel} - ${r.status}\n`;
        });
        menu += '0. Back';
        response = menu.trim();
      } else if (!input[2]) {
        if (input[1] === '0') {
          response = `CON Welcome to SkillLink
1. Register as Worker
2. Request a Service
3. My Requests
4. Check My Status
5. Exit`;
          return send(res, response);
        }
        const idx = parseInt(input[1], 10) - 1;
        if (idx < 0 || idx >= myRequests.length) {
          response = 'END Invalid selection.';
          return send(res, response);
        }
        const req = myRequests[idx];
        const matches = matchesRepo.findByRequest(req.id);
        const trade = skills.getTradeByKey(req.serviceType);
        const tradeLabel = trade ? trade.label : req.serviceType;

        response = `CON Request ${req.id.slice(-6)}
${tradeLabel} - ${req.village}
Status: ${req.status}
1. View Matches (${matches.length})
2. Complete
0. Back`;
      } else if (input[2] === '1') {
        const idx = parseInt(input[1], 10) - 1;
        const req = myRequests[idx];
        if (!req) {
          response = 'END Request not found.';
          return send(res, response);
        }
        const matches = matchesRepo.findByRequest(req.id);

        if (!input[3]) {
          if (matches.length === 0) {
            response = 'END No matches found for this request.';
            return send(res, response);
          }
          let menu = `CON Matches for ${req.id.slice(-6)}:\n`;
          matches.slice(0, 8).forEach((m, i) => {
            menu += `${i + 1}. ${m.worker_name} (${m.worker_village})\n`;
          });
          menu += '0. Back';
          response = menu.trim();
        } else {
          if (input[3] === '0') {
            const matches2 = matchesRepo.findByRequest(req.id);
            const trade = skills.getTradeByKey(req.serviceType);
            const tradeLabel = trade ? trade.label : req.serviceType;
            response = `CON Request ${req.id.slice(-6)}
${tradeLabel} - ${req.village}
Status: ${req.status}
1. View Matches (${matches2.length})
2. Complete
0. Back`;
          } else {
            const matchIdx = parseInt(input[3], 10) - 1;
            if (matchIdx < 0 || matchIdx >= matches.length) {
              response = 'END Invalid selection.';
              return send(res, response);
            }
            const match = matches[matchIdx];
            requestsRepo.accept(req.id, match.worker_phone);
            const trade = skills.getTradeByKey(req.serviceType);
            const tradeLabel = trade ? trade.label : req.serviceType;

            response = `END You selected ${match.worker_name}.
Phone: ${match.worker_phone}
Service: ${tradeLabel}
Request ${req.id.slice(-6)} is now assigned.`;

            sendSMS(match.worker_phone,
              `You have been selected for a ${tradeLabel} job in ${req.village}. ` +
              `Contact the client at ${phoneNumber}.`);
          }
        }
      } else if (input[2] === '2') {
        const idx = parseInt(input[1], 10) - 1;
        const req = myRequests[idx];
        if (!req) {
          response = 'END Request not found.';
          return send(res, response);
        }
        requestsRepo.complete(req.id);
        response = `END Request ${req.id.slice(-6)} marked as completed. Thank you!`;
      } else if (input[2] === '0') {
        let menu = `CON Your requests:\n`;
        myRequests.slice(0, 8).forEach((r, i) => {
          const trade = skills.getTradeByKey(r.serviceType);
          const tradeLabel = trade ? trade.label : r.serviceType;
          menu += `${i + 1}. ${r.id.slice(-6)} - ${tradeLabel} - ${r.status}\n`;
        });
        menu += '0. Back';
        response = menu.trim();
      } else {
        response = 'END Invalid selection.';
      }
    }

    // ---------- 4. CHECK MY STATUS ----------
    else if (input[0] === '4') {
      const worker = workersRepo.findByPhone(phoneNumber);
      if (worker) {
        const trade = skills.getTradeByKey(worker.skill);
        const tradeLabel = trade ? trade.label : worker.skill;
        const ratingText = worker.ratingCount > 0
          ? `${worker.rating} ⭐ (${worker.ratingCount})`
          : 'No ratings yet';
        response = `END ${worker.name}
Village: ${worker.village}
Trade: ${tradeLabel}
Rating: ${ratingText}
Status: ${worker.available ? 'Available' : 'Busy'}`;
      } else {
        response = 'END You are not registered. Dial 1 to register.';
      }
    }

    // ---------- 5. EXIT ----------
    else if (input[0] === '5') {
      response = 'END Goodbye. Dial *384*13053# to return.';
    }

    else {
      response = 'END Invalid choice. Please try again.';
    }

    send(res, response);

  } catch (error) {
    console.error('USSD ERROR:', error);
    send(res, 'END Something went wrong. Please try again.');
  }
});

function send(res, message) {
  res.set('Content-Type', 'text/plain');
  res.send(message);
}

async function sendSMS(phoneNumber, message) {
  console.log('\n========== SMS ==========');
  console.log(`To:      ${phoneNumber}`);
  console.log(`Message: ${message}`);
  console.log('=========================\n');
  return;
}

// ============================================================
// MATCHING ENGINE
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
  const total =
    (WEIGHT_DISTANCE * distanceScore) +
    (WEIGHT_SKILL * skillScore) +
    (WEIGHT_AVAILABILITY * availabilityScore);
  return {
    total: Number(total.toFixed(3)),
    distanceScore: Number(distanceScore.toFixed(3)),
    skillScore,
    availabilityScore
  };
}

async function matchWorkersToRequest(request) {
  const trade = skills.getTradeByKey(request.serviceType);
  const tradeLabel = trade ? trade.label : request.serviceType;

  console.log(`\n=== Matching workers for request ${request.id} ===`);
  console.log(`Request: ${tradeLabel} in ${request.village}, ${request.budget} XAF`);

  const requestCoords = getCoordinates(request.village);
  if (!requestCoords) {
    console.log(`Cannot match — village "${request.village}" has no coordinates.`);
    return [];
  }

  const allWorkers = workersRepo.all();
  const candidates = [];

  for (const worker of allWorkers) {
    const workerCoords = getCoordinates(worker.village);
    if (!workerCoords) continue;

    const distanceKm = haversineDistance(
      requestCoords.lat, requestCoords.lng,
      workerCoords.lat, workerCoords.lng
    );

    if (distanceKm > MAX_MATCH_DISTANCE_KM) {
      console.log(`  ${worker.name} (${worker.village}) → ${distanceKm.toFixed(1)} km [OUT OF RANGE]`);
      continue;
    }

    const score = calculateMatchScore(worker, request, distanceKm);
    candidates.push({ worker, distanceKm, score });
  }

  candidates.sort((a, b) => b.score.total - a.score.total);
  const topMatches = candidates.slice(0, TOP_N_MATCHES);

  console.log(`\n  Ranked matches (top ${TOP_N_MATCHES}):`);
  topMatches.forEach((m, i) => {
    console.log(
      `  ${i + 1}. ${m.worker.name} (${m.worker.village}) — ` +
      `${m.distanceKm.toFixed(1)} km, score ${m.score.total}`
    );
  });

  console.log(`\n  Notifying ${topMatches.length} worker(s)...`);

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

    await sendSMS(
      match.worker.phone,
      `New request: ${tradeLabel} in ${request.village}, ${request.budget} XAF. ` +
      `(${match.distanceKm.toFixed(1)} km away). ID: ${request.id}`
    );
  }

  console.log(`=== Matching complete ===\n`);
  return topMatches;
}

// ============================================================
// START SERVER
// ============================================================

const PORT = process.env.PORT || 3000;

db.init().then(() => {
  app.listen(PORT, () => {
    console.log(`SkillLink backend running on http://localhost:${PORT}`);
    console.log(`Loaded ${Object.keys(locations).length} villages from locations.js`);
    console.log(`Loaded ${skills.TRADES.length} trades from skills.js`);
    console.log(`Database: agrimatch.db`);
  });
}).catch((err) => {
  console.error('DB init failed:', err);
  process.exit(1);
});