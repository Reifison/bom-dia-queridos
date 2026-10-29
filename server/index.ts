import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

dotenv.config();
dotenv.config({ path: '.env.local' });

const port = Number(process.env.PORT || process.env.API_PORT) || 8787;
const production = process.env.NODE_ENV === 'production';
const app = createApp({
  dist: production ? path.join(path.dirname(fileURLToPath(import.meta.url)), '../dist') : undefined,
});
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`[api] listening on port ${port}`);
  if (!process.env.GEMINI_API_KEY?.trim()) console.error('[api] GEMINI_API_KEY is not configured');
});
server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(error.code === 'EADDRINUSE' ? `[api] Port ${port} is already in use; choose another API_PORT.` : error.message);
  process.exit(1);
});
