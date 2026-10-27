import { Router, Request, Response } from 'express';
import { ProductService } from '../services/productService.js';
import { optionalAuth, authenticate, requireRole } from '../middleware/auth.js';
import { Role } from '@prisma/client';
import { z } from 'zod';

const router = Router();

const createProductSchema = z.object({
  sku: z.string().trim().min(1, 'SKU is required').transform(s => s.toUpperCase()),
  name: z.string().trim().min(1, 'Product name is required').transform(s => s.replace(/\s+/g, ' ')),
  category_id: z.coerce.number().int().positive('Valid category ID required'),
  product_type: z.enum(['REFILL', 'CONTAINER_WITH_WATER', 'EMPTY_CONTAINER', 'ACCESSORY']).optional(),
  volume_label: z.string().trim().optional().transform(s => (s ? s.replace(/\s+/g, ' ') : '5-Gallon')),
  image_url: z.string().trim().optional().nullable(),
  selling_price: z.coerce.number().positive('Selling price must be positive'),
  production_cost: z.coerce.number().nonnegative().optional(),
  reorder_pt: z.coerce.number().int().nonnegative().optional(),
  lead_time_days: z.coerce.number().int().nonnegative().optional(),
  safety_stock: z.coerce.number().int().nonnegative().optional(),
  active: z.coerce.boolean().optional()
});

const updateProductSchema = z.object({
  id: z.coerce.number().int().positive('Valid product ID required'),
  name: z.string().trim().min(1).transform(s => s.replace(/\s+/g, ' ')).optional(),
  category_id: z.coerce.number().int().positive().optional(),
  product_type: z.enum(['REFILL', 'CONTAINER_WITH_WATER', 'EMPTY_CONTAINER', 'ACCESSORY']).optional(),
  volume_label: z.string().trim().transform(s => s.replace(/\s+/g, ' ')).optional(),
  image_url: z.string().trim().optional().nullable(),
  selling_price: z.coerce.number().positive().optional(),
  production_cost: z.coerce.number().nonnegative().optional(),
  reorder_pt: z.coerce.number().int().nonnegative().optional(),
  lead_time_days: z.coerce.number().int().nonnegative().optional(),
  safety_stock: z.coerce.number().int().nonnegative().optional(),
  active: z.coerce.boolean().optional()
});

// Public catalog with optional auth (to reveal production_cost for Admin)
router.get('/', optionalAuth, async (req: Request, res: Response) => {
  const includeInactive = req.query.include_inactive === '1' || req.query.include_inactive === 'true';
  const products = await ProductService.listProducts(req.user?.role, includeInactive);
  return res.json(products);
});

// Admin create product
router.post('/', authenticate, requireRole(Role.ADMIN), async (req: Request, res: Response) => {
  const parsed = createProductSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return res.status(422).json({ error: issue?.message || 'Invalid product payload' });
  }

  try {
    const product = await ProductService.createProduct(parsed.data);
    return res.status(200).json(product);
  } catch (err: any) {
    return res.status(err.status || 422).json({ error: err.message || 'Product creation failed' });
  }
});

// Admin update product
router.patch('/', authenticate, requireRole(Role.ADMIN), async (req: Request, res: Response) => {
  const parsed = updateProductSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return res.status(422).json({ error: issue?.message || 'Invalid product payload' });
  }

  try {
    const { id, ...data } = parsed.data;
    const updated = await ProductService.updateProduct(id, data);
    return res.status(200).json(updated);
  } catch (err: any) {
    return res.status(err.status || 422).json({ error: err.message || 'Product update failed' });
  }
});

export default router;
