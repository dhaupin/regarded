/**
 * Vercel Provider Configuration
 * 
 * Deployment configuration for Vercel.
 */

import type { ProviderConfig } from '../../providers';

export const vercelConfig: ProviderConfig = {
  siteUrl: 'https://regarded.vercel.app',
  siteName: 'regarded',
  buildCommand: 'cd app && npm install && npm run build',
  outputDirectory: 'app/dist',
  
  // Headers merged with global defaults
  headers: [],
};
