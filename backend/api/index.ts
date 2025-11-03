/// <reference path="./types.d.ts" />
import type { VercelRequest, VercelResponse } from '@vercel/node';

// The compiled Express application lives in dist/app.js after `npm run build`.
// We lazily import it so the function only loads once per execution environment.
let cachedApp: typeof import('../dist/app.js')['default'] | null = null;

const ensureApp = async () => {
  if (!cachedApp) {
    const mod = await import('../dist/app.js');
    cachedApp = mod.default;
  }
  return cachedApp;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const app = await ensureApp();
  return app(req, res);
}

// Defer body parsing to Express so JSON limits and middleware remain consistent.
export const config = {
  api: {
    bodyParser: false
  }
};
