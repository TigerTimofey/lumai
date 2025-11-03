import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Express } from 'express';

// The compiled Express application lives in dist/app.js after `npm run build`.
// We lazily import it so the function only loads once per execution environment.
let cachedApp: Express | null = null;

const ensureApp = async () => {
  if (!cachedApp) {
    // @ts-ignore -- dist/app.js is generated at build time
    const mod = await import('../dist/app.js');
    cachedApp = (mod as { default: Express }).default;
  }
  return cachedApp;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const app = await ensureApp();
  if (req.url && !req.url.startsWith('/api')) {
    const original = req.url;
    const nextPath = original === '/' ? '/api' : `/api${original}`;
    const mutableReq = req as unknown as {
      url?: string;
      originalUrl?: string;
      path?: string;
      baseUrl?: string;
      _parsedUrl?: unknown;
    };
    mutableReq.url = nextPath;
    mutableReq.originalUrl = nextPath;
    if (mutableReq.path) mutableReq.path = undefined;
    if (mutableReq.baseUrl) mutableReq.baseUrl = undefined;
    if (mutableReq._parsedUrl) delete mutableReq._parsedUrl;
  }
  return app(req, res);
}

// Defer body parsing to Express so JSON limits and middleware remain consistent.
export const config = {
  api: {
    bodyParser: false
  }
};
