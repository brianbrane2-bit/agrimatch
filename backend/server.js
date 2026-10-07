// ============================================================
// AgriMatch Backend - USSD/SMS Agricultural Labor Marketplace
// ============================================================

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const africastalking = require('africastalking');
const locations = require('./locations');
const { workersRepo, jobsRepo, matchesRepo } = require('./db');

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const AT = africastalking({
  apiKey: process.env.AT_API_KEY,
  username: process.env.AT_USERNAME
});
const sms = AT.SMS;

// ============================================================
// HELPERS: Village validation
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

// ============================================================
// HELPER: Haversine distance (km)
// ============================================================

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
  res.send('AgriMatch backend is running.');
});

// ============================================================
// REST API FOR MOBILE APP
// ============================================================

// Get a worker's profile by phone number
app.get('/api/workers/:phone', (req, res) => {
  const phone = req.params.phone;
  const worker = workersRepo.findByPhone(phone);

  if (!worker) {
    return res.status(404).json({ error: 'Worker not found' });
  }

  res.json(worker);
});

// Register a new worker (called from the Flutter app)
app.post('/api/workers', (req, res) => {
  const { phone, name, village, skill } = req.body;

  // Validate required fields
  if (!phone || !name || !village || !skill) {
    return res.status(400).json({
      error: 'Missing required fields: phone, name, village, skill'
    });
  }

  // Validate village against the known list
  if (!isKnownVillage(village)) {
    return res.status(400).json({ error: `Unknown village: ${village}` });
  }

  workersRepo.upsert({
    phone,
    name,
    village,
    skill,
    available: true,
    registeredAt: new Date().toISOString()
  });

  console.log(`[API] Worker registered: ${name} (${phone}) from ${village}`);

  res.status(201).json({
    message: 'Worker registered',
    worker: workersRepo.findByPhone(phone)
  });
});

// Get all known villages (used by the app to populate dropdowns)
app.get('/api/villages', (req, res) => {
  const villages = Object.keys(locations).map((key) => ({
    name: key.charAt(0).toUpperCase() + key.slice(1),
    lat: locations[key].lat,
    lng: locations[key].lng
  }));
  res.json(villages);
});

