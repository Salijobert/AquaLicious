import { Router, Request, Response } from 'express';
import { SalesService } from '../services/salesService.js';
import { authenticate, requireRole, verifyAdminApproval } from '../middleware/auth.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import { Role } from '@prisma/client';
import { prisma, config } from '../config/index.js';

const router = Router();

// Admin list sales
router.get('/', authenticate, requireRole(Role.ADMIN), async (req: Request, res: Response) => {
  const id = req.query.id ? Number(req.query.id) : null;
  if (id) {
    const sale = await SalesService.getById(id);
    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }
    return res.json(sale);
  }

  const limit = req.query.limit ? Number(req.query.limit) : 500;
  const sales = await SalesService.listSales(limit);
  return res.json(sales);
});

// Admin POS checkout
router.post(
  '/',
  authenticate,
  requireRole(Role.ADMIN),
  idempotencyMiddleware('pos_checkout'),
  async (req: Request, res: Response) => {
    const { items, cash_tendered, expected_total, request_key } = req.body;

    try {
      const receipt = await SalesService.checkout({
        userId: req.user!.id,
        items,
        cashTendered: cash_tendered,
        expectedTotal: expected_total,
        requestKey: request_key
      });

      return res.status(200).json(receipt);
    } catch (err: any) {
      return res.status(err.status || 500).json({ error: err.message || 'Checkout failed' });
    }
  }
);

// Administrator void action
router.patch('/', authenticate, requireRole(Role.ADMIN), async (req: Request, res: Response) => {
  const { id, admin_token, admin_username, admin_password, reason } = req.body;
  const saleId = Number(id);

  if (!saleId) {
    return res.status(422).json({ error: 'Sale id is required' });
  }

  let adminId: number | null = null;

  // 1. If caller is already an Administrator
  if (req.user!.role === Role.ADMIN) {
    adminId = req.user!.id;
  }
  // 2. If Firebase reauth token provided
  else if (admin_token) {
    try {
      const adminUser = await verifyAdminApproval(admin_token);
      adminId = adminUser.id;
    } catch {
      return res.status(403).json({ error: 'Invalid void approval token' });
    }
  }
  // 3. Fallback compatibility with username/password check for legacy test harness
  else if (admin_username && admin_password) {
    if (config.nodeEnv === 'production') {
      return res.status(403).json({ error: 'Direct password voiding is disabled in production. Use authenticated admin session.' });
    }

    const adminUser = await prisma.user.findFirst({
      where: {
        username: admin_username,
        role: Role.ADMIN,
        active: true
      }
    });

    const expectedPassword = process.env.AQ_ADMIN_PASSWORD;
    if (adminUser && expectedPassword && admin_password === expectedPassword) {
      adminId = adminUser.id;
    } else {
      return res.status(403).json({ error: 'Invalid void approval credentials' });
    }
  }

  if (!adminId) {
    return res.status(403).json({ error: 'Administrator authorization required for void' });
  }

  try {
    const result = await SalesService.voidSale(saleId, adminId, reason);
    return res.status(200).json(result);
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message || 'Void processing failed' });
  }
});

export default router;
