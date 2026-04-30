import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

export const mobileSessionCookie = 'mobile_session';

const MOBILE_UA_PATTERN =
  /Android|iPhone|iPad|iPod|Mobile|Windows Phone|Opera Mini|IEMobile/i;

let db;

export async function initAuthDb() {
  await fs.mkdir(path.dirname(config.authDbPath), { recursive: true });
  db = new DatabaseSync(config.authDbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);
    CREATE TABLE IF NOT EXISTS auth_events (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      username TEXT,
      event_type TEXT NOT NULL,
      ip TEXT,
      user_agent TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS api_usage_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      username TEXT,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      ip TEXT,
      user_agent TEXT,
      is_mobile INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON api_usage_logs (created_at);
    CREATE INDEX IF NOT EXISTS idx_api_usage_user ON api_usage_logs (user_id, created_at);
  `);

  if (config.mobileAuthSeedUser && config.mobileAuthSeedPassword) {
    createUserIfMissing(config.mobileAuthSeedUser, config.mobileAuthSeedPassword);
  }
}

export function mobileAuthStatus(req) {
  const required = isMobileRequest(req);
  const session = required ? getSessionFromRequest(req) : null;
  return {
    required,
    authenticated: Boolean(session),
    user: session ? { id: session.userId, username: session.username } : null,
  };
}

export function registerMobileUser(username, password) {
  validateCredentials(username, password);
  return createUserIfMissing(username, password);
}

export function loginMobileUser(username, password) {
  validateCredentials(username, password);
  const user = findUserByUsername(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw Object.assign(new Error('Invalid username or password.'), { status: 401 });
  }

  const sessionId = randomUUID();
  const now = Date.now();
  const expiresAt = now + config.mobileSessionTtlHours * 60 * 60 * 1000;
  db.prepare(
    'INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
  ).run(sessionId, user.id, expiresAt, now);

  return {
    sessionId,
    user: { id: user.id, username: user.username },
    expiresAt,
  };
}

export function writeAuthEvent(req, eventType, user) {
  if (!db || !user) return;
  const now = Date.now();
  db.prepare(
    `INSERT INTO auth_events (id, user_id, username, event_type, ip, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    user.id || null,
    user.username || null,
    eventType,
    clientIp(req),
    String(req.get?.('user-agent') || ''),
    now,
  );
}

export function writeApiUsageLog(req, res) {
  if (!db) return;
  const user = req.mobileUser || null;
  db.prepare(
    `INSERT INTO api_usage_logs (id, user_id, username, method, path, status_code, ip, user_agent, is_mobile, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    user?.id || null,
    user?.username || null,
    String(req.method || ''),
    String(req.path || ''),
    Number(res.statusCode || 0),
    clientIp(req),
    String(req.get?.('user-agent') || ''),
    isMobileRequest(req) ? 1 : 0,
    Date.now(),
  );
}

export function readDashboardOverview(hours = 24) {
  const now = Date.now();
  const from = now - Math.max(1, Number(hours || 24)) * 60 * 60 * 1000;

  const totals = db
    .prepare(
      `SELECT
         COUNT(*) as totalRequests,
         SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as errorRequests,
         SUM(CASE WHEN is_mobile = 1 THEN 1 ELSE 0 END) as mobileRequests
       FROM api_usage_logs
       WHERE created_at >= ?`,
    )
    .get(from);

  const topPaths = db
    .prepare(
      `SELECT path, COUNT(*) as hits
       FROM api_usage_logs
       WHERE created_at >= ?
       GROUP BY path
       ORDER BY hits DESC
       LIMIT 10`,
    )
    .all(from);

  const recentIps = db
    .prepare(
      `SELECT ip, COUNT(*) as hits
       FROM api_usage_logs
       WHERE created_at >= ?
       GROUP BY ip
       ORDER BY hits DESC
       LIMIT 10`,
    )
    .all(from);

  return {
    from,
    to: now,
    totalRequests: Number(totals?.totalRequests || 0),
    errorRequests: Number(totals?.errorRequests || 0),
    mobileRequests: Number(totals?.mobileRequests || 0),
    topPaths,
    recentIps,
  };
}

export function readDashboardUsers(limit = 200) {
  const safeLimit = Math.min(1000, Math.max(1, Number(limit || 200)));
  const rows = db
    .prepare(
      `SELECT
         u.id,
         u.username,
         u.created_at as createdAt,
         (
           SELECT ae.ip FROM auth_events ae
           WHERE ae.user_id = u.id AND ae.event_type = 'login'
           ORDER BY ae.created_at DESC
           LIMIT 1
         ) as lastLoginIp,
         (
           SELECT ae.created_at FROM auth_events ae
           WHERE ae.user_id = u.id AND ae.event_type = 'login'
           ORDER BY ae.created_at DESC
           LIMIT 1
         ) as lastLoginAt,
         (
           SELECT COUNT(*) FROM api_usage_logs l
           WHERE l.user_id = u.id
         ) as totalRequests
       FROM users u
       ORDER BY u.created_at DESC
       LIMIT ?`,
    )
    .all(safeLimit);
  return rows;
}

export function logoutMobileUser(req, res) {
  const sessionId = req.cookies?.[mobileSessionCookie];
  if (sessionId) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(String(sessionId));
  }
  res.clearCookie(mobileSessionCookie);
}

export function requireMobileAuth(req, res, next) {
  if (!isMobileRequest(req)) {
    return next();
  }

  const session = getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ error: 'Mobile login required.' });
  }
  req.mobileUser = { id: session.userId, username: session.username };
  return next();
}

export function isMobileRequest(req) {
  const userAgent = String(req.get('user-agent') || '');
  return MOBILE_UA_PATTERN.test(userAgent);
}

function getSessionFromRequest(req) {
  const sessionId = req.cookies?.[mobileSessionCookie];
  if (!sessionId) return null;

  const now = Date.now();
  const row = db
    .prepare(
      `SELECT s.id, s.user_id as userId, s.expires_at as expiresAt, u.username
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ? LIMIT 1`,
    )
    .get(String(sessionId));

  if (!row) return null;
  if (Number(row.expiresAt) <= now) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(String(sessionId));
    return null;
  }
  return row;
}

function clientIp(req) {
  const forwarded = String(req.get?.('x-forwarded-for') || '').trim();
  if (forwarded) return forwarded.split(',')[0].trim();
  return String(req.ip || req.socket?.remoteAddress || '');
}

function createUserIfMissing(username, password) {
  const existing = findUserByUsername(username);
  if (existing) return { id: existing.id, username: existing.username, created: false };

  const id = randomUUID();
  const now = Date.now();
  const hash = hashPassword(password);
  db.prepare(
    'INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
  ).run(id, username, hash, now);
  return { id, username, created: true };
}

function findUserByUsername(username) {
  return db
    .prepare(
      'SELECT id, username, password_hash, created_at FROM users WHERE username = ? LIMIT 1',
    )
    .get(String(username));
}

function validateCredentials(username, password) {
  const user = String(username || '').trim();
  const pass = String(password || '');
  if (!user || user.length < 3) {
    throw Object.assign(new Error('Username must be at least 3 characters.'), { status: 400 });
  }
  if (!pass || pass.length < 6) {
    throw Object.assign(new Error('Password must be at least 6 characters.'), { status: 400 });
  }
}

function hashPassword(password) {
  const salt = randomUUID().replace(/-/g, '');
  const digest = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${digest}`;
}

function verifyPassword(password, storedHash) {
  const [salt, digest] = String(storedHash || '').split(':');
  if (!salt || !digest) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}