// ============================================================
// USSD HANDLER
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
      response = `CON Welcome to AgriMatch
1. Register as Worker
2. Post a Job (Farmers)
3. Check My Status
4. Exit`;
      return send(res, response);
    }

    // ---------- REGISTRATION ----------
    if (input[0] === '1') {
      if (!input[1]) {
        response = 'CON Enter your full name:';
      } else if (!input[2]) {
        response = 'CON Enter your village:';
      } else if (!input[3]) {
        const village = input[2];
        if (!isKnownVillage(village)) {
          response = `END Village "${village}" is not recognized.
Try again with one of:
Bamenda, Mankon, Nkwen, Bambili,
Bambui, Bafut, Bali, Batibo, Mbengwi,
Mbouda, Wum, Kumbo, Fundong, Ndop, Nkambe.`;
          return send(res, response);
        }
        response = `CON Select your main skill:
1. Harvesting
2. Planting
3. Weeding
4. Tractor Operation`;
      } else {
        const name = input[1];
        const village = input[2];
        const skillMap = {
          '1': 'harvesting',
          '2': 'planting',
          '3': 'weeding',
          '4': 'tractor'
        };
        const skill = skillMap[input[3]] || 'general';

        // Persist to database
        workersRepo.upsert({
          phone: phoneNumber,
          name,
          village,
          skill,
          available: true,
          registeredAt: new Date().toISOString()
        });

        response = `END Registration complete, ${name}.
You are registered in ${village} as a ${skill} worker.
You will receive SMS alerts when jobs match.`;

        sendSMS(phoneNumber, `Welcome to AgriMatch, ${name}! Your profile is active.`);
      }
    }

    // ---------- POST A JOB ----------
    else if (input[0] === '2') {
      if (!input[1]) {
        response = 'CON Enter crop type (e.g., maize):';
      } else if (!input[2]) {
        response = 'CON Enter daily pay in XAF:';
      } else if (!input[3]) {
        response = 'CON Enter village location:';
      } else {
        const crop = input[1];
        const pay = parseInt(input[2], 10);
        const village = input[3];

        if (!isKnownVillage(village)) {
          response = `END Village "${village}" is not recognized.
Try again with one of:
Bamenda, Mankon, Nkwen, Bambili,
Bambui, Bafut, Bali, Batibo, Mbengwi,
Mbouda, Wum, Kumbo, Fundong, Ndop, Nkambe.`;
          return send(res, response);
        }

        if (isNaN(pay) || pay <= 0) {
          response = 'END Invalid pay amount. Please dial again.';
          return send(res, response);
        }

        const jobId = 'J' + Date.now();

        const job = {
          id: jobId,
          crop,
          pay,
          village,
          farmerPhone: phoneNumber,
          status: 'open',
          createdAt: new Date().toISOString()
        };

        jobsRepo.insert(job);

        response = `END Job posted.
Crop: ${crop}
Village: ${village}
Pay: ${pay} XAF/day
Job ID: ${jobId}
We will notify matching workers.`;

        matchWorkersToJob(job);
      }
    }

    // ---------- CHECK STATUS ----------
    else if (input[0] === '3') {
      const worker = workersRepo.findByPhone(phoneNumber);
      if (worker) {
        response = `END ${worker.name}
Village: ${worker.village}
Skill: ${worker.skill}
Status: ${worker.available ? 'Available' : 'Busy'}`;
      } else {
        response = 'END You are not registered. Dial again and choose option 1.';
      }
    }

    // ---------- EXIT ----------
    else if (input[0] === '4') {
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

// ============================================================
// HELPER: Send USSD response
// ============================================================

function send(res, message) {
  res.set('Content-Type', 'text/plain');
  res.send(message);
}

// ============================================================
// SMS HANDLER (simulated for demo)
// ============================================================

async function sendSMS(phoneNumber, message) {
  console.log('\n========== SMS ==========');
  console.log(`To:      ${phoneNumber}`);
  console.log(`Message: ${message}`);
  console.log('=========================\n');
  return;
}

// ============================================================
// MATCHING ENGINE - Haversine + weighted scoring
// ============================================================

const MAX_MATCH_DISTANCE_KM = 30;
const TOP_N_MATCHES = 5;

const WEIGHT_DISTANCE = 0.4;
const WEIGHT_SKILL = 0.4;
const WEIGHT_AVAILABILITY = 0.2;

function calculateMatchScore(worker, job, distanceKm) {
  const distanceScore = Math.max(0, 1 - (distanceKm / MAX_MATCH_DISTANCE_KM));

  const workerSkill = (worker.skill || '').toLowerCase();
  const crop = (job.crop || '').toLowerCase();
  const skillScore = (crop.includes(workerSkill) || workerSkill.includes(crop)) ? 1.0 : 0.5;

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

async function matchWorkersToJob(job) {
  console.log(`\n=== Matching workers for job ${job.id} ===`);
  console.log(`Job: ${job.crop} in ${job.village}, ${job.pay} XAF/day`);

  const jobCoords = getCoordinates(job.village);
  if (!jobCoords) {
    console.log(`Cannot match — job village "${job.village}" has no coordinates.`);
    return [];
  }

  // Read all workers from the database
  const allWorkers = workersRepo.all();
  const candidates = [];

  for (const worker of allWorkers) {
    const workerCoords = getCoordinates(worker.village);

    if (!workerCoords) {
      console.log(`  Skipping ${worker.name} — village "${worker.village}" has no coordinates.`);
      continue;
    }

    const distanceKm = haversineDistance(
      jobCoords.lat, jobCoords.lng,
      workerCoords.lat, workerCoords.lng
    );

    if (distanceKm > MAX_MATCH_DISTANCE_KM) {
      console.log(`  ${worker.name} (${worker.village}) → ${distanceKm.toFixed(1)} km [OUT OF RANGE]`);
      continue;
    }

    const score = calculateMatchScore(worker, job, distanceKm);
    candidates.push({ worker, distanceKm, score });
  }

  candidates.sort((a, b) => b.score.total - a.score.total);

  const topMatches = candidates.slice(0, TOP_N_MATCHES);

  console.log(`\n  Ranked matches (top ${TOP_N_MATCHES}):`);
  topMatches.forEach((m, i) => {
    console.log(
      `  ${i + 1}. ${m.worker.name} (${m.worker.village}) — ` +
      `${m.distanceKm.toFixed(1)} km, score ${m.score.total} ` +
      `[dist ${m.score.distanceScore}, skill ${m.score.skillScore}, avail ${m.score.availabilityScore}]`
    );
  });

  console.log(`\n  Notifying ${topMatches.length} worker(s) via SMS...`);

  for (const match of topMatches) {
    // Persist the match record to the database
    matchesRepo.insert({
      jobId: job.id,
      workerPhone: match.worker.phone,
      distanceKm: match.distanceKm,
      score: match.score.total,
      distanceScore: match.score.distanceScore,
      skillScore: match.score.skillScore,
      availabilityScore: match.score.availabilityScore
    });

    await sendSMS(
      match.worker.phone,
      `New job: ${job.crop} in ${job.village}, ${job.pay} XAF/day ` +
      `(${match.distanceKm.toFixed(1)} km away). Job ID: ${job.id}`
    );
  }

  console.log(`=== Matching complete ===\n`);
  return topMatches;
}

// ============================================================
// START SERVER
// ============================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AgriMatch backend running on http://localhost:${PORT}`);
  console.log(`Loaded ${Object.keys(locations).length} villages from locations.js`);
  console.log(`Database: agrimatch.db`);
});