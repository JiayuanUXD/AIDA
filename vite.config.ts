import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  // Only expose env vars prefixed with VITE_ to the client bundle.
  // Never inline secret API keys (GEMINI_API_KEY, OSS_*, etc.) into the bundle
  // as they would be visible in the browser's source panel.
  // All AI calls go through the Express backend (/api/*) which reads keys server-side.
  const vitePublicEnv = Object.fromEntries(
    Object.entries(env)
      .filter(([key]) => key.startsWith('VITE_'))
      .map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)])
  );
  return {
    plugins: [react(), tailwindcss()],
    define: vitePublicEnv,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâ€”file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== "true",
      watch: {
        ignored: [
          "**/data/**",
          "**/data-opt/**",
          "**/*_rounds.json",
          "**/projects.json",
          "**/categories.json"
        ],
      },
    },
  };
});
