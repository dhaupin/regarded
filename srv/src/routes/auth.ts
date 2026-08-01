/**
 * Auth Routes
 * 
 * Authentication endpoints (login, logout, session management).
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { createCookie } from 'hono/cookie';
import { get as getSecret } from '../../lib/secrets';

// JWT Secret from environment (using secrets module)
async function getJWTSecret(env: Env): Promise<string> {
  try {
    return await getSecret('jwt', { env });
  } catch {
    return 'dev-secret-change-in-production';
  }
}

// Simple JWT creation (for demo - in production use proper JWT library)
function createJWT(payload: any, secret: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const data = btoa(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days
  }));
  const signature = btoa('signature'); // Simplified - in production use proper signing
  return `${header}.${data}.${signature}`;
}

// Simple JWT verification (for demo)
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
  
  // Get user info
  const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  
  const userInfo = await userResponse.json() as any;
  
  // Create or update user in D2
  // TODO: Implement user creation/lookup
  
  // Set session cookie
  // TODO: Implement session management
  
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
      // Delete session from KV
      const sessionKey = `session:${verification.payload.userId}`;
      await c.env.KV.delete(sessionKey);
    }
  }

  // Clear cookie
  c.cookie('auth_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
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
  const user = {
    id: crypto.randomUUID(),
    email,
    name: email.split('@')[0],
    role: 'trader',
  };

  // Create JWT (async - uses secrets module)
  const secret = await getJWTSecret(c.env);
  const token = createJWT({ userId: user.id, email: user.email, role: user.role }, secret);

  // Store session in KV
  const sessionKey = `session:${user.id}`;
  await c.env.KV.put(sessionKey, JSON.stringify({ user, token }), { expirationTtl: 7 * 24 * 60 * 60 });

  // Set cookie
  c.cookie('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
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
