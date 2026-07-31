/**
 * Auth Routes
 * 
 * Authentication endpoints (login, logout, session management).
 */

import { Hono } from 'hono';
import type { Context } from 'hono';

export const authRoutes = new Hono<{ Bindings: Env }>();

// Login with Google OAuth
authRoutes.get('/login', (c: Context) => {
  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleAuthUrl.searchParams.set('client_id', c.env.GOOGLE_CLIENT_ID || '');
  googleAuthUrl.searchParams.set('redirect_uri', `${c.env.APP_URL}/auth/callback`);
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
  
  // Exchange code for tokens
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID || '',
      client_secret: c.env.GOOGLE_CLIENT_SECRET || '',
      redirect_uri: `${c.env.APP_URL}/auth/callback`,
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
  // Clear session
  // TODO: Implement logout
  
  return c.json({ success: true });
});

// Get current user
authRoutes.get('/me', async (c: Context) => {
  // Check Authorization header
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing authorization' } }, 401);
  }
  
  const token = auth.substring(7);
  
  // Verify token and get user
  // TODO: Implement token verification
  
  return c.json({
    success: true,
    data: {
      id: 'user-id',
      email: 'user@example.com',
      name: 'Test User',
      role: 'trader',
    },
  });
});
