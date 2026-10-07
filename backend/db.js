// ============================================================
// AgriMatch Database Layer (SQLite)
// Provides persistent storage for workers, jobs, and matches.
// ============================================================

const Database = require('better-sqlite3');
const path = require('path');

// Database file lives alongside the code
const DB_PATH = path.join(__dirname, 'agrimatch.db');
const db = new Database(DB_PATH);

// Enable foreign keys and WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ============================================================
// SCHEMA
// ============================================================

db.exec(`
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
    notified_at   TEXT NOT NULL,
    FOREIGN KEY (job_id) REFERENCES jobs(id),
    FOREIGN KEY (worker_phone) REFERENCES workers(phone)
  );

  CREATE INDEX IF NOT EXISTS idx_workers_village ON workers(village);
  CREATE INDEX IF NOT EXISTS idx_jobs_village ON jobs(village);
  CREATE INDEX IF NOT EXISTS idx_matches_job ON matches(job_id);
`);

// ============================================================
// WORKER OPERATIONS
// ============================================================

const workersRepo = {
  upsert(worker) {
    const stmt = db.prepare(`
      INSERT INTO workers (phone, name, village, skill, available, registered_at)
      VALUES (@phone, @name, @village, @skill, @available, @registered_at)
      ON CONFLICT(phone) DO UPDATE SET
        name = excluded.name,
        village = excluded.village,
        skill = excluded.skill,
        available = excluded.available
    `);
    return stmt.run({
      phone: worker.phone,
      name: worker.name,
      village: worker.village,
      skill: worker.skill,
      available: worker.available ? 1 : 0,
      registered_at: worker.registeredAt || new Date().toISOString()
    });
  },

  findByPhone(phone) {
    const row = db.prepare('SELECT * FROM workers WHERE phone = ?').get(phone);
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
    const rows = db.prepare('SELECT * FROM workers').all();
    return rows.map((row) => ({
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
// JOB OPERATIONS
// ============================================================

const jobsRepo = {
  insert(job) {
    const stmt = db.prepare(`
      INSERT INTO jobs (id, crop, pay, village, farmer_phone, status, created_at)
      VALUES (@id, @crop, @pay, @village, @farmer_phone, @status, @created_at)
    `);
    return stmt.run({
      id: job.id,
      crop: job.crop,
      pay: job.pay,
      village: job.village,
      farmer_phone: job.farmerPhone,
      status: job.status || 'open',
      created_at: job.createdAt || new Date().toISOString()
    });
  },

  findById(id) {
    const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
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
    return db.prepare('SELECT * FROM jobs ORDER BY created_at DESC').all();
  }
};

// ============================================================
// MATCH OPERATIONS
// ============================================================

const matchesRepo = {
  insert(match) {
    const stmt = db.prepare(`
      INSERT INTO matches (
        job_id, worker_phone, distance_km, score,
        distance_score, skill_score, availability_score, notified_at
      )
      VALUES (
        @job_id, @worker_phone, @distance_km, @score,
        @distance_score, @skill_score, @availability_score, @notified_at
      )
    `);
    return stmt.run({
      job_id: match.jobId,
      worker_phone: match.workerPhone,
      distance_km: match.distanceKm,
      score: match.score,
      distance_score: match.distanceScore,
      skill_score: match.skillScore,
      availability_score: match.availabilityScore,
      notified_at: new Date().toISOString()
    });
  },

  findByJob(jobId) {
    return db.prepare(`
      SELECT m.*, w.name AS worker_name, w.village AS worker_village
      FROM matches m
      JOIN workers w ON w.phone = m.worker_phone
      WHERE m.job_id = ?
      ORDER BY m.score DESC
    `).all(jobId);
  }
};

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  db,
  workersRepo,
  jobsRepo,
  matchesRepo
};