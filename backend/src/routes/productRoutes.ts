import { Router, Request, Response } from 'express';
import { ProductService } from '../services/productService.js';
import { optionalAuth, authenticate, requireRole } from '../middleware/auth.js';
import { Role } from '@prisma/client';

const router = Router();

// Public catalog with optional auth (to reveal production_cost for Admin)
router.get('/', optionalAuth, async (req: Request, res: Response) => {
  const includeInactive = req.query.include_inactive === '1' || req.query.include_inactive === 'true';
  const products = await ProductService.listProducts(req.user?.role, includeInactive);
  return res.json(products);
});

// Admin create product
router.post('/', authenticate, requireRole(Role.ADMIN), async (req: Request, res: Response) => {
  try {
    const product = await ProductService.createProduct(req.body);
    return res.status(200).json(product);
  } catch (err: any) {
    return res.status(422).json({ error: err.message || 'Product creation failed' });
  }
});

// Admin update product
router.patch('/', authenticate, requireRole(Role.ADMIN), async (req: Request, res: Response) => {
  const id = Number(req.body.id);
  if (!id) {
    return res.status(422).json({ error: 'Product id is required' });
  }

  try {
    const updated = await ProductService.updateProduct(id, req.body);
    return res.status(200).json(updated);
  } catch (err: any) {
    return res.status(422).json({ error: err.message || 'Product update failed' });
  }
});

export default router;
