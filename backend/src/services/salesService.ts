import { prisma } from '../config/index.js';
import { MovementType, OrderStatus, OrderType, PaymentMethod, PaymentStatus, Role } from '@prisma/client';
import { sanitize } from '../middleware/security.js';
import crypto from 'crypto';

export class SalesService {
  /**
   * Processes POS sales checkout atomically with row locking in ascending product ID order.
   */
  static async checkout(params: {
    userId: number;
    items: Array<{ product_id: number; qty: number }>;
    cashTendered: number | string;
    expectedTotal?: number | string;
    requestKey?: string;
  }) {
    const { userId, items, cashTendered, expectedTotal, requestKey } = params;

    if (!items || items.length === 0) {
      throw { status: 422, message: 'Cart items cannot be empty' };
    }

    // Aggregate duplicate product lines
    const itemMap = new Map<number, number>();
    for (const item of items) {
      const pid = Number(item.product_id);
      const qty = Number(item.qty);
      if (!pid || qty <= 0 || !Number.isInteger(qty)) {
        throw { status: 422, message: 'Invalid product quantity' };
      }
      itemMap.set(pid, (itemMap.get(pid) || 0) + qty);
    }

    // Sort product IDs ascending to prevent database deadlocks
    const sortedProductIds = Array.from(itemMap.keys()).sort((a, b) => a - b);
    const cash = Number(cashTendered);
    if (isNaN(cash) || cash < 0) {
      throw { status: 422, message: 'Invalid cash tendered amount' };
    }

    return prisma.$transaction(async (tx) => {
      // 1. Lock rows in ascending product ID order
      const lockedProducts: any[] = [];
      for (const pid of sortedProductIds) {
        const rows: any[] = await tx.$queryRaw`
          SELECT id, sku, name, "sellingPrice", "productionCost", stock, active 
          FROM products 
          WHERE id = ${pid} 
          FOR UPDATE
        `;

        if (!rows || rows.length === 0) {
          throw { status: 404, message: `Product ${pid} not found` };
        }
        const prod = rows[0];
        if (!prod.active) {
          throw { status: 409, message: `Product ${prod.name} is inactive` };
        }
        lockedProducts.push(prod);
      }

      // 2. Calculate server-authoritative totals and verify stock
      let calculatedSubtotal = 0;
      const orderLines: Array<{
        productId: number;
        productName: string;
        sku: string;
        quantity: number;
        unitPrice: number;
        unitCostSnapshot: number;
        subtotal: number;
        previousStock: number;
      }> = [];

      for (const prod of lockedProducts) {
        const qty = itemMap.get(prod.id)!;
        const currentStock = Number(prod.stock);
        if (currentStock < qty) {
          throw {
            status: 409,
            message: `Insufficient stock for ${prod.name} (available: ${currentStock}, requested: ${qty})`
          };
        }

        const price = Number(prod.sellingPrice);
        const cost = Number(prod.productionCost);
        const lineTotal = price * qty;
        calculatedSubtotal += lineTotal;

        orderLines.push({
          productId: prod.id,
          productName: prod.name,
          sku: prod.sku,
          quantity: qty,
          unitPrice: price,
          unitCostSnapshot: cost,
          subtotal: lineTotal,
          previousStock: currentStock
        });
      }

      const totalAmount = calculatedSubtotal;

      // 3. Compare with expected_total if supplied
      if (expectedTotal !== undefined && expectedTotal !== null && expectedTotal !== '') {
        const exp = Number(expectedTotal);
        if (Math.abs(exp - totalAmount) > 0.01) {
          throw {
            status: 409,
            message: `Stale POS total rejected before charging. Expected ${exp}, server calculated ${totalAmount}`
          };
        }
      }

      // 4. Validate cash tendered
      if (cash < totalAmount) {
        throw {
          status: 422,
          message: `Insufficient cash tendered. Total is ${totalAmount}, but only ${cash} was provided.`
        };
      }
      const changeDue = cash - totalAmount;
      const orderNumber = `POS-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

      // 5. Create SalesOrder
      const salesOrder = await tx.salesOrder.create({
        data: {
          orderNumber,
          userId,
          orderType: OrderType.WALK_IN_POS,
          subtotal: calculatedSubtotal,
          tax: 0,
          discount: 0,
          totalAmount,
          cashTendered: cash,
          changeDue,
          paymentMethod: PaymentMethod.CASH,
          paymentStatus: PaymentStatus.VERIFIED,
          orderStatus: OrderStatus.COMPLETED,
          requestKey: requestKey || null,
          items: {
            create: orderLines.map(l => ({
              productId: l.productId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              unitCostSnapshot: l.unitCostSnapshot,
              subtotal: l.subtotal
            }))
          }
        },
        include: { items: true }
      });

      // 6. Deduct stock and write immutable movements
      for (const line of orderLines) {
        const newStock = line.previousStock - line.quantity;
        await tx.product.update({
          where: { id: line.productId },
          data: { stock: newStock }
        });

        await tx.stockMovement.create({
          data: {
            productId: line.productId,
            movementType: MovementType.SALE,
            quantityChange: -line.quantity,
            previousBalance: line.previousStock,
            newBalance: newStock,
            referenceId: salesOrder.id,
            userId,
            notes: `POS Sale #${salesOrder.orderNumber}`
          }
        });
      }

      return {
        id: salesOrder.id,
        order_number: salesOrder.orderNumber,
        subtotal: Number(salesOrder.subtotal).toFixed(2),
        total: Number(salesOrder.totalAmount).toFixed(2),
        cash_tendered: Number(salesOrder.cashTendered).toFixed(2),
        change_due: Number(salesOrder.changeDue).toFixed(2),
        status: salesOrder.orderStatus,
        payment_status: salesOrder.paymentStatus,
        created_at: salesOrder.createdAt.toISOString(),
        items: orderLines.map(l => ({
          product_id: l.productId,
          product_name: l.productName,
          sku: l.sku,
          qty: l.quantity,
          unit_price: Number(l.unitPrice).toFixed(2),
          unit_cost_snapshot: Number(l.unitCostSnapshot).toFixed(2),
          subtotal: Number(l.subtotal).toFixed(2)
        }))
      };
    });
  }

  /**
   * Retrieves sales records with receipt line items.
   */
  static async listSales(limit = 500) {
    const orders = await prisma.salesOrder.findMany({
      where: { orderType: OrderType.WALK_IN_POS },
      take: limit,
      orderBy: { id: 'desc' },
      include: {
        user: { select: { name: true, username: true } },
        items: {
          include: {
            product: { select: { name: true, sku: true } }
          }
        }
      }
    });

    return orders.map(o => ({
      id: o.id,
      order_number: o.orderNumber,
      cashier: o.user.name,
      total: Number(o.totalAmount).toFixed(2),
      cash_tendered: o.cashTendered ? Number(o.cashTendered).toFixed(2) : null,
      change_due: o.changeDue ? Number(o.changeDue).toFixed(2) : null,
      status: o.orderStatus,
      sold_at: o.createdAt.toISOString(),
      items: o.items.map(i => ({
        product_id: i.productId,
        product_name: i.product.name,
        sku: i.product.sku,
        qty: i.quantity,
        unit_price: Number(i.unitPrice).toFixed(2),
        unit_cost_snapshot: Number(i.unitCostSnapshot).toFixed(2),
        subtotal: Number(i.subtotal).toFixed(2)
      }))
    }));
  }

  static async getById(id: number) {
    const order = await prisma.salesOrder.findUnique({
      where: { id },
      include: {
        user: { select: { name: true, username: true } },
        items: {
          include: { product: { select: { name: true, sku: true } } }
        }
      }
    });

    if (!order) return null;

    return {
      id: order.id,
      order_number: order.orderNumber,
      cashier: order.user.name,
      total: Number(order.totalAmount).toFixed(2),
      cash_tendered: order.cashTendered ? Number(order.cashTendered).toFixed(2) : null,
      change_due: order.changeDue ? Number(order.changeDue).toFixed(2) : null,
      status: order.orderStatus,
      sold_at: order.createdAt.toISOString(),
      items: order.items.map(i => ({
        product_id: i.productId,
        product_name: i.product.name,
        sku: i.product.sku,
        qty: i.quantity,
        unit_price: Number(i.unitPrice).toFixed(2),
        unit_cost_snapshot: Number(i.unitCostSnapshot).toFixed(2),
        subtotal: Number(i.subtotal).toFixed(2)
      }))
    };
  }

  /**
   * Voids a completed sale, restoring inventory exactly once.
   */
  static async voidSale(id: number, adminId: number, reason: string) {
    const existing = await prisma.salesOrder.findUnique({
      where: { id },
      include: { items: true }
    });

    if (!existing) {
      throw { status: 404, message: 'Sale not found' };
    }

    // Repeated void is harmless and returns status VOIDED without double-restoring stock
    if (existing.orderStatus === OrderStatus.VOIDED) {
      return {
        id: existing.id,
        status: 'VOIDED',
        message: 'Sale was already voided'
      };
    }

    return prisma.$transaction(async (tx) => {
      // 1. Update order status to VOIDED
      const updated = await tx.salesOrder.update({
        where: { id },
        data: {
          orderStatus: OrderStatus.VOIDED,
          paymentStatus: PaymentStatus.REFUNDED,
          voidReason: sanitize(reason) || 'Administrator Void',
          voidedById: adminId,
          voidedAt: new Date()
        }
      });

      // 2. Restore stock for each item and record in ledger
      for (const item of existing.items) {
        const rows: any[] = await tx.$queryRaw`
          SELECT id, stock 
          FROM products 
          WHERE id = ${item.productId} 
          FOR UPDATE
        `;

        if (rows && rows.length > 0) {
          const currentStock = Number(rows[0].stock);
          const restoredStock = currentStock + item.quantity;

          await tx.product.update({
            where: { id: item.productId },
            data: { stock: restoredStock }
          });

          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              movementType: MovementType.VOID_RETURN,
              quantityChange: item.quantity,
              previousBalance: currentStock,
              newBalance: restoredStock,
              referenceId: id,
              userId: adminId,
              notes: `Void reversal for sale #${existing.orderNumber}: ${sanitize(reason)}`
            }
          });
        }
      }

      return {
        id: updated.id,
        order_number: updated.orderNumber,
        status: 'VOIDED',
        void_reason: updated.voidReason,
        voided_at: updated.voidedAt?.toISOString()
      };
    });
  }
}
