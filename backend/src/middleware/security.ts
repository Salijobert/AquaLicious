import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import sanitizeHtml from 'sanitize-html';
import cors, { CorsOptions } from 'cors';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';

// Helmet Security Headers
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", 'https:', 'http:', 'ws:', 'wss:']
    }
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' }
});

// Rate Limiter
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.nodeEnv === 'test' ? 10000 : 600,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: 'Too many requests, please try again later.' }
});

// HTML Sanitizer
export function sanitize(dirty: string | null | undefined): string {
  if (!dirty) return '';
  return sanitizeHtml(dirty, {
    allowedTags: [],
    allowedAttributes: {}
  }).trim();
}

// Strict CORS Handler: exact-origin whitelist from env (no .vercel.app or .ngrok wildcards), keeps https://localhost / capacitor://localhost for Capacitor APK
export const corsHandler = (req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  const isAllowedOrigin = (orig: string) => {
    if (!orig) return true;
    try {
      const parsed = new URL(orig);
      // Allow Capacitor mobile webview origins
      if (orig === 'https://localhost' || orig === 'capacitor://localhost') return true;
      // Allow localhost on any port for non-production development/test
      if (config.nodeEnv !== 'production' && ['localhost', '127.0.0.1'].includes(parsed.hostname)) return true;
      // Exact-origin whitelist check from CORS_ORIGINS
      return config.corsOrigins.includes(orig);
    } catch {
      return false;
    }
  };

  if (origin && !isAllowedOrigin(origin)) {
    return res.status(403).json({ error: 'Unapproved CORS origin' });
  }

  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key, X-AquaLicious-Cluster-Id, ngrok-skip-browser-warning');
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  next();
};
