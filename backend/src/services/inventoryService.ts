import { prisma } from '../config/index.js';
import { MovementType, Role } from '@prisma/client';
import { sanitize } from '../middleware/security.js';
import { subDays, startOfDay, endOfDay } from 'date-fns';

export class InventoryService {
  /**
   * Retrieves inventory status with calculated ROP and 7-day usage metrics.
   */
  static async getInventoryStatus() {
    const products = await prisma.product.findMany({
      where: { active: true },
      include: { category: true },
      orderBy: { id: 'asc' }
    });

    // 7-day window for average daily usage (excluding today, matching Asia/Manila calendar requirement)
    const now = new Date();
    const endWindow = endOfDay(subDays(now, 1));
    const startWindow = startOfDay(subDays(now, 7));

    // Get units sold per product in the 7-day window
    const recentSales = await prisma.salesOrderItem.groupBy({
      by: ['productId'],
      where: {
        salesOrder: {
          orderStatus: { in: ['COMPLETED', 'CONFIRMED'] },
          createdAt: {
            gte: startWindow,
            lte: endWindow
          }
        }
      },
      _sum: {
        quantity: true
      }
    });

    const salesMap = new Map<number, number>();
    recentSales.forEach(item => {
      salesMap.set(item.productId, item._sum.quantity || 0);
    });

    return products.map(p => {
      const sevenDayUnits = salesMap.get(p.id) || 0;
      const adu = sevenDayUnits / 7;
      const calculatedRop = Math.ceil(adu * p.leadTimeDays + p.safetyStock);
      const effectiveRop = Math.max(p.reorderPt, calculatedRop);

      let status = 'Normal';
      if (p.stock <= effectiveRop) {
        status = 'Critical';
      } else if (p.stock < Math.ceil(1.5 * effectiveRop)) {
        status = 'Warning';
      }

      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        category: p.category.name,
        stock: p.stock,
        reorder_pt: p.reorderPt,
        calculated_rop: calculatedRop,
        effective_rop: effectiveRop,
        seven_day_usage: sevenDayUnits,
        average_daily_usage: Number(adu.toFixed(2)),
        status
      };
    });
  }

  /**
   * Retrieves the immutable stock movements ledger.
   */
  static async getLedger(limit = 500) {
    const movements = await prisma.stockMovement.findMany({
      take: limit,
      orderBy: { id: 'desc' },
      include: {
        product: { select: { sku: true, name: true } },
        user: { select: { name: true, username: true } }
      }
    });

    return movements.map(m => ({
      id: m.id,
      product_id: m.productId,
      sku: m.product.sku,
      product_name: m.product.name,
      movement_type: m.movementType,
      type: m.movementType,
      change_qty: m.quantityChange,
      quantity_delta: m.quantityChange,
      previous_balance: m.previousBalance,
      balance_before: m.previousBalance,
      new_balance: m.newBalance,
      balance_after: m.newBalance,
      user_id: m.userId,
      user_name: m.user.name,
      notes: m.notes,
      logged_at: m.createdAt.toISOString(),
      created_at: m.createdAt.toISOString()
    }));
  }

  /**
   * Restocks or adjusts product stock atomically with pessimistic row lock.
   */
  static async adjustStock(params: {
    productId: number;
    type: 'RESTOCK' | 'ADJUSTMENT';
    quantity: number;
    userId: number;
    notes?: string;
  }) {
    const { productId, type, quantity, userId, notes } = params;

    if (quantity < 0) {
      throw new Error('Quantity cannot be negative');
    }

    return prisma.$transaction(async (tx) => {
      // Pessimistic row locking via raw SQL
      const rows: any[] = await tx.$queryRaw`
        SELECT id, name, stock, active, "productionCost", "sellingPrice" 
        FROM products 
        WHERE id = ${productId} 
        FOR UPDATE
      `;

      if (!rows || rows.length === 0) {
        throw new Error('Product not found');
      }

      const product = rows[0];
      if (!product.active) {
        throw new Error(`Cannot adjust or restock archived product #${productId} (${product.name || 'Inactive'})`);
      }
      const previousBalance = Number(product.stock);
      let newBalance: number;
      let changeQty: number;

      if (type === 'RESTOCK') {
        changeQty = quantity;
        newBalance = previousBalance + changeQty;
      } else {
        // ADJUSTMENT sets the counted balance
        newBalance = quantity;
        changeQty = newBalance - previousBalance;
      }

      // Update product stock
      await tx.product.update({
        where: { id: productId },
        data: { stock: newBalance }
      });

      // Insert immutable stock movement record
      const movement = await tx.stockMovement.create({
        data: {
          productId,
          movementType: type === 'RESTOCK' ? MovementType.RESTOCK : MovementType.ADJUSTMENT,
          quantityChange: changeQty,
          previousBalance,
          newBalance,
          userId,
          notes: sanitize(notes) || (type === 'RESTOCK' ? 'Manual Restock' : 'Stock Count Adjustment')
        }
      });

      return {
        product_id: productId,
        previous_balance: previousBalance,
        change_qty: changeQty,
        new_balance: newBalance,
        movement_id: movement.id
      };
    });
  }
}
