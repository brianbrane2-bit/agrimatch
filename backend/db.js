// ============================================================
// SkillLink Database Layer — using sql.js (pure JavaScript)
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
      rating         REAL DEFAULT 0,
      rating_count   INTEGER DEFAULT 0,
      registered_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS service_requests (
      id             TEXT PRIMARY KEY,
      service_type   TEXT NOT NULL,
      budget         INTEGER NOT NULL,
      village        TEXT NOT NULL,
      client_phone   TEXT NOT NULL,
      status         TEXT DEFAULT 'open',
      accepted_by    TEXT,
      created_at     TEXT NOT NULL,
      accepted_at    TEXT,
      completed_at   TEXT
    );

    CREATE TABLE IF NOT EXISTS matches (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id         TEXT NOT NULL,
      worker_phone       TEXT NOT NULL,
      distance_km        REAL NOT NULL,
      score              REAL NOT NULL,
      distance_score     REAL NOT NULL,
      skill_score        REAL NOT NULL,
      availability_score REAL NOT NULL,
      notified_at        TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS voice_notes (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      worker_phone  TEXT NOT NULL,
      file_path     TEXT NOT NULL,
      duration_sec  INTEGER,
      created_at    TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_workers_village ON workers(village);
    CREATE INDEX IF NOT EXISTS idx_requests_village ON service_requests(village);
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
      rating: row.rating || 0,
      ratingCount: row.rating_count || 0,
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
      rating: row.rating || 0,
      ratingCount: row.rating_count || 0,
      registeredAt: row.registered_at
    }));
  },

  addRating(phone, newRating) {
    const worker = this.findByPhone(phone);
    if (!worker) return null;

    const currentTotal = worker.rating * worker.ratingCount;
    const newCount = worker.ratingCount + 1;
    const newAverage = (currentTotal + newRating) / newCount;

    run(
      'UPDATE workers SET rating = ?, rating_count = ? WHERE phone = ?',
      [Number(newAverage.toFixed(2)), newCount, phone]
    );

    return this.findByPhone(phone);
  }
};

// ============================================================
// SERVICE REQUESTS
// ============================================================

const requestsRepo = {
  insert(request) {
    run(
      `INSERT INTO service_requests (
         id, service_type, budget, village, client_phone, status, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        request.id,
        request.serviceType,
        request.budget,
        request.village,
        request.clientPhone,
        request.status || 'open',
        request.createdAt || new Date().toISOString()
      ]
    );
  },

  findById(id) {
    const row = get('SELECT * FROM service_requests WHERE id = ?', [id]);
    if (!row) return null;
    return {
      id: row.id,
      serviceType: row.service_type,
      budget: row.budget,
      village: row.village,
      clientPhone: row.client_phone,
      status: row.status,
      acceptedBy: row.accepted_by,
      createdAt: row.created_at,
      acceptedAt: row.accepted_at,
      completedAt: row.completed_at
    };
  },

  all() {
    const rows = all('SELECT * FROM service_requests ORDER BY created_at DESC');
    return rows.map((row) => ({
      id: row.id,
      serviceType: row.service_type,
      budget: row.budget,
      village: row.village,
      clientPhone: row.client_phone,
      status: row.status,
      acceptedBy: row.accepted_by,
      createdAt: row.created_at,
      acceptedAt: row.accepted_at,
      completedAt: row.completed_at
    }));
  },

  accept(requestId, workerPhone) {
    run(
      `UPDATE service_requests
       SET status = 'accepted', accepted_by = ?, accepted_at = ?
       WHERE id = ? AND status = 'open'`,
      [workerPhone, new Date().toISOString(), requestId]
    );
    return this.findById(requestId);
  },

  complete(requestId) {
    run(
      `UPDATE service_requests
       SET status = 'completed', completed_at = ?
       WHERE id = ?`,
      [new Date().toISOString(), requestId]
    );
    return this.findById(requestId);
  }
};

// ============================================================
// MATCHES
// ============================================================

const matchesRepo = {
  insert(match) {
    run(
      `INSERT INTO matches (
         request_id, worker_phone, distance_km, score,
         distance_score, skill_score, availability_score, notified_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        match.requestId,
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

  findByRequest(requestId) {
    return all(
      `SELECT m.*, w.name AS worker_name, w.village AS worker_village
       FROM matches m
       JOIN workers w ON w.phone = m.worker_phone
       WHERE m.request_id = ?
       ORDER BY m.score DESC`,
      [requestId]
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
  requestsRepo,
  matchesRepo,
  voiceNotesRepo
};