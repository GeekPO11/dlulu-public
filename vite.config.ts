import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env from .env files AND merge with process.env
  // The empty prefix '' means load ALL env vars, not just VITE_ prefixed ones
  const env = loadEnv(mode, process.cwd(), '');

  // Merge process.env (from Cloudflare/hosting) into env object
  // This ensures hosting platform vars take precedence over .env files
  const mergedEnv = { ...env, ...process.env };

  const resolvedMixpanelToken =
    mergedEnv.VITE_MIXPANEL_TOKEN ?? mergedEnv.MIXPANEL_TOKEN ?? '';
  const resolvedMixpanelDebug =
    mergedEnv.VITE_MIXPANEL_DEBUG ?? mergedEnv.MIXPANEL_DEBUG ?? '';
  const resolvedMixpanelEnabled =
    mergedEnv.VITE_MIXPANEL_ENABLED ?? mergedEnv.MIXPANEL_ENABLED ?? '';

  // DEBUG: Log env vars during build to understand what Cloudflare is passing
  console.log('[Vite Config] Build mode:', mode);
  console.log('[Vite Config] VITE_SUPABASE_URL from process.env:', process.env.VITE_SUPABASE_URL ? 'SET' : 'NOT SET');
  console.log('[Vite Config] VITE_SUPABASE_URL from loadEnv:', env.VITE_SUPABASE_URL ? 'SET' : 'NOT SET');
  console.log('[Vite Config] VITE_SUPABASE_URL merged:', mergedEnv.VITE_SUPABASE_URL ? 'SET' : 'NOT SET');
  console.log('[Vite Config] VITE_MIXPANEL_TOKEN from process.env:', process.env.VITE_MIXPANEL_TOKEN ? 'SET' : 'NOT SET');
  console.log('[Vite Config] MIXPANEL_TOKEN from process.env:', process.env.MIXPANEL_TOKEN ? 'SET' : 'NOT SET');
  console.log('[Vite Config] VITE_MIXPANEL_TOKEN from loadEnv:', env.VITE_MIXPANEL_TOKEN ? 'SET' : 'NOT SET');
  console.log('[Vite Config] Mixpanel token resolved:', resolvedMixpanelToken ? 'SET' : 'NOT SET');

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    // Vite's envPrefix determines which env vars are exposed to client code
    // Default is 'VITE_' which is already correct
    define: {
      // Legacy Gemini API key support
      'process.env.API_KEY': JSON.stringify(mergedEnv.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(mergedEnv.GEMINI_API_KEY),
      // Expose Supabase vars - using merged env ensures Cloudflare vars work
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(mergedEnv.VITE_SUPABASE_URL),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(mergedEnv.VITE_SUPABASE_ANON_KEY),
      // Expose Mixpanel vars - allow either VITE_MIXPANEL_* (recommended) or MIXPANEL_* (fallback)
      'import.meta.env.VITE_MIXPANEL_TOKEN': JSON.stringify(resolvedMixpanelToken),
      'import.meta.env.VITE_MIXPANEL_DEBUG': JSON.stringify(resolvedMixpanelDebug),
      'import.meta.env.VITE_MIXPANEL_ENABLED': JSON.stringify(resolvedMixpanelEnabled),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
