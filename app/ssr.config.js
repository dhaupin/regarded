/**
 * ssr.config.js - Prestruct SEO config for Regarded
 * 
 * Copy this file to your project root as ssr.config.js, then customize.
 */

export default {
  // === Platform ===
  platform: 'cloudflare',

  // === Site Identity ===
  siteUrl: 'https://regarded.creadev.org',
  siteName: 'Regarded',
  author: 'Regarded Team',
  tagline: 'Crypto Trading Agent Platform',
  ogImage: 'https://regarded.creadev.org/og-image.png',
  keywords: 'crypto, trading, bot, agent, automation, defi',

  // === App ===
  // Path to your AppLayout component (no BrowserRouter, only Routes)
  appLayoutPath: '/src/AppLayout.tsx',

  // === Routes ===
  // Each route gets prerendered to static HTML at build time.
  routes: [
    {
      path: '/',
      priority: '1.0',
      changefreq: 'daily',
      meta: {
        title: 'Regarded - Crypto Trading Agent',
        description: 'Automate your crypto trading with AI-powered strategies. Paper trade and live trade on Kraken, Solana, and more.',
      },
    },
    {
      path: '/dashboard',
      priority: '0.9',
      changefreq: 'daily',
      meta: {
        title: 'Dashboard | Regarded',
        description: 'View your portfolio, strategies, and trading activity.',
      },
    },
    {
      path: '/connectors',
      priority: '0.8',
      changefreq: 'weekly',
      meta: {
        title: 'Connectors | Regarded',
        description: 'Connect your exchange accounts for trading.',
      },
    },
    {
      path: '/strategies',
      priority: '0.8',
      changefreq: 'weekly',
      meta: {
        title: 'Strategies | Regarded',
        description: 'Create and manage your trading strategies.',
      },
    },
    {
      path: '/rules',
      priority: '0.8',
      changefreq: 'weekly',
      meta: {
        title: 'Rules | Regarded',
        description: 'Configure trading rules and risk management.',
      },
    },
    {
      path: '/trades',
      priority: '0.7',
      changefreq: 'daily',
      meta: {
        title: 'Trades | Regarded',
        description: 'View your trading history.',
      },
    },
    {
      path: '/settings',
      priority: '0.6',
      changefreq: 'monthly',
      meta: {
        title: 'Settings | Regarded',
        description: 'Manage your account settings and preferences.',
      },
    },
    {
      path: '/login',
      priority: '0.5',
      changefreq: 'monthly',
      meta: {
        title: 'Login | Regarded',
        description: 'Sign in to your Regarded account.',
      },
    },
  ],

  // === 404 Page ===
  notFound: {
    heading: 'Page not found',
    body: "That page doesn't exist.",
    primaryCta: { label: 'Go home', href: '/' },
  },
};
