import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../config/index.js';

export function idempotencyMiddleware(actionName: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = (req.body.request_key || req.headers['idempotency-key']) as string | undefined;
    if (!key) {
      return next();
    }

    if (!/^[a-zA-Z0-9_-]{16,80}$/.test(key)) {
      return res.status(422).json({ error: 'Invalid request_key format (16-80 alphanumeric/hyphen/underscore chars required)' });
    }

    const userId = req.user?.id;
    if (!userId) {
      return next();
    }

    // Hash the complete request body
    const payloadHash = crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex');

    try {
      const existing = await prisma.idempotencyLog.findUnique({
        where: {
          userId_requestKey: {
            userId,
            requestKey: key
          }
        }
      });

      if (existing) {
        if (existing.requestHash !== payloadHash) {
          return res.status(409).json({ error: 'Changed payload cannot reuse key' });
        }
        // Identical retry: return previously recorded response
        const parsed = JSON.parse(existing.responseBody);
        return res.status(existing.responseCode).json(parsed);
      }

      // Capture the response to save it upon completion
      const originalJson = res.json.bind(res);
      res.json = function (body: any) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          prisma.idempotencyLog.create({
            data: {
              userId,
              requestKey: key,
              requestHash: payloadHash,
              responseCode: res.statusCode,
              responseBody: JSON.stringify(body)
            }
          }).then(() => {
            originalJson(body);
          }).catch(err => {
            console.error('Failed to save idempotency log:', err);
            originalJson(body);
          });
          return res;
        }
        return originalJson(body);
      };

      next();
    } catch (err: any) {
      return res.status(500).json({ error: 'Idempotency verification error' });
    }
  };
}
