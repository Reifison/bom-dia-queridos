import express, { type ErrorRequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { classifyGenerationError } from './apiErrors.js';
import { formatGeminiErrorForLog, generateDailyImage, generateDailyMessage, type AppLocale, type PeriodId } from './gemini.js';

const PERIODS = new Set(['morning', 'afternoon', 'night']);

export function isAllowedCorsOrigin(origin: string | undefined, extraOrigins: string[]): boolean {
  if (!origin) return false;
  return /^(capacitor|ionic):\/\/localhost$/i.test(origin) ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) || extraOrigins.includes(origin);
}

function parsePeriod(body: unknown): PeriodId | null {
  if (!body || typeof body !== 'object' || !('period' in body)) return null;
  return typeof body.period === 'string' && PERIODS.has(body.period) ? body.period as PeriodId : null;
}

function parseLocale(body: unknown): AppLocale | null {
  if (!body || typeof body !== 'object') return null;
  if (!('locale' in body)) return 'pt'; // Backward compatibility for older clients.
  return body.locale === 'pt' || body.locale === 'en' ? body.locale : null;
}

export function createApp(options: {
  generateMessage?: typeof generateDailyMessage;
  generateImage?: typeof generateDailyImage;
  dist?: string;
  corsOrigins?: string[];
  trustProxyHops?: number;
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  const hops = options.trustProxyHops ?? Number(process.env.TRUST_PROXY_HOPS || 0);
  if (Number.isInteger(hops) && hops > 0 && hops <= 4) app.set('trust proxy', hops);
  const corsOrigins = options.corsOrigins ?? (process.env.CORS_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean);

  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    res.vary('Origin');
    if (isAllowedCorsOrigin(origin, corsOrigins)) {
      res.setHeader('Access-Control-Allow-Origin', origin!);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '86400');
    }
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    next();
  });
  app.use(express.json({ limit: '4kb' }));
  app.get('/api/health', (_req, res) => {
    const configured = !!process.env.GEMINI_API_KEY?.trim();
    res.status(configured ? 200 : 503).json({ status: configured ? 'ok' : 'unconfigured' });
  });

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'RATE_LIMITED' },
  });

  const routes: Array<{ path: string; generate: (period: PeriodId, locale: AppLocale) => Promise<unknown> }> = [
    { path: '/api/generate-message', generate: (period, locale) => (options.generateMessage ?? generateDailyMessage)(period, locale) },
    { path: '/api/generate-image', generate: async (period) => ({ image: await (options.generateImage ?? generateDailyImage)(period) }) },
  ];
  for (const route of routes) {
    app.post(route.path, limiter, async (req, res) => {
      const period = parsePeriod(req.body);
      const locale = parseLocale(req.body);
      if (!period || !locale) { res.status(400).json({ error: 'INVALID_BODY' }); return; }
      const requestId = randomUUID();
      try {
        res.json(await route.generate(period, locale));
      } catch (error) {
        const failure = classifyGenerationError(error);
        console.error('[api]', JSON.stringify({ requestId, route: route.path, period, code: failure.code, detail: formatGeminiErrorForLog(error) }));
        res.status(failure.status).json({ error: failure.code, requestId });
      }
    });
  }

  app.use('/api', (_req, res) => { res.status(404).json({ error: 'NOT_FOUND' }); });
  const handleErrors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof SyntaxError || error?.type === 'entity.too.large') {
      res.status(400).json({ error: 'INVALID_BODY' });
      return;
    }
    console.error('[api] request failed');
    res.status(500).json({ error: 'REQUEST_FAILED' });
  };
  app.use(handleErrors);

  if (options.dist) {
    app.use(express.static(options.dist, { index: false }));
    app.get('*', (_req, res) => res.sendFile(path.join(options.dist!, 'index.html')));
  }
  return app;
}
