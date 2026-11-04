import { prisma } from '../config/index.js';
import { Role, ProductType, OrderStatus, PaymentStatus, MovementType } from '@prisma/client';
import { sanitize } from '../middleware/security.js';

export const ACTIVE_ORDER_STATUSES = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY_FOR_PICKUP,
  OrderStatus.OUT_FOR_DELIVERY
];

export class ProductService {
  /**
   * Retrieves products. If user is ADMIN, includes production_cost and inactive products.
   * Otherwise returns only active products without production_cost.
   */
  static async listProducts(role?: Role, includeInactive = false) {
    const isAdmin = role === Role.ADMIN;
    const whereClause = isAdmin && includeInactive ? {} : { active: true };

    const products = await prisma.product.findMany({
      where: whereClause,
      include: {
        category: {
          select: { id: true, name: true }
        }
      },
      orderBy: { id: 'asc' }
    });

    return products.map(p => {
      const base: any = {
        id: p.id,
        sku: p.sku,
        name: p.name,
        category_id: p.categoryId,
        category: p.category.name,
        product_type: p.productType,
        volume_label: p.volumeLabel,
        image_url: p.imageUrl,
        selling_price: Number(p.sellingPrice).toFixed(2),
        stock: p.stock,
        reorder_pt: p.reorderPt,
        lead_time_days: p.leadTimeDays,
        safety_stock: p.safetyStock,
        active: p.active ? 1 : 0
      };

      if (isAdmin) {
        base.production_cost = Number(p.productionCost).toFixed(2);
      }

      return base;
    });
  }

