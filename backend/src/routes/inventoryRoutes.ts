import { Router, Request, Response } from 'express';
import { InventoryService } from '../services/inventoryService.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { Role } from '@prisma/client';

const router = Router();

// Staff/Admin inventory monitoring & ledger
router.get('/', authenticate, requireRole([Role.ADMIN, Role.STAFF]), async (req: Request, res: Response) => {
  if (req.query.ledger === '1' || req.query.ledger === 'true') {
    const limit = Number(req.query.limit) || 500;
    const ledger = await InventoryService.getLedger(limit);
    return res.json(ledger);
  }

  const status = await InventoryService.getInventoryStatus();
  return res.json(status);
});

// Admin restock or count adjustment
router.post('/', authenticate, requireRole(Role.ADMIN), async (req: Request, res: Response) => {
  const { product_id, type, quantity, notes } = req.body;
  if (!product_id || !type || quantity === undefined) {
    return res.status(422).json({ error: 'product_id, type, and quantity are required' });
  }

  if (type !== 'RESTOCK' && type !== 'ADJUSTMENT') {
    return res.status(422).json({ error: 'type must be RESTOCK or ADJUSTMENT' });
  }

  try {
    const result = await InventoryService.adjustStock({
      productId: Number(product_id),
      type,
      quantity: Number(quantity),
      userId: req.user!.id,
      notes
    });

    return res.status(200).json(result);
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message || 'Inventory adjustment failed' });
  }
});

export default router;
