import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { OrderService } from '../services/orderService.js';
import { authenticate, requireEmailVerified, requireConsent } from '../middleware/auth.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import { prisma } from '../config/index.js';

const router = Router();

const customerCancelLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.CANCEL_RATE_LIMIT_MAX || 10),
  keyGenerator: (req: Request) => (req.user?.id ? `cancel-user-${req.user.id}` : req.ip || 'unknown'),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: 'Too many order cancellation attempts. Please wait a few minutes before trying again.', code: 'CANCEL_RATE_LIMITED' }
});

const conditionalCustomerCancelLimiter = (req: Request, res: Response, next: NextFunction) => {
  if (req.user?.role === 'CUSTOMER' && req.body?.action === 'status' && req.body?.status === 'CANCELLED') {
    return customerCancelLimiter(req, res, next);
  }
  return next();
};

const createOrderSchema = z.object({
  items: z.array(z.object({
    product_id: z.number().int().positive(),
    qty: z.number().int().positive()
  })).min(1, 'Cart items cannot be empty'),
  fulfillment: z.enum(['PICKUP', 'STORE_PICKUP', 'DELIVERY']).optional().default('PICKUP').transform(f => f === 'STORE_PICKUP' ? 'PICKUP' : f),
  address: z.string().optional(),
  method: z.enum(['CASH', 'E_WALLET'], {
    errorMap: () => ({ message: 'Invalid payment method. Only Cash and E-Wallet are accepted.' })
  }).optional().default('E_WALLET'),
  expected_total: z.union([z.number(), z.string()]).optional(),
  request_key: z.string().optional()
}).superRefine((val, ctx) => {
  if (val.fulfillment === 'PICKUP' && val.method === 'CASH') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['method'],
      message: 'Pickup at Station orders must be paid via E-Wallet (GCash / Maya).'
    });
  }
});

router.get('/', authenticate, async (req: Request, res: Response) => {
  const { id, proof, raw, limit, email_logs, pending_summary } = req.query;

  if (pending_summary === '1' || pending_summary === 'true') {
    if (req.user!.role !== 'ADMIN') {
      res.status(403).json({ error: 'Administrator access required' });
      return;
    }
    const parsedLimit = limit ? Number(limit) : 5;
    const summary = await OrderService.getPendingSummary(parsedLimit);
    res.json(summary);
    return;
  }

  try {
    if (email_logs) {
      if (req.user!.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Admin only' });
      }
      const logs = await prisma.emailLog.findMany({
        where: email_logs !== '1' && email_logs !== 'true' ? { orderId: Number(email_logs) } : {},
        orderBy: { id: 'desc' }
      });
      return res.json(logs);
    }
    if (proof) {
      const proofData = await OrderService.getProof(Number(proof), req.user!);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (raw === '1' || req.headers.accept?.startsWith('image/')) {
        if (!proofData.proof_base64) {
          return res.status(404).json({ error: 'No proof image uploaded', code: 'PROOF_NOT_FOUND' });
        }
        const matches = proofData.proof_base64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
        const mime = matches ? matches[1] : 'image/jpeg';
        const data = matches ? matches[2] : proofData.proof_base64;
        res.setHeader('Content-Type', mime);
        return res.send(Buffer.from(data, 'base64'));
      }
      return res.json(proofData);
    }

    if (id) {
      const order = await OrderService.getOrder(Number(id), req.user!);
      return res.json(order);
    }

    const statusFilter = typeof req.query.status === 'string' ? req.query.status : undefined;
    if (req.query.paginated === '1' || req.query.paginated === 'true') {
      const paginated = await OrderService.listOrdersPaginated(req.user!, {
        status: statusFilter,
        limit: Number(limit) || 40,
        offset: Number(req.query.offset) || 0
      });
      return res.json(paginated);
    }

    const orders = await OrderService.listOrders(req.user!, Number(limit) || 200, statusFilter);
    return res.json(orders);
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message || 'Error fetching orders' });
  }
});

router.post('/', authenticate, requireEmailVerified, requireConsent, idempotencyMiddleware('create_order'), async (req: Request, res: Response) => {
  // Explicitly detect PICKUP + CASH before generic schema validation to return PICKUP_REQUIRES_EWALLET consistently
  const rawFulfillment = String(req.body?.fulfillment || 'PICKUP').toUpperCase();
  const normalizedFulfillment = rawFulfillment === 'STORE_PICKUP' ? 'PICKUP' : rawFulfillment;
  const rawMethod = String(req.body?.method || 'E_WALLET').toUpperCase();
  if (normalizedFulfillment === 'PICKUP' && rawMethod === 'CASH') {
    console.warn(`[OrderRoutes] Rejected PICKUP+CASH checkout attempt (userId=${req.user!.id})`);
    return res.status(422).json({
      error: 'Pickup at Station orders must be paid via E-Wallet (GCash / Maya). Cash is only accepted for Delivery.',
      code: 'PICKUP_REQUIRES_EWALLET'
    });
  }

  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: parsed.error.errors[0]?.message || 'Validation failed',
      errors: parsed.error.errors
    });
  }

  const { items, fulfillment, address, method, expected_total, request_key } = parsed.data;

  try {
    const order = await OrderService.createOrder({
      userId: req.user!.id,
      userRole: req.user!.role,
      items,
      fulfillment,
      address,
      method,
      expectedTotal: expected_total,
      requestKey: request_key
    });

    return res.status(200).json(order);
  } catch (err: any) {
    return res.status(err.status || 500).json({
      error: err.message || 'Order creation failed',
      ...(err.code ? { code: err.code } : {})
    });
  }
});

router.patch('/', authenticate, conditionalCustomerCancelLimiter, async (req: Request, res: Response) => {
  const { id, action } = req.body;

  if (!id || !action) {
    return res.status(422).json({ error: 'Order id and action are required' });
  }

  // Customer actions require consent
  if (req.user!.role === 'CUSTOMER') {
    const consent = await prisma.userConsent.findFirst({
      where: { userId: req.user!.id, consent: true }
    });
    if (!consent) {
      return res.status(403).json({
        error: 'Data Privacy Act consent is required before performing customer actions.',
        code: 'CONSENT_REQUIRED'
      });
    }
  }

  // Block unverified customer from claiming payment proof
  if (action === 'claim' && req.user!.role === 'CUSTOMER' && !req.user!.emailVerified) {
    return res.status(403).json({
      error: 'Email verification required before submitting payment claims',
      code: 'EMAIL_NOT_VERIFIED'
    });
  }

  try {
    const result = await OrderService.patchOrder({
      id: Number(id),
      action,
      user: req.user!,
      body: req.body
    });

    return res.status(200).json(result);
  } catch (err: any) {
    return res.status(err.status || 500).json({
      error: err.message || 'Order action failed',
      code: err.code
    });
  }
});

export default router;
