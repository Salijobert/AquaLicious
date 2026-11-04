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
// include_inactive is strictly Admin-only; customers and logged-out callers always get active: true only
router.get('/', optionalAuth, async (req: Request, res: Response) => {
  const isAdmin = req.user?.role === Role.ADMIN;
  const requestedInactive = req.query.include_inactive === '1' || req.query.include_inactive === 'true';
  const includeInactive = isAdmin && requestedInactive;
  const products = await ProductService.listProducts(req.user?.role, includeInactive);
  return res.json(products);
});

// Admin product usage inspection (for delete/archive confirmation dialog)
router.get('/:id/usage', authenticate, requireRole(Role.ADMIN), async (req: Request, res: Response) => {
  const rawId = req.params.id || req.query.id;
  const parsedId = z.coerce.number().int().positive().safeParse(rawId);
  if (!parsedId.success) {
    return res.status(422).json({ error: 'Valid product ID required' });
  }

  try {
    const usage = await ProductService.getProductUsage(parsedId.data);
    return res.status(200).json(usage);
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message || 'Failed to inspect product' });
  }
});

// Legacy/root alias for usage inspection (/usage?id=123)
router.get('/usage', authenticate, requireRole(Role.ADMIN), async (req: Request, res: Response) => {
  const rawId = req.query.id;
  const parsedId = z.coerce.number().int().positive().safeParse(rawId);
  if (!parsedId.success) {
    return res.status(422).json({ error: 'Valid product ID required' });
  }

  try {
    const usage = await ProductService.getProductUsage(parsedId.data);
    return res.status(200).json(usage);
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message || 'Failed to inspect product' });
  }
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
    const msg = err.message || 'Product creation failed';
    return res.status(err.status || 422).json({ error: msg, message: msg });
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
    const msg = err.message || 'Product update failed';
    return res.status(err.status || 422).json({ error: msg, message: msg });
  }
});

const deleteProductSchema = z.object({
  id: z.coerce.number().int().positive('Valid product ID required'),
  zero_stock: z.coerce.boolean().optional(),
  reason: z.string().trim().optional()
});

// Admin delete or archive product (:id parameter or ?id= query param for legacy alias)
const handleDeleteProduct = async (req: Request, res: Response) => {
  const rawId = req.params.id || req.query.id || req.body?.id;
  const parsed = deleteProductSchema.safeParse({
    id: rawId,
    zero_stock: req.body?.zero_stock ?? req.query.zero_stock,
    reason: req.body?.reason ?? req.query.reason
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return res.status(422).json({ error: issue?.message || 'Valid product ID required' });
  }

  try {
    const result = await ProductService.deleteProduct(
      parsed.data.id,
      req.user!.id,
      { zero_stock: parsed.data.zero_stock, reason: parsed.data.reason }
    );
    return res.status(200).json(result);
  } catch (err: any) {
    const msg = err.message || 'Product deletion failed';
    return res.status(err.status || 500).json({ error: msg, message: msg });
  }
};

router.delete('/:id', authenticate, requireRole(Role.ADMIN), handleDeleteProduct);
router.delete('/', authenticate, requireRole(Role.ADMIN), handleDeleteProduct);

// Admin restore archived product
const handleRestoreProduct = async (req: Request, res: Response) => {
  const rawId = req.params.id || req.query.id || req.body?.id;
  const parsedId = z.coerce.number().int().positive().safeParse(rawId);
  if (!parsedId.success) {
    return res.status(422).json({ error: 'Valid product ID required' });
  }

  try {
    const result = await ProductService.restoreProduct(parsedId.data, req.user!.id);
    return res.status(200).json(result);
  } catch (err: any) {
    const msg = err.message || 'Product restore failed';
    return res.status(err.status || 500).json({ error: msg, message: msg });
  }
};

router.post('/:id/restore', authenticate, requireRole(Role.ADMIN), handleRestoreProduct);
router.post('/restore', authenticate, requireRole(Role.ADMIN), handleRestoreProduct);

export default router;
