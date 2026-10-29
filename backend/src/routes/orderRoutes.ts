import { Router, Request, Response } from 'express';
import { OrderService } from '../services/orderService.js';
import { authenticate, requireEmailVerified, requireConsent } from '../middleware/auth.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import { prisma } from '../config/index.js';

const router = Router();

router.get('/', authenticate, async (req: Request, res: Response) => {
  const { id, proof, raw, limit, email_logs } = req.query;

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

    const orders = await OrderService.listOrders(req.user!, Number(limit) || 200);
    return res.json(orders);
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message || 'Error fetching orders' });
  }
});

router.post('/', authenticate, requireEmailVerified, requireConsent, idempotencyMiddleware('create_order'), async (req: Request, res: Response) => {
  const { items, fulfillment, address, method, expected_total, request_key } = req.body;

  try {
    const order = await OrderService.createOrder({
      userId: req.user!.id,
      items,
      fulfillment: fulfillment || 'PICKUP',
      address,
      method: method || 'CASH',
      expectedTotal: expected_total,
      requestKey: request_key
    });

    return res.status(200).json(order);
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message || 'Order creation failed' });
  }
});

router.patch('/', authenticate, async (req: Request, res: Response) => {
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
    return res.status(err.status || 500).json({ error: err.message || 'Order action failed' });
  }
});

export default router;
