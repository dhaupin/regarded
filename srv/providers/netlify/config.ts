/**
 * Netlify Provider Configuration
 * 
 * Deployment configuration for Netlify.
 */

import type { ProviderConfig } from '../../providers';

export const netlifyConfig: ProviderConfig = {
  siteUrl: 'https://regarded.netlify.app',
  siteName: 'regarded',
  buildCommand: 'cd app && npm install && npm run build',
  outputDirectory: 'app/dist',
  
  // Headers merged with global defaults
  headers: [],
};
