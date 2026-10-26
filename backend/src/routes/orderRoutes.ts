import { Router, Request, Response } from 'express';
import { OrderService } from '../services/orderService.js';
import { authenticate } from '../middleware/auth.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';

const router = Router();

router.get('/', authenticate, async (req: Request, res: Response) => {
  const { id, proof, limit } = req.query;

  try {
    if (proof) {
      const proofData = await OrderService.getProof(Number(proof), req.user!);
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

router.post('/', authenticate, idempotencyMiddleware('create_order'), async (req: Request, res: Response) => {
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
