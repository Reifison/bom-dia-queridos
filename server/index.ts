import dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: '.env.local' });
import { ApiError } from '@google/genai';
import express from 'express';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  formatGeminiErrorForLog,
  generateDailyImage,
  generateDailyMessage,
  type PeriodId,
} from './gemini.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || process.env.API_PORT) || 8787;
const isProd = process.env.NODE_ENV === 'production';

function isAllowedCorsOrigin(origin: string | undefined): origin is string {
  if (!origin) return false;
  const o = origin.replace(/\/+$/, '');
  return (
    /^(capacitor|ionic):\/\/localhost$/i.test(o) ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(o)
  );
}

const app = express();
app.disable('x-powered-by');

/** Capacitor/WKWebView uses origin capacitor://localhost; browser dev uses http://localhost — API must allow CORS. */
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    const origin = req.headers.origin;
    if (isAllowedCorsOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '86400');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
  }
  next();
});

app.use(express.json({ limit: '4kb' }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED' },
});

const PERIODS = new Set<string>(['morning', 'afternoon', 'night']);

function parsePeriod(body: unknown): PeriodId | null {
  if (typeof body !== 'object' || body === null || !('period' in body)) {
    return null;
  }
  const p = (body as { period: unknown }).period;
  if (typeof p !== 'string' || !PERIODS.has(p)) {
    return null;
  }
  return p as PeriodId;
}

/** O cliente gera UUID por pedido para variar prompts e evitar saídas idênticas entre cliques. */
function parseVariationKey(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('variationKey' in body)) {
    return undefined;
  }
  const v = (body as { variationKey: unknown }).variationKey;
  if (typeof v !== 'string' || v.length < 8 || v.length > 128) {
    return undefined;
  }
  if (!/^[0-9a-zA-Z-]+$/.test(v)) {
    return undefined;
  }
  return v;
}

app.post('/api/generate-message', apiLimiter, async (req, res) => {
  const period = parsePeriod(req.body);
  if (!period) {
    res.status(400).json({ error: 'INVALID_BODY' });
    return;
  }
  const variationKey = parseVariationKey(req.body);
  try {
    const data = await generateDailyMessage(period, { variationKey });
    res.json(data);
  } catch (err) {
    if (err instanceof Error && err.message === 'GEMINI_API_KEY_MISSING') {
      console.error('[api] GEMINI_API_KEY is not configured');
    } else if (err instanceof ApiError && err.status === 429) {
      console.error('[api] generate-message quota:', formatGeminiErrorForLog(err));
      res.status(429).json({ error: 'QUOTA_EXCEEDED' });
      return;
    } else {
      console.error('[api] generate-message failed:', formatGeminiErrorForLog(err));
    }
    res.status(500).json({ error: 'GENERATION_FAILED' });
  }
});

app.post('/api/generate-image', apiLimiter, async (req, res) => {
  const period = parsePeriod(req.body);
  if (!period) {
    res.status(400).json({ error: 'INVALID_BODY' });
    return;
  }
  const variationKey = parseVariationKey(req.body);
  try {
    const image = await generateDailyImage(period, { variationKey });
    res.json({ image });
  } catch (err) {
    if (err instanceof Error && err.message === 'GEMINI_API_KEY_MISSING') {
      console.error('[api] GEMINI_API_KEY is not configured');
    } else if (err instanceof ApiError && err.status === 429) {
      console.error('[api] generate-image quota:', formatGeminiErrorForLog(err));
      res.status(429).json({ error: 'QUOTA_EXCEEDED' });
      return;
    } else {
      console.error('[api] generate-image failed:', formatGeminiErrorForLog(err));
    }
    res.status(500).json({ error: 'GENERATION_FAILED' });
  }
});

if (isProd) {
  const dist = path.join(__dirname, '../dist');
  app.use(express.static(dist, { index: false }));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(dist, 'index.html'));
  });
}

const server = app.listen(PORT, '0.0.0.0', () => {
  if (!isProd) {
    console.log(`[api] listening on http://127.0.0.1:${PORT} (bound 0.0.0.0)`);
  } else {
    console.log(`[server] production on port ${PORT} (bound 0.0.0.0, CORS for Capacitor)`);
  }
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[api] Porta ${PORT} já está em uso. Pare o outro processo ou use: kill $(lsof -ti tcp:${PORT})`
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});
