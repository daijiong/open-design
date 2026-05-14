import type { Express, Request, Response, NextFunction } from 'express';
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import {
  claimUnownedProjects,
  countActiveAdmins,
  countUsers,
  deleteExpiredSessions,
  deleteSessionByTokenHash,
  deleteSessionsForUser,
  getSessionByTokenHash,
  getUser,
  getUserByEmail,
  insertSession,
  insertUser,
  listUsers,
  touchSession,
  updateUser,
} from './db.js';

const SESSION_COOKIE = 'od_session';
const SESSION_DAYS = 7;
const REMEMBER_SESSION_DAYS = 30;
const PASSWORD_MIN_LENGTH = 8;

type Db = any;
type SendApiError = (
  res: Response,
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) => Response | void;

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'member';
  status: 'active' | 'disabled' | 'pending';
  createdAt: number;
  updatedAt: number;
  lastLoginAt?: number;
}

export interface AuthDeps {
  currentUser: (req: Request) => CurrentUser | null;
  requireAuth: (req: Request, res: Response, next: NextFunction) => void;
  requireAdmin: (req: Request, res: Response, next: NextFunction) => void;
  requireProjectAccess: (req: Request, res: Response, projectId: string) => any | null;
  canAccessProject: (user: CurrentUser | null, project: any) => boolean;
  sanitizeUser: (user: any) => CurrentUser;
}

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeName(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const saltPart = parts[1];
  const keyPart = parts[2];
  if (!saltPart || !keyPart) return false;
  try {
    const salt = Buffer.from(saltPart, 'base64url');
    const expected = Buffer.from(keyPart, 'base64url');
    const actual = scryptSync(password, salt, expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

function parseCookieHeader(header: unknown): Record<string, string> {
  if (typeof header !== 'string' || !header.trim()) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(value);
  }
  return out;
}

function requestIsSecure(req: Request): boolean {
  return req.secure || String(req.get('x-forwarded-proto') ?? '').split(',')[0]?.trim() === 'https';
}

function sessionCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

function clearSessionCookie(secure: boolean): string {
  return [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

function sanitizeUser(user: any): CurrentUser {
  const sanitized: CurrentUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role === 'admin' ? 'admin' : 'member',
    status: user.status === 'disabled' || user.status === 'pending' ? user.status : 'active',
    createdAt: Number(user.createdAt),
    updatedAt: Number(user.updatedAt),
  };
  if (user.lastLoginAt != null) sanitized.lastLoginAt = Number(user.lastLoginAt);
  return sanitized;
}

function userFromRequest(req: Request): CurrentUser | null {
  return ((req as any).user as CurrentUser | undefined) ?? null;
}

export function createAuthDeps(db: Db, sendApiError: SendApiError, getProject: (db: Db, id: string) => any): AuthDeps {
  const currentUser = (req: Request): CurrentUser | null => {
    const cached = userFromRequest(req);
    if (cached) return cached;
    const token = parseCookieHeader(req.headers.cookie)[SESSION_COOKIE];
    if (!token) return null;
    deleteExpiredSessions(db);
    const session = getSessionByTokenHash(db, tokenHash(token));
    if (!session || session.expiresAt <= Date.now()) {
      deleteSessionByTokenHash(db, tokenHash(token));
      return null;
    }
    if (session.user.status !== 'active') return null;
    touchSession(db, session.id);
    const user = sanitizeUser(session.user);
    (req as any).user = user;
    return user;
  };

  const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
    const user = currentUser(req);
    if (!user) {
      sendApiError(res, 401, 'AUTH_REQUIRED', 'Authentication required');
      return;
    }
    next();
  };

  const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
    const user = currentUser(req);
    if (!user) {
      sendApiError(res, 401, 'AUTH_REQUIRED', 'Authentication required');
      return;
    }
    if (user.role !== 'admin') {
      sendApiError(res, 403, 'ADMIN_REQUIRED', 'Only administrators can change site settings.');
      return;
    }
    next();
  };

  const canAccessProject = (user: CurrentUser | null, project: any): boolean => {
    if (!user || !project) return false;
    if (user.role === 'admin') return true;
    return project.ownerUserId === user.id;
  };

  const requireProjectAccess = (req: Request, res: Response, projectId: string): any | null => {
    const user = currentUser(req);
    if (!user) {
      sendApiError(res, 401, 'AUTH_REQUIRED', 'Authentication required');
      return null;
    }
    const project = getProject(db, projectId);
    if (!project || !canAccessProject(user, project)) {
      sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'not found');
      return null;
    }
    return project;
  };

  return { currentUser, requireAuth, requireAdmin, requireProjectAccess, canAccessProject, sanitizeUser };
}

export function registerAuthRoutes(app: Express, db: Db, auth: AuthDeps, sendApiError: SendApiError) {
  app.post('/api/auth/register', (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const name = normalizeName(req.body?.name);
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!name) return sendApiError(res, 400, 'BAD_REQUEST', 'name required');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'valid email required');
      }
      if (password.length < PASSWORD_MIN_LENGTH) {
        return sendApiError(res, 400, 'BAD_REQUEST', `password must be at least ${PASSWORD_MIN_LENGTH} characters`);
      }
      if (getUserByEmail(db, email)) {
        return sendApiError(res, 409, 'EMAIL_EXISTS', 'email already registered');
      }
      const now = Date.now();
      const firstUser = countUsers(db) === 0;
      const user = insertUser(db, {
        id: `user-${randomBytes(12).toString('hex')}`,
        email,
        name,
        passwordHash: hashPassword(password),
        role: firstUser ? 'admin' : 'member',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
      if (firstUser && user) claimUnownedProjects(db, user.id);
      res.status(201).json({ user: auth.sanitizeUser(user) });
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err?.message || err));
    }
  });

  app.post('/api/auth/login', (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const user = getUserByEmail(db, email);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        return sendApiError(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password');
      }
      if (user.status !== 'active') {
        return sendApiError(res, 403, 'ACCOUNT_DISABLED', 'Account is not active');
      }
      const now = Date.now();
      const remember = req.body?.remember === true;
      const days = remember ? REMEMBER_SESSION_DAYS : SESSION_DAYS;
      const maxAgeSeconds = days * 24 * 60 * 60;
      const token = randomBytes(32).toString('base64url');
      insertSession(db, {
        id: `session-${randomBytes(12).toString('hex')}`,
        userId: user.id,
        tokenHash: tokenHash(token),
        expiresAt: now + maxAgeSeconds * 1000,
        createdAt: now,
        lastSeenAt: now,
      });
      const nextUser = updateUser(db, user.id, { lastLoginAt: now }) ?? user;
      res.setHeader('Set-Cookie', sessionCookie(token, maxAgeSeconds, requestIsSecure(req)));
      res.json({ user: auth.sanitizeUser(nextUser) });
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err?.message || err));
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = parseCookieHeader(req.headers.cookie)[SESSION_COOKIE];
    if (token) deleteSessionByTokenHash(db, tokenHash(token));
    res.setHeader('Set-Cookie', clearSessionCookie(requestIsSecure(req)));
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    const user = auth.currentUser(req);
    if (!user) return sendApiError(res, 401, 'AUTH_REQUIRED', 'Authentication required');
    res.json({ user });
  });

  app.get('/api/admin/users', auth.requireAdmin, (_req, res) => {
    res.json({ users: listUsers(db).map(auth.sanitizeUser) });
  });

  app.patch('/api/admin/users/:id', auth.requireAdmin, (req, res) => {
    const target = getUser(db, String(req.params.id));
    if (!target) return sendApiError(res, 404, 'USER_NOT_FOUND', 'user not found');
    const patch: Record<string, unknown> = {};
    if (typeof req.body?.name === 'string') patch.name = normalizeName(req.body.name);
    if (req.body?.role === 'admin' || req.body?.role === 'member') patch.role = req.body.role;
    if (req.body?.status === 'active' || req.body?.status === 'disabled' || req.body?.status === 'pending') {
      patch.status = req.body.status;
    }
    const wouldRemoveAdmin =
      target.role === 'admin' &&
      target.status === 'active' &&
      ((patch.role && patch.role !== 'admin') || (patch.status && patch.status !== 'active'));
    if (wouldRemoveAdmin && countActiveAdmins(db) <= 1) {
      return sendApiError(res, 400, 'LAST_ADMIN', 'At least one active admin is required');
    }
    const updated = updateUser(db, target.id, patch);
    if (updated?.status !== 'active') deleteSessionsForUser(db, target.id);
    res.json({ user: auth.sanitizeUser(updated) });
  });
}