  static async getById(id: number, role?: Role) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: { category: true }
    });

    if (!product) return null;
    const isAdmin = role === Role.ADMIN;

    const base: any = {
      id: product.id,
      sku: product.sku,
      name: product.name,
      category_id: product.categoryId,
      category: product.category.name,
      product_type: product.productType,
      volume_label: product.volumeLabel,
      image_url: product.imageUrl,
      selling_price: Number(product.sellingPrice).toFixed(2),
      stock: product.stock,
      reorder_pt: product.reorderPt,
      lead_time_days: product.leadTimeDays,
      safety_stock: product.safetyStock,
      active: product.active ? 1 : 0
    };

    if (isAdmin) {
      base.production_cost = Number(product.productionCost).toFixed(2);
    }

    return base;
  }

  static async createProduct(data: {
    sku: string;
    name: string;
    category_id: number;
    product_type?: ProductType;
    volume_label?: string;
    image_url?: string | null;
    selling_price: number | string;
    production_cost?: number | string;
    reorder_pt?: number;
    lead_time_days?: number;
    safety_stock?: number;
    active?: boolean;
  }) {
    const sku = sanitize(data.sku).trim().toUpperCase();
    const name = sanitize(data.name).trim().replace(/\s+/g, ' ');
    const volumeLabel = (sanitize(data.volume_label || '') || '5-Gallon').trim().replace(/\s+/g, ' ');

    // Conflict check on lower(trim(name)) + lower(trim(volumeLabel))
    const existingConflict: any[] = await prisma.$queryRaw`
      SELECT id, name, "volumeLabel", active
      FROM products
      WHERE lower(trim(name)) = lower(trim(${name}))
        AND lower(trim("volumeLabel")) = lower(trim(${volumeLabel}))
      LIMIT 1
    `;

    if (existingConflict.length > 0) {
      const conflict = existingConflict[0];
      if (!conflict.active) {
        throw {
          status: 409,
          message: `A product with name '${name}' and volume '${volumeLabel}' already exists in the archive (ID: ${conflict.id}). You can restore it from Archived Products instead.`
        };
      }
      throw {
        status: 409,
        message: `A product with name '${name}' and volume '${volumeLabel}' already exists (ID: ${conflict.id})`
      };
    }

    return prisma.product.create({
      data: {
        sku,
        name,
        categoryId: Number(data.category_id),
        productType: data.product_type || ProductType.REFILL,
        volumeLabel,
        imageUrl: data.image_url ? sanitize(data.image_url) : null,
        sellingPrice: Number(data.selling_price),
        productionCost: Number(data.production_cost || 0),
        stock: 0, // Stock changes must happen through inventory movements
        reorderPt: Number(data.reorder_pt || 0),
        leadTimeDays: Number(data.lead_time_days || 2),
        safetyStock: Number(data.safety_stock || 10),
        active: data.active !== undefined ? !!data.active : true
      }
    });
  }

  static async updateProduct(id: number, data: any) {
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw { status: 404, message: 'Product not found' };
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = sanitize(data.name).trim().replace(/\s+/g, ' ');
    if (data.volume_label !== undefined) updateData.volumeLabel = sanitize(data.volume_label).trim().replace(/\s+/g, ' ');

    const finalName = updateData.name !== undefined ? updateData.name : existing.name;
    const finalVolume = updateData.volumeLabel !== undefined ? updateData.volumeLabel : existing.volumeLabel;

    if (updateData.name !== undefined || updateData.volumeLabel !== undefined) {
      const existingConflict: any[] = await prisma.$queryRaw`
        SELECT id, name, "volumeLabel", active
        FROM products
        WHERE lower(trim(name)) = lower(trim(${finalName}))
          AND lower(trim("volumeLabel")) = lower(trim(${finalVolume}))
          AND id != ${id}
        LIMIT 1
      `;

      if (existingConflict.length > 0) {
        const conflict = existingConflict[0];
        if (!conflict.active) {
          throw {
            status: 409,
            message: `A product with name '${finalName}' and volume '${finalVolume}' already exists in the archive (ID: ${conflict.id}). You can restore it from Archived Products instead.`
          };
        }
        throw {
          status: 409,
          message: `A product with name '${finalName}' and volume '${finalVolume}' already exists (ID: ${conflict.id})`
        };
      }
    }

    if (data.category_id !== undefined) updateData.categoryId = Number(data.category_id);
    if (data.product_type !== undefined) updateData.productType = data.product_type;
    if (data.image_url !== undefined) updateData.imageUrl = data.image_url ? sanitize(data.image_url) : null;
    if (data.selling_price !== undefined) updateData.sellingPrice = Number(data.selling_price);
    if (data.production_cost !== undefined) updateData.productionCost = Number(data.production_cost);
    if (data.reorder_pt !== undefined) updateData.reorderPt = Number(data.reorder_pt);
    if (data.lead_time_days !== undefined) updateData.leadTimeDays = Number(data.lead_time_days);
    if (data.safety_stock !== undefined) updateData.safetyStock = Number(data.safety_stock);
    if (data.active !== undefined) updateData.active = Boolean(data.active);

    return prisma.product.update({
      where: { id },
      data: updateData
    });
  }

  /**
   * Pre-flight usage inspector: counts active orders, sale items, stock movements.
   */
  static async getProductUsage(id: number) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } }
      }
    });

    if (!product) {
      throw { status: 404, message: 'Product not found' };
    }

    const activeOrdersCount = await prisma.salesOrderItem.count({
      where: {
        productId: id,
        salesOrder: {
          OR: [
            { orderStatus: { in: ACTIVE_ORDER_STATUSES } },
            { paymentStatus: PaymentStatus.REFUND_REQUIRED }
          ]
        }
      }
    });

    const salesCount = await prisma.salesOrderItem.count({
      where: { productId: id }
    });

    const movementsCount = await prisma.stockMovement.count({
      where: { productId: id }
    });

    const isUsed = salesCount > 0 || movementsCount > 0;
    const isBlocked = activeOrdersCount > 0;
    const canDelete = !isUsed && !isBlocked;

    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      volume_label: product.volumeLabel,
      stock: product.stock,
      active: product.active,
      category: product.category.name,
      sales_count: salesCount,
      movements_count: movementsCount,
      active_orders_count: activeOrdersCount,
      is_used: isUsed,
      is_blocked: isBlocked,
      can_delete: canDelete
    };
  }

  /**
   * Deletes an unused product permanently, or archives a used product.
   * Runs in a single interactive transaction with row locking in ascending ID order.
   */
  static async deleteProduct(id: number, adminUserId: number, options?: { zero_stock?: boolean; reason?: string }) {
    return prisma.$transaction(async (tx) => {
      // 1. Lock row in ascending ID order (SELECT ... FOR UPDATE)
      const rows: any[] = await tx.$queryRaw`
        SELECT id, sku, name, "volumeLabel", stock, active
        FROM products
        WHERE id = ${id}
        FOR UPDATE
      `;

      if (!rows || rows.length === 0) {
        throw { status: 404, message: 'Product not found' };
      }

      const product = rows[0];

      // 2. Check for active/pending orders or outstanding refund obligations
      const activeOrdersCount = await tx.salesOrderItem.count({
        where: {
          productId: id,
          salesOrder: {
            OR: [
              { orderStatus: { in: ACTIVE_ORDER_STATUSES } },
              { paymentStatus: PaymentStatus.REFUND_REQUIRED }
            ]
          }
        }
      });

      if (activeOrdersCount > 0) {
        throw {
          status: 409,
          message: `Cannot delete or archive product: product is in ${activeOrdersCount} active or pending order(s). Please complete, cancel, or refund those orders first.`
        };
      }

      // 3. Count historical references in sales_order_items and stock_movements
      const salesCount = await tx.salesOrderItem.count({ where: { productId: id } });
      const movementsCount = await tx.stockMovement.count({ where: { productId: id } });
      const isUsed = salesCount > 0 || movementsCount > 0;

      // Case A: UNUSED product -> permanently delete
      if (!isUsed) {
        await tx.product.delete({ where: { id } });

        await tx.auditLog.create({
          data: {
            userId: adminUserId,
            action: 'PRODUCT_DELETED',
            entity: 'Product',
            entityId: id,
            details: JSON.stringify({
              id,
              sku: product.sku,
              name: product.name,
              volume_label: product.volumeLabel,
              stock: Number(product.stock),
              action: 'permanently_deleted',
              reason: sanitize(options?.reason || '') || 'Admin permanently deleted unused product'
            })
          }
        });

        return {
          action: 'deleted',
          message: `Product '${product.name}' was permanently deleted.`,
          id,
          name: product.name,
          sku: product.sku
        };
      }

      // Case B: USED product -> archive (soft-delete)
      // If admin opted to zero stock first
      if (options?.zero_stock && Number(product.stock) > 0) {
        const prevStock = Number(product.stock);
        await tx.product.update({
          where: { id },
          data: { stock: 0 }
        });

        await tx.stockMovement.create({
          data: {
            productId: id,
            movementType: MovementType.ADJUSTMENT,
            quantityChange: -prevStock,
            previousBalance: prevStock,
            newBalance: 0,
            userId: adminUserId,
            notes: 'Stock zeroed out prior to product archival'
          }
        });
      }

      // Idempotency check: already archived
      if (!product.active) {
        return {
          action: 'archived',
          message: `Product '${product.name}' is already archived.`,
          id,
          name: product.name,
          sku: product.sku,
          idempotent: true
        };
      }

      await tx.product.update({
        where: { id },
        data: { active: false }
      });

      await tx.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'PRODUCT_ARCHIVED',
          entity: 'Product',
          entityId: id,
          details: JSON.stringify({
            id,
            sku: product.sku,
            name: product.name,
            volume_label: product.volumeLabel,
            stock: options?.zero_stock ? 0 : Number(product.stock),
            references: { sales: salesCount, movements: movementsCount },
            reason: sanitize(options?.reason || '') || 'Admin archived product with transaction history'
          })
        }
      });

      return {
        action: 'archived',
        message: `Product '${product.name}' has transaction history and was archived.`,
        id,
        name: product.name,
        sku: product.sku,
        references: { sales: salesCount, movements: movementsCount },
        stock: options?.zero_stock ? 0 : Number(product.stock)
      };
    });
  }

  /**
   * Restores an archived product to active status.
   * Verifies no conflict exists with active products having the same normalized (name, volumeLabel).
   */
  static async restoreProduct(id: number, adminUserId: number) {
    return prisma.$transaction(async (tx) => {
      const rows: any[] = await tx.$queryRaw`
        SELECT id, sku, name, "volumeLabel", stock, active
        FROM products
        WHERE id = ${id}
        FOR UPDATE
      `;

      if (!rows || rows.length === 0) {
        throw { status: 404, message: 'Product not found' };
      }

      const product = rows[0];

      if (product.active) {
        return {
          action: 'restored',
          message: `Product '${product.name}' is already active.`,
          id,
          name: product.name,
          sku: product.sku,
          idempotent: true
        };
      }

      // Check unique constraint against active products
      const activeConflict: any[] = await tx.$queryRaw`
        SELECT id, name, "volumeLabel"
        FROM products
        WHERE lower(trim(name)) = lower(trim(${product.name}))
          AND lower(trim("volumeLabel")) = lower(trim(${product.volumeLabel}))
          AND id != ${id}
          AND active = true
        LIMIT 1
      `;

      if (activeConflict.length > 0) {
        throw {
          status: 409,
          message: `Cannot restore product: an active product with name '${product.name}' and volume '${product.volumeLabel}' already exists (ID: ${activeConflict[0].id}). Please rename or archive that product first.`
        };
      }

      await tx.product.update({
        where: { id },
        data: { active: true }
      });

      await tx.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'PRODUCT_RESTORED',
          entity: 'Product',
          entityId: id,
          details: JSON.stringify({
            id,
            sku: product.sku,
            name: product.name,
            volume_label: product.volumeLabel,
            stock: Number(product.stock),
            action: 'restored'
          })
        }
      });

      return {
        action: 'restored',
        message: `Product '${product.name}' was successfully restored.`,
        id,
        name: product.name,
        sku: product.sku
      };
    });
  }
}
