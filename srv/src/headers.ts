/**
 * Global Headers Configuration
 * 
 * Shared HTTP headers used across all providers.
 * Providers can override these with more specific rules.
 */

export interface HeaderRule {
  key: string;
  value: string;
}

export interface HeaderGroup {
  pattern: string;
  headers: HeaderRule[];
}

// ============================================================================
// Security Headers (applied to all routes)
// ============================================================================

export const GLOBAL_SECURITY_HEADERS: HeaderRule[] = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-XSS-Protection', value: '0' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
];

export const GLOBAL_HSTS_HEADER: HeaderRule = {
  key: 'Strict-Transport-Security',
  value: 'max-age=31536000; includeSubDomains; preload',
};

export const GLOBAL_CORS_HEADERS: HeaderRule[] = [
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
];

// ============================================================================
// Content Security Policy
// ============================================================================

export const DEFAULT_CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "connect-src 'self' https:",
  "font-src 'self' data:",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join('; ');

export const GLOBAL_CSP_HEADER: HeaderRule = {
  key: 'Content-Security-Policy',
  value: DEFAULT_CSP,
};

// ============================================================================
// Default Cache Headers
// ============================================================================

export const CACHE_NONE: HeaderRule = {
  key: 'Cache-Control',
  value: 'no-cache',
};

export const CACHE_IMMUTABLE: HeaderRule = {
  key: 'Cache-Control',
  value: 'public, max-age=31536000, immutable',
};

export const CACHE_SHORT: HeaderRule = {
  key: 'Cache-Control',
  value: 'public, max-age=3600',
};

export const CACHE_DAY: HeaderRule = {
  key: 'Cache-Control',
  value: 'public, max-age=86400',
};

// ============================================================================
// Header Groups (pattern-based rules)
// ============================================================================

export const DEFAULT_HEADER_GROUPS: HeaderGroup[] = [
  {
    pattern: '/*',
    headers: [
      ...GLOBAL_SECURITY_HEADERS,
      GLOBAL_HSTS_HEADER,
      ...GLOBAL_CORS_HEADERS,
      GLOBAL_CSP_HEADER,
      CACHE_NONE,
    ],
  },
  {
    pattern: '/assets/*',
    headers: [CACHE_IMMUTABLE],
  },
  {
    pattern: '/*.js',
    headers: [CACHE_IMMUTABLE],
  },
  {
    pattern: '/*.css',
    headers: [CACHE_IMMUTABLE],
  },
  {
    pattern: '/*.png',
    headers: [CACHE_IMMUTABLE],
  },
  {
    pattern: '/*.jpg',
    headers: [CACHE_IMMUTABLE],
  },
  {
    pattern: '/*.jpeg',
    headers: [CACHE_IMMUTABLE],
  },
  {
    pattern: '/*.gif',
    headers: [CACHE_IMMUTABLE],
  },
  {
    pattern: '/*.svg',
    headers: [CACHE_IMMUTABLE],
  },
  {
    pattern: '/*.ico',
    headers: [CACHE_IMMUTABLE],
  },
  {
    pattern: '/*.woff',
    headers: [CACHE_IMMUTABLE],
  },
  {
    pattern: '/*.woff2',
    headers: [CACHE_IMMUTABLE],
  },
  {
    pattern: '/*.ttf',
    headers: [CACHE_IMMUTABLE],
  },
  {
    pattern: '/sitemap.xml',
    headers: [CACHE_DAY],
  },
  {
    pattern: '/robots.txt',
    headers: [CACHE_DAY],
  },
  {
    pattern: '/site.webmanifest',
    headers: [CACHE_DAY],
  },
];

// ============================================================================
// Prerendered Route Cache (for prestruct)
// ============================================================================

export const PRERENDERED_ROUTES = [
  '/',
  '/dashboard',
  '/connectors',
  '/connectors/create',
  '/strategies',
  '/strategies/create',
  '/rules',
  '/rules/create',
  '/trades',
  '/settings',
  '/login',
];

export const PRERENDERED_HEADER_GROUPS: HeaderGroup[] = PRERENDERED_ROUTES.map(route => ({
  pattern: `${route}/index.html`,
  headers: [CACHE_SHORT],
}));

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get all headers for a given path
 */
export function getHeadersForPath(path: string): HeaderRule[] {
  const allGroups = [...DEFAULT_HEADER_GROUPS, ...PRERENDERED_HEADER_GROUPS];
  
  // Global headers first
  const globalHeaders = allGroups
    .find(g => g.pattern === '/*')
    ?.headers ?? [];
  
  // Find matching pattern headers
  const matchingHeaders = allGroups
    .filter(g => g.pattern !== '/*' && matchPath(g.pattern, path))
    .flatMap(g => g.headers);
  
  // Merge: global first, then specific (later values override earlier)
  const headerMap = new Map<string, string>();
  
  for (const header of [...globalHeaders, ...matchingHeaders]) {
    headerMap.set(header.key, header.value);
  }
  
  return Array.from(headerMap.entries()).map(([key, value]) => ({ key, value }));
}

/**
 * Simple path matching (supports * wildcards)
 */
function matchPath(pattern: string, path: string): boolean {
  if (pattern === path) return true;
  
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -1);
    return path.startsWith(prefix);
  }
  
  return false;
}

/**
 * Export all headers as Cloudflare _headers format
 */
export function toCloudflareHeaders(groups: HeaderGroup[] = DEFAULT_HEADER_GROUPS): string {
  const lines: string[] = [];
  
  for (const group of groups) {
    lines.push(group.pattern);
    for (const header of group.headers) {
      lines.push(`  ${header.key}: ${header.value}`);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}
