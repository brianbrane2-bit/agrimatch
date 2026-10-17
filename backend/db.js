// ============================================================
// AgriMatch Database Layer — using sql.js (pure JavaScript)
// ============================================================

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'agrimatch.db');

let db = null;
let SQL = null;

// ============================================================
// INITIALIZATION
// ============================================================

async function init() {
  SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS workers (
      phone          TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      village        TEXT NOT NULL,
      skill          TEXT NOT NULL,
      available      INTEGER DEFAULT 1,
      registered_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id             TEXT PRIMARY KEY,
      crop           TEXT NOT NULL,
      pay            INTEGER NOT NULL,
      village        TEXT NOT NULL,
      farmer_phone   TEXT NOT NULL,
      status         TEXT DEFAULT 'open',
      created_at     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS matches (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id        TEXT NOT NULL,
      worker_phone  TEXT NOT NULL,
      distance_km   REAL NOT NULL,
      score         REAL NOT NULL,
      distance_score REAL NOT NULL,
      skill_score    REAL NOT NULL,
      availability_score REAL NOT NULL,
      notified_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS voice_notes (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      worker_phone  TEXT NOT NULL,
      file_path     TEXT NOT NULL,
      duration_sec  INTEGER,
      created_at    TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_workers_village ON workers(village);
    CREATE INDEX IF NOT EXISTS idx_voice_notes_phone ON voice_notes(worker_phone);
  `);

  save();
  console.log('[DB] Initialized at', DB_PATH);
}

function save() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ============================================================
// HELPERS
// ============================================================

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function get(sql, params = []) {
  const rows = all(sql, params);
  return rows.length ? rows[0] : null;
}

function run(sql, params = []) {
  db.run(sql, params);
  save();
}

// ============================================================
// WORKERS
// ============================================================

const workersRepo = {
  upsert(worker) {
    run(
      `INSERT INTO workers (phone, name, village, skill, available, registered_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(phone) DO UPDATE SET
         name = excluded.name,
         village = excluded.village,
         skill = excluded.skill,
         available = excluded.available`,
      [
        worker.phone,
        worker.name,
        worker.village,
        worker.skill,
        worker.available ? 1 : 0,
        worker.registeredAt || new Date().toISOString()
      ]
    );
  },

  findByPhone(phone) {
    const row = get('SELECT * FROM workers WHERE phone = ?', [phone]);
    if (!row) return null;
    return {
      phone: row.phone,
      name: row.name,
      village: row.village,
      skill: row.skill,
      available: row.available === 1,
      registeredAt: row.registered_at
    };
  },

  all() {
    return all('SELECT * FROM workers').map((row) => ({
      phone: row.phone,
      name: row.name,
      village: row.village,
      skill: row.skill,
      available: row.available === 1,
      registeredAt: row.registered_at
    }));
  }
};

// ============================================================
// JOBS
// ============================================================

const jobsRepo = {
  insert(job) {
    run(
      `INSERT INTO jobs (id, crop, pay, village, farmer_phone, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        job.id,
        job.crop,
        job.pay,
        job.village,
        job.farmerPhone,
        job.status || 'open',
        job.createdAt || new Date().toISOString()
      ]
    );
  },

  findById(id) {
    const row = get('SELECT * FROM jobs WHERE id = ?', [id]);
    if (!row) return null;
    return {
      id: row.id,
      crop: row.crop,
      pay: row.pay,
      village: row.village,
      farmerPhone: row.farmer_phone,
      status: row.status,
      createdAt: row.created_at
    };
  },

  all() {
    return all('SELECT * FROM jobs ORDER BY created_at DESC');
  }
};

// ============================================================
// MATCHES
// ============================================================

const matchesRepo = {
  insert(match) {
    run(
      `INSERT INTO matches (
         job_id, worker_phone, distance_km, score,
         distance_score, skill_score, availability_score, notified_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        match.jobId,
        match.workerPhone,
        match.distanceKm,
        match.score,
        match.distanceScore,
        match.skillScore,
        match.availabilityScore,
        new Date().toISOString()
      ]
    );
  },

  findByJob(jobId) {
    return all(
      `SELECT m.*, w.name AS worker_name, w.village AS worker_village
       FROM matches m
       JOIN workers w ON w.phone = m.worker_phone
       WHERE m.job_id = ?
       ORDER BY m.score DESC`,
      [jobId]
    );
  }
};

// ============================================================
// VOICE NOTES
// ============================================================

const voiceNotesRepo = {
  insert(note) {
    run(
      `INSERT INTO voice_notes (worker_phone, file_path, duration_sec, created_at)
       VALUES (?, ?, ?, ?)`,
      [
        note.workerPhone,
        note.filePath,
        note.durationSec || null,
        new Date().toISOString()
      ]
    );
  },

  findByPhone(phone) {
    const row = get(
      'SELECT * FROM voice_notes WHERE worker_phone = ? ORDER BY created_at DESC LIMIT 1',
      [phone]
    );
    if (!row) return null;
    return {
      id: row.id,
      workerPhone: row.worker_phone,
      filePath: row.file_path,
      durationSec: row.duration_sec,
      createdAt: row.created_at
    };
  },

  all() {
    return all('SELECT * FROM voice_notes ORDER BY created_at DESC');
  }
};

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  init,
  workersRepo,
  jobsRepo,
  matchesRepo,
  voiceNotesRepo
};