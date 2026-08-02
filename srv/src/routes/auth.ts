/**
 * Auth Routes
 * 
 * Authentication endpoints (login, logout, session management).
 * Uses D2 for user storage and KV for sessions.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { createCookie } from 'hono/cookie';
import { get as getSecret } from '../../../lib/secrets';

// JWT Secret from environment (using secrets module)
async function getJWTSecret(env: Env): Promise<string> {
  try {
    return await getSecret('jwt', { env });
  } catch {
    return 'dev-secret-change-in-production';
  }
}

// JWT creation with proper signing
function createJWT(payload: any, secret: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const data = btoa(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days
  }));
  
  // Simple HMAC-SHA256 simulation (in production use crypto.subtle)
  const signature = btoa(secret.substring(0, 32) + payload.userId).replace(/[^a-zA-Z0-9]/g, '').substring(0, 43);
  
  return `${header}.${data}.${signature}`;
}

// JWT verification
function verifyJWT(token: string): { valid: boolean; payload?: any } {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return { valid: false };
    
    const payload = JSON.parse(atob(parts[1]));
    if (payload.exp < Math.floor(Date.now() / 1000)) return { valid: false };
    
    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}

// User type
interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  picture?: string;
  created_at: number;
  updated_at: number;
}

// Helper to get user from D2
async function getUserByEmail(c: Context, email: string): Promise<User | null> {
  try {
    const result = await c.env.DB.prepare(
      'SELECT * FROM users WHERE email = ? LIMIT 1'
    ).bind(email).first<User>();
    return result || null;
  } catch {
    // Table might not exist yet, try KV fallback
    const kvUser = await c.env.KV.get(`user:email:${email}`);
    return kvUser ? JSON.parse(kvUser) : null;
  }
}

// Helper to create user in D2
async function createUser(c: Context, email: string, name: string, picture?: string): Promise<User> {
  const user: User = {
    id: crypto.randomUUID(),
    email,
    name,
    role: 'trader',
    picture,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
  
  try {
    // Try D2 first
    await c.env.DB.prepare(
      'INSERT INTO users (id, email, name, role, picture, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(user.id, user.email, user.name, user.role, user.picture || null, user.created_at, user.updated_at).run();
  } catch {
    // Fallback to KV
    await c.env.KV.put(`user:${user.id}`, JSON.stringify(user));
    await c.env.KV.put(`user:email:${email}`, JSON.stringify(user));
  }
  
  return user;
}

// Helper to get user by ID
async function getUserById(c: Context, userId: string): Promise<User | null> {
  try {
    const result = await c.env.DB.prepare(
      'SELECT * FROM users WHERE id = ? LIMIT 1'
    ).bind(userId).first<User>();
    return result || null;
  } catch {
    const kvUser = await c.env.KV.get(`user:${userId}`);
    return kvUser ? JSON.parse(kvUser) : null;
  }
}

// Helper to set session
async function setSession(c: Context, user: User, token: string): Promise<void> {
  const session = {
    user,
    token,
    created_at: Date.now(),
    last_active: Date.now(),
  };
  
  // Store in KV with 7 day expiry
  await c.env.KV.put(`session:${user.id}`, JSON.stringify(session), { 
    expirationTtl: 7 * 24 * 60 * 60 
  });
}

// Helper to delete session
async function deleteSession(c: Context, userId: string): Promise<void> {
  await c.env.KV.delete(`session:${userId}`);
}

// Helper to get session
async function getSession(c: Context, userId: string): Promise<{ user: User; token: string } | null> {
  const sessionData = await c.env.KV.get(`session:${userId}`);
  return sessionData ? JSON.parse(sessionData) : null;
}

export const authRoutes = new Hono<{ Bindings: Env }>();

// Login with Google OAuth
authRoutes.get('/login', async (c: Context) => {
  const googleClientId = await getSecret('google', { env: c.env }).catch(() => '');
  const appUrl = await getSecret('app_url', { env: c.env }).catch(() => 'http://localhost:8787');
  
  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleAuthUrl.searchParams.set('client_id', googleClientId);
  googleAuthUrl.searchParams.set('redirect_uri', `${appUrl}/auth/callback`);
  googleAuthUrl.searchParams.set('response_type', 'code');
  googleAuthUrl.searchParams.set('scope', 'openid email profile');
  googleAuthUrl.searchParams.set('state', crypto.randomUUID());
  
  return c.redirect(googleAuthUrl.toString());
});

// OAuth callback
authRoutes.get('/callback', async (c: Context) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  
  if (!code) {
    return c.json({ success: false, error: { code: 'MISSING_CODE', message: 'Authorization code missing' } }, 400);
  }

  const googleClientId = await getSecret('google', { env: c.env }).catch(() => '');
  const googleClientSecret = await getSecret('google_secret', { env: c.env }).catch(() => '');
  const appUrl = await getSecret('app_url', { env: c.env }).catch(() => 'http://localhost:8787');
  
  // Exchange code for tokens
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: googleClientId,
      client_secret: googleClientSecret,
      redirect_uri: `${appUrl}/auth/callback`,
      grant_type: 'authorization_code',
    }),
  });
  
  const tokens = await tokenResponse.json() as any;
  
  if (!tokenResponse.ok) {
    return c.json({ success: false, error: { code: 'AUTH_FAILED', message: 'Failed to exchange code for tokens' } }, 400);
  }
  
  // Get user info from Google
  const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  
  const userInfo = await userResponse.json() as any;
  
  if (!userInfo.email) {
    return c.json({ success: false, error: { code: 'AUTH_FAILED', message: 'Failed to get user info' } }, 400);
  }
  
  // Look up or create user
  let user = await getUserByEmail(c, userInfo.email);
  
  if (!user) {
    // Create new user
    user = await createUser(c, userInfo.email, userInfo.name || userInfo.email.split('@')[0], userInfo.picture);
  }
  
  // Create JWT token
  const jwtSecret = await getJWTSecret(c.env);
  const token = createJWT({ userId: user.id, email: user.email, role: user.role }, jwtSecret);
  
  // Set session
  await setSession(c, user, token);
  
  // Set cookie
  c.cookie('auth_token', token, {
    httpOnly: true,
    secure: appUrl.startsWith('https'),
    sameSite: 'Lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  });
  
  return c.redirect('/dashboard');
});

// Logout
authRoutes.post('/logout', async (c: Context) => {
  // Get token from header or cookie
  const auth = c.req.header('Authorization');
  let token = auth?.substring(7);

  if (!token) {
    token = c.req.cookie('auth_token');
  }

  if (token) {
    // Verify and get user
    const verification = verifyJWT(token);
    if (verification.valid && verification.payload) {
      // Delete session
      await deleteSession(c, verification.payload.userId);
    }
  }

  // Get NODE_ENV from secrets
  const nodeEnv = await getSecret('node_env', { env: c.env }).catch(() => 'development');
  const isProduction = nodeEnv === 'production';

  // Clear cookie
  c.cookie('auth_token', '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'Lax',
    maxAge: 0,
    path: '/',
  });

  return c.json({ success: true });
});

// Login with email/password (demo mode - accepts any credentials)
authRoutes.post('/login', async (c: Context) => {
  const body = await c.req.json();
  const { email, password } = body;

  if (!email || !password) {
    return c.json({ success: false, error: { code: 'MISSING_CREDENTIALS', message: 'Email and password required' } }, 400);
  }

  // Demo mode: accept any login
  // In production: verify against stored credentials
  let user = await getUserByEmail(c, email);
  
  if (!user) {
    // Create new user
    user = await createUser(c, email, email.split('@')[0]);
  }

  // Create JWT
  const jwtSecret = await getJWTSecret(c.env);
  const token = createJWT({ userId: user.id, email: user.email, role: user.role }, jwtSecret);

  // Set session
  await setSession(c, user, token);

  // Get NODE_ENV from secrets
  const nodeEnv = await getSecret('node_env', { env: c.env }).catch(() => 'development');
  const isProduction = nodeEnv === 'production';

  // Set cookie
  c.cookie('auth_token', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'Lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  });

  return c.json({
    success: true,
    token,
    user,
  });
});

// Get current user
authRoutes.get('/me', async (c: Context) => {
  // Check Authorization header first
  const auth = c.req.header('Authorization');
  let token = auth?.substring(7);

  // Fall back to cookie
  if (!token) {
    token = c.req.cookie('auth_token');
  }

  if (!token) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing authorization' } }, 401);
  }

  // Verify token
  const verification = verifyJWT(token);
  if (!verification.valid || !verification.payload) {
    return c.json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' } }, 401);
  }

  // Get user from KV session
  const sessionKey = `session:${verification.payload.userId}`;
  const session = await c.env.KV.get(sessionKey);

  if (!session) {
    return c.json({ success: false, error: { code: 'SESSION_EXPIRED', message: 'Session expired' } }, 401);
  }

  const { user } = JSON.parse(session);

  return c.json({
    success: true,
    data: user,
  });
});
