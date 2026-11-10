import { prisma } from '../config/index.js';
import { MovementType, OrderStatus, OrderType, PaymentMethod, PaymentStatus, Role } from '@prisma/client';
import { sanitize } from '../middleware/security.js';
import { Mailer } from './mailer.js';
import crypto from 'crypto';

export function computeAllowedOrderActions(order: {
  orderStatus: OrderStatus | string;
  paymentMethod: PaymentMethod | string;
  paymentStatus: PaymentStatus | string;
  orderType: OrderType | string;
}): string[] {
  const isCompleted = order.orderStatus === OrderStatus.COMPLETED || order.orderStatus === 'COMPLETED';
  const isCancelled = order.orderStatus === OrderStatus.CANCELLED || order.orderStatus === 'CANCELLED';
  if (isCompleted || isCancelled) {
    return [];
  }

  const isEWallet =
    order.paymentMethod === PaymentMethod.E_WALLET ||
    order.paymentMethod === 'E_WALLET' ||
    order.paymentMethod === PaymentMethod.GCASH_QR ||
    order.paymentMethod === 'GCASH_QR' ||
    order.paymentMethod === PaymentMethod.MAYA_QR ||
    order.paymentMethod === 'MAYA_QR';

  const isVerified =
    order.paymentStatus === PaymentStatus.VERIFIED ||
    order.paymentStatus === 'VERIFIED' ||
    order.paymentStatus === PaymentStatus.COMPLETED ||
    order.paymentStatus === 'COMPLETED';

  // If E-Wallet and payment is not verified, no fulfillment actions allowed
  if (isEWallet && !isVerified) {
    return ['CANCEL'];
  }

  const isPickup = order.orderType === OrderType.PICKUP || order.orderType === 'PICKUP';
  const isDelivery = order.orderType === OrderType.DELIVERY || order.orderType === 'DELIVERY';

  switch (order.orderStatus) {
    case OrderStatus.PENDING:
    case 'PENDING':
      return [
        'PREPARE',
        isPickup ? 'READY_FOR_PICKUP' : 'OUT_FOR_DELIVERY',
        'CANCEL'
      ];
    case OrderStatus.PREPARING:
    case 'PREPARING':
      return [
        isDelivery ? 'OUT_FOR_DELIVERY' : 'READY_FOR_PICKUP',
        'CANCEL'
      ];
    case OrderStatus.READY_FOR_PICKUP:
    case 'READY_FOR_PICKUP':
    case OrderStatus.OUT_FOR_DELIVERY:
    case 'OUT_FOR_DELIVERY':
      return ['COMPLETED', 'CANCEL'];
    default:
      return [];
  }
}

export class OrderService {
  /**
   * Places a customer order and immediately reserves stock under row locks.
   */
  static async createOrder(params: {
    userId: number;
    items: Array<{ product_id: number; qty: number }>;
    fulfillment: 'PICKUP' | 'DELIVERY';
    address?: string;
    method: 'CASH' | 'E_WALLET' | string;
    expectedTotal?: number | string;
    requestKey?: string;
  }) {
    const { userId, items, fulfillment, address, method, expectedTotal, requestKey } = params;

    if (method !== 'CASH' && method !== 'E_WALLET') {
      throw { status: 422, message: 'Invalid payment method. Only Cash and E-Wallet are accepted.' };
    }

    if (!items || items.length === 0) {
      throw { status: 422, message: 'Cart items cannot be empty' };
    }

    const itemMap = new Map<number, number>();
    for (const item of items) {
      const pid = Number(item.product_id);
      const qty = Number(item.qty);
      if (!pid || qty <= 0 || !Number.isInteger(qty)) {
        throw { status: 422, message: 'Invalid product quantity' };
      }
      itemMap.set(pid, (itemMap.get(pid) || 0) + qty);
    }

    const sortedProductIds = Array.from(itemMap.keys()).sort((a, b) => a - b);
    let receiptLines: Array<{ name: string; qty: number; unitPrice: number; subtotal: number }> = [];

    const createdOrder = await prisma.$transaction(async (tx) => {
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

      // 2. Validate stock and compute server totals
      let calculatedSubtotal = 0;
      const orderLines: any[] = [];

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
            message: `Stale customer total rejected before reserving. Expected ${exp}, server calculated ${totalAmount}`
          };
        }
      }

      const customerRecord = await tx.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true }
      });
      const customerName = sanitize(customerRecord?.name || 'Customer');

      const orderNumber = `ORD-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const pMethod = method === 'E_WALLET' ? PaymentMethod.E_WALLET : PaymentMethod.CASH;
      const oType = fulfillment === 'DELIVERY' ? OrderType.DELIVERY : OrderType.PICKUP;

      // 4. Create Order with status PENDING
      const order = await tx.salesOrder.create({
        data: {
          orderNumber,
          userId,
          customerId: userId,
          customerName,
          orderType: oType,
          deliveryAddress: address ? sanitize(address) : null,
          subtotal: calculatedSubtotal,
          tax: 0,
          discount: 0,
          totalAmount,
          paymentMethod: pMethod,
          paymentStatus: PaymentStatus.PENDING,
          orderStatus: OrderStatus.PENDING,
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

      // 5. Reserve stock immediately and log movement
      for (const line of orderLines) {
        const newStock = line.previousStock - line.quantity;
        await tx.product.update({
          where: { id: line.productId },
          data: { stock: newStock }
        });

        await tx.stockMovement.create({
          data: {
            productId: line.productId,
            movementType: MovementType.ORDER_RESERVATION,
            quantityChange: -line.quantity,
            previousBalance: line.previousStock,
            newBalance: newStock,
            referenceId: order.id,
            userId,
            notes: `Order Reservation #${order.orderNumber}`
          }
        });
      }

      receiptLines = orderLines.map(l => ({
        name: l.productName,
        qty: l.quantity,
        unitPrice: l.unitPrice,
        subtotal: l.subtotal
      }));

      return {
        id: order.id,
        order_number: order.orderNumber,
        customer: customerName,
        user: { name: customerName },
        total: Number(order.totalAmount).toFixed(2),
        payment_method: order.paymentMethod,
        payment_status: order.paymentStatus,
        payment: {
          method: order.paymentMethod,
          status: order.paymentStatus
        },
        status: order.orderStatus,
        fulfillment: order.orderType,
        created_at: order.createdAt.toISOString()
      };
    });

    // 6. Outside transaction & row locks: asynchronous email notifications
    (async () => {
      try {
        const customer = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, name: true }
        });

        if (customer?.email) {
          await Mailer.sendOrderReceipt({
            orderId: createdOrder.id,
            orderNumber: createdOrder.order_number,
            customerEmail: customer.email,
            customerName: createdOrder.customer || customer.name || 'Customer',
            items: receiptLines,
            total: createdOrder.total,
            paymentMethod: createdOrder.payment_method,
            fulfillment: createdOrder.fulfillment,
            address,
            createdAt: createdOrder.created_at,
            userId,
            idempotencyKey: requestKey || undefined
          });
        }

        await Mailer.sendAdminOrderAlert({
          orderId: createdOrder.id,
          orderNumber: createdOrder.order_number,
          customerName: createdOrder.customer || customer?.name || 'Customer',
          total: createdOrder.total,
          paymentMethod: createdOrder.payment_method,
          fulfillment: createdOrder.fulfillment,
          type: 'NEW_ORDER'
        });
      } catch (err: any) {
        console.error('[OrderService] Async post-order email error:', err.message);
      }
    })();

    return createdOrder;
  }

  static async listOrders(user: { id: number; role: Role }, limit = 200) {
    const isCustomer = user.role === Role.CUSTOMER;
    const whereClause = isCustomer ? { userId: user.id } : {};

    const orders = await prisma.salesOrder.findMany({
      where: whereClause,
      take: limit,
      orderBy: { id: 'desc' },
      include: {
        user: { select: { name: true, username: true } },
        items: {
          include: { product: { select: { name: true, sku: true } } }
        }
      }
    });

    return orders.map(o => {
      const customerName = o.customerName || (o.orderType === OrderType.WALK_IN_POS ? 'Walk-in customer' : (o.user?.name || 'Walk-in customer'));
      const paymentMethod = (o.paymentMethod === 'GCASH_QR' || o.paymentMethod === 'MAYA_QR' || o.paymentMethod === 'E_WALLET') ? 'E_WALLET' : 'CASH';

      return {
        id: o.id,
        order_number: o.orderNumber,
        customer: customerName,
        user: {
          name: customerName,
          username: o.user?.username
        },
        total: Number(o.totalAmount).toFixed(2),
        payment_method: paymentMethod,
        payment_status: o.paymentStatus,
        payment: {
          method: paymentMethod,
          status: o.paymentStatus,
          reference_number: o.paymentReference
        },
        reference_number: o.paymentReference,
        has_proof: !!o.proofBase64,
        status: o.orderStatus,
        fulfillment: o.orderType,
        allowed_actions: computeAllowedOrderActions({
          orderStatus: o.orderStatus,
          paymentMethod: o.paymentMethod,
          paymentStatus: o.paymentStatus,
          orderType: o.orderType
        }),
        address: o.deliveryAddress,
        notes: o.notes,
        created_at: o.createdAt.toISOString(),
        items: o.items.map(i => ({
          product_id: i.productId,
          product_name: i.product.name,
          sku: i.product.sku,
          qty: i.quantity,
          unit_price: Number(i.unitPrice).toFixed(2),
          subtotal: Number(i.subtotal).toFixed(2)
        }))
      };
    });
  }

  static async getOrder(id: number, user: { id: number; role: Role }) {
    const order = await prisma.salesOrder.findUnique({
      where: { id },
      include: {
        user: { select: { name: true, username: true } },
        items: {
          include: { product: { select: { name: true, sku: true } } }
        }
      }
    });

    if (!order) {
      throw { status: 404, message: 'Order not found' };
    }

    if (user.role === Role.CUSTOMER && order.userId !== user.id) {
      throw { status: 404, message: 'Order not found' };
    }

    const customerName = order.customerName || (order.orderType === OrderType.WALK_IN_POS ? 'Walk-in customer' : (order.user?.name || 'Walk-in customer'));
    const paymentMethod = (order.paymentMethod === 'GCASH_QR' || order.paymentMethod === 'MAYA_QR' || order.paymentMethod === 'E_WALLET') ? 'E_WALLET' : 'CASH';

    return {
      id: order.id,
      order_number: order.orderNumber,
      customer: customerName,
      user: {
        name: customerName,
        username: order.user?.username
      },
      total: Number(order.totalAmount).toFixed(2),
      payment_method: paymentMethod,
      payment_status: order.paymentStatus,
      payment: {
        method: paymentMethod,
        status: order.paymentStatus,
        reference_number: order.paymentReference
      },
      reference_number: order.paymentReference,
      has_proof: !!order.proofBase64,
      status: order.orderStatus,
      fulfillment: order.orderType,
      allowed_actions: computeAllowedOrderActions({
        orderStatus: order.orderStatus,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        orderType: order.orderType
      }),
      address: order.deliveryAddress,
      notes: order.notes,
      created_at: order.createdAt.toISOString(),
      items: order.items.map(i => ({
        product_id: i.productId,
        product_name: i.product.name,
        sku: i.product.sku,
        qty: i.quantity,
        unit_price: Number(i.unitPrice).toFixed(2),
        subtotal: Number(i.subtotal).toFixed(2)
      }))
    };
  }

  static async getProof(id: number, user: { id: number; role: Role }) {
    const order = await prisma.salesOrder.findUnique({
      where: { id },
      include: {
        user: { select: { name: true, username: true } }
      }
    });

    if (!order) {
      throw { status: 404, message: 'Proof not found' };
    }

    // Only authorized for Customer owner or Administrator
    if (user.role === Role.CUSTOMER && order.userId !== user.id) {
      throw { status: 404, message: 'Proof not found' };
    }

    // Look up verification audit log if verified or completed
    let verifiedBy: string | null = null;
    let verifiedAt: string | null = null;
    if (order.paymentStatus === PaymentStatus.VERIFIED || order.paymentStatus === PaymentStatus.COMPLETED) {
      const verifyLog = await prisma.auditLog.findFirst({
        where: {
          entity: 'SalesOrder',
          entityId: order.id,
          action: 'PAYMENT_STATUS_VERIFIED'
        },
        orderBy: { id: 'desc' }
      });
      if (verifyLog) {
        verifiedAt = verifyLog.createdAt.toISOString();
        if (verifyLog.userId) {
          const verifier = await prisma.user.findUnique({
            where: { id: verifyLog.userId },
            select: { name: true }
          });
          verifiedBy = verifier?.name || 'Administrator';
        } else {
          verifiedBy = 'Administrator';
        }
      }
    }

    const customerName = order.customerName || (order.orderType === OrderType.WALK_IN_POS ? 'Walk-in customer' : (order.user?.name || 'Walk-in customer'));
    const paymentMethod = (order.paymentMethod === 'GCASH_QR' || order.paymentMethod === 'MAYA_QR' || order.paymentMethod === 'E_WALLET') ? 'E_WALLET' : 'CASH';

    return {
      id: order.id,
      order_number: order.orderNumber,
      customer_name: customerName,
      reference_number: order.paymentReference || null,
      proof_base64: order.proofBase64 || null,
      has_proof: !!order.proofBase64,
      amount: Number(order.totalAmount).toFixed(2),
      payment_method: paymentMethod,
      payment_status: order.paymentStatus,
      submitted_at: order.createdAt.toISOString(),
      created_at: order.createdAt.toISOString(),
      verified_by: verifiedBy,
      verified_at: verifiedAt
    };
  }

  /**
   * Order PATCH handler: claim, verify, reject, status transition, refunded
   */
  static async patchOrder(params: {
    id: number;
    action: 'claim' | 'verify' | 'reject' | 'status' | 'refunded';
    user: { id: number; role: Role };
    body: any;
  }) {
    const { id, action, user, body } = params;
    const order = await prisma.salesOrder.findUnique({
      where: { id },
      include: {
        items: true,
        user: { select: { email: true, name: true } }
      }
    });

    if (!order) {
      throw { status: 404, message: 'Order not found' };
    }

    switch (action) {
      case 'claim': {
        // Customer claims payment on own pending or rejected E-Wallet order
        if (user.role === Role.CUSTOMER && order.userId !== user.id) {
          throw { status: 404, message: 'Order not found' };
        }

        const { reference_number, proof_base64, filename, file_name } = body;
        if (!proof_base64 || typeof proof_base64 !== 'string') {
          throw { status: 422, message: 'Proof image required' };
        }

        // 1. Double extension and suspicious filename check
        const testFilename = (filename || file_name || '').toLowerCase().trim();
        if (testFilename) {
          const parts = testFilename.split('.');
          if (parts.length > 2) {
            throw { status: 422, message: 'Double extensions or suspicious file names are rejected' };
          }
          const ext = parts[parts.length - 1];
          if (!['jpg', 'jpeg', 'png'].includes(ext)) {
            throw { status: 422, message: 'Invalid file extension: must be .jpg, .jpeg, or .png' };
          }
        }

        // 2. Reject SVG or XML indicators explicitly
        const lowerProof = proof_base64.toLowerCase();
        if (
          lowerProof.includes('image/svg') ||
          lowerProof.includes('<svg') ||
          lowerProof.includes('<?xml') ||
          lowerProof.includes('<!doctype')
        ) {
          throw { status: 422, message: 'SVG and vector formats are strictly rejected' };
        }

        // 3. Extract raw base64 data and decode buffer
        const commaIdx = proof_base64.indexOf(',');
        const rawBase64 = commaIdx !== -1 ? proof_base64.slice(commaIdx + 1) : proof_base64;

        let buffer: Buffer;
        try {
          buffer = Buffer.from(rawBase64, 'base64');
        } catch {
          throw { status: 422, message: 'Malformed base64 payment proof' };
        }

        if (buffer.length === 0) {
          throw { status: 422, message: 'Payment proof image is empty' };
        }

        // 4. Enforce 5MB file size limit
        if (buffer.length > 5 * 1024 * 1024) {
          throw { status: 422, message: 'Payment proof exceeds 5MB size limit' };
        }

        // 5. Strict Magic Byte Verification (JPEG and PNG only)
        const isJpeg = buffer.length >= 3 &&
          buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
        const isPng = buffer.length >= 8 &&
          buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
          buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A;

        if (!isJpeg && !isPng) {
          throw { status: 422, message: 'Invalid image format: must be valid JPEG or PNG verified by magic bytes' };
        }

        const safeMime = isJpeg ? 'image/jpeg' : 'image/png';
        const normalizedProof = `data:${safeMime};base64,${rawBase64}`;

        const refNum = (reference_number && typeof reference_number === 'string' && reference_number.trim())
          ? sanitize(reference_number.trim())
          : `EWALLET-${order.orderNumber}`;

        // Check reference uniqueness across claims
        const refConflict = await prisma.salesOrder.findFirst({
          where: {
            paymentReference: refNum,
            id: { not: id }
          }
        });

        if (refConflict) {
          throw { status: 409, message: 'Reference cannot be claimed by a second order' };
        }

        const updated = await prisma.$transaction(async (tx) => {
          const u = await tx.salesOrder.update({
            where: { id },
            data: {
              paymentReference: refNum,
              proofBase64: normalizedProof,
              paymentStatus: PaymentStatus.SUBMITTED
            }
          });

          await tx.auditLog.create({
            data: {
              userId: user.id,
              action: 'PAYMENT_STATUS_SUBMITTED',
              entity: 'SalesOrder',
              entityId: id,
              details: JSON.stringify({
                orderNumber: order.orderNumber,
                referenceNumber: refNum,
                previousPaymentStatus: order.paymentStatus,
                newPaymentStatus: 'SUBMITTED'
              })
            }
          });

          return u;
        });

        // Outside transaction: notify admin of payment claim
        (async () => {
          try {
            await Mailer.sendAdminOrderAlert({
              orderId: updated.id,
              orderNumber: order.orderNumber,
              customerName: order.customerName || order.user?.name || 'Customer',
              total: Number(order.totalAmount).toFixed(2),
              paymentMethod: order.paymentMethod,
              fulfillment: order.orderType,
              type: 'PAYMENT_CLAIM'
            });
          } catch (err: any) {
            console.error('[OrderService] Admin claim alert email error:', err.message);
          }
        })();

        return {
          id: updated.id,
          payment_status: updated.paymentStatus,
          reference_number: updated.paymentReference
        };
      }

      case 'verify': {
        // Administrator verifies payment
        if (user.role !== Role.ADMIN) {
          throw { status: 403, message: 'Only Administrator can verify payment claims' };
        }

        const notes = sanitize(body.notes) || 'Payment verified against merchant wallet';
        const updated = await prisma.$transaction(async (tx) => {
          const u = await tx.salesOrder.update({
            where: { id },
            data: {
              paymentStatus: PaymentStatus.VERIFIED,
              notes
            }
          });

          await tx.auditLog.create({
            data: {
              userId: user.id,
              action: 'PAYMENT_STATUS_VERIFIED',
              entity: 'SalesOrder',
              entityId: id,
              details: JSON.stringify({
                orderNumber: order.orderNumber,
                previousPaymentStatus: order.paymentStatus,
                newPaymentStatus: 'VERIFIED',
                notes
              })
            }
          });

          return u;
        });

        // Notify customer that payment was verified
        (async () => {
          try {
            if (order.user?.email) {
              await Mailer.sendOrderStatusUpdate({
                orderId: updated.id,
                orderNumber: order.orderNumber,
                customerEmail: order.user.email,
                customerName: order.customerName || order.user.name || 'Customer',
                status: 'PAYMENT VERIFIED',
                notes: updated.notes,
                userId: order.userId
              });
            }
          } catch (err: any) {
            console.error('[OrderService] Verify status email error:', err.message);
          }
        })();

        return {
          id: updated.id,
          payment_status: updated.paymentStatus,
          notes: updated.notes
        };
      }

      case 'reject': {
        // Administrator rejects payment
        if (user.role !== Role.ADMIN) {
          throw { status: 403, message: 'Only Administrator can reject payment claims' };
        }

        const reason = sanitize(body.notes || body.reason || '');
        if (!reason) {
          throw { status: 422, message: 'Rejection reason is required' };
        }

        const updated = await prisma.$transaction(async (tx) => {
          const u = await tx.salesOrder.update({
            where: { id },
            data: {
              paymentStatus: PaymentStatus.REJECTED,
              notes: reason
            }
          });

          await tx.auditLog.create({
            data: {
              userId: user.id,
              action: 'PAYMENT_STATUS_REJECTED',
              entity: 'SalesOrder',
              entityId: id,
              details: JSON.stringify({
                orderNumber: order.orderNumber,
                previousPaymentStatus: order.paymentStatus,
                newPaymentStatus: 'REJECTED',
                reason
              })
            }
          });

          return u;
        });

        // Notify customer that payment was rejected with admin's reason
        (async () => {
          try {
            if (order.user?.email) {
              await Mailer.sendOrderStatusUpdate({
                orderId: updated.id,
                orderNumber: order.orderNumber,
                customerEmail: order.user.email,
                customerName: order.customerName || order.user.name || 'Customer',
                status: 'PAYMENT REJECTED',
                notes: updated.notes,
                userId: order.userId
              });
            }
          } catch (err: any) {
            console.error('[OrderService] Reject status email error:', err.message);
          }
        })();

        return {
          id: updated.id,
          payment_status: updated.paymentStatus,
          notes: updated.notes
        };
      }

      case 'status': {
        const newStatus = body.status as OrderStatus;

        // Customer can only cancel their own PENDING order
        if (user.role === Role.CUSTOMER) {
          if (newStatus !== OrderStatus.CANCELLED) {
            throw { status: 403, message: 'Customers cannot change order fulfillment status' };
          }
          if (order.userId !== user.id) {
            throw { status: 404, message: 'Order not found' };
          }
        }

        // Unverified E-Wallet/QR orders cannot enter fulfillment or completion
        const enteringFulfillment: OrderStatus[] = [
          OrderStatus.CONFIRMED,
          OrderStatus.PREPARING,
          OrderStatus.READY_FOR_PICKUP,
          OrderStatus.OUT_FOR_DELIVERY,
          OrderStatus.COMPLETED
        ];

        const isEWallet =
          order.paymentMethod === PaymentMethod.E_WALLET ||
          order.paymentMethod === PaymentMethod.GCASH_QR ||
          order.paymentMethod === PaymentMethod.MAYA_QR;

        if (enteringFulfillment.includes(newStatus) && isEWallet) {
          if (newStatus === OrderStatus.COMPLETED && order.orderStatus === OrderStatus.COMPLETED) {
            // Idempotent retry allowed
          } else if (order.paymentStatus !== PaymentStatus.VERIFIED && order.paymentStatus !== PaymentStatus.COMPLETED) {
            throw {
              status: 409,
              message: 'Unverified QR cannot enter fulfillment',
              code: 'PAYMENT_NOT_VERIFIED'
            };
          }
        }

        // Cancellation handling
        if (newStatus === OrderStatus.CANCELLED) {
          if (order.orderStatus === OrderStatus.CANCELLED) {
            throw { status: 409, message: 'Repeated cancellation rejected' };
          }

          const cancelResult = await prisma.$transaction(async (tx) => {
            const refundRequired = order.paymentStatus === PaymentStatus.VERIFIED || order.paymentStatus === PaymentStatus.COMPLETED;
            const targetPaymentStatus = refundRequired ? PaymentStatus.REFUND_REQUIRED : order.paymentStatus;

            const updated = await tx.salesOrder.update({
              where: { id },
              data: {
                orderStatus: OrderStatus.CANCELLED,
                paymentStatus: targetPaymentStatus,
                notes: sanitize(body.notes) || 'Cancelled'
              }
            });

            await tx.auditLog.create({
              data: {
                userId: user.id,
                action: targetPaymentStatus === PaymentStatus.REFUND_REQUIRED ? 'PAYMENT_STATUS_REFUND_REQUIRED' : 'ORDER_CANCELLED',
                entity: 'SalesOrder',
                entityId: id,
                details: JSON.stringify({
                  orderNumber: order.orderNumber,
                  previousPaymentStatus: order.paymentStatus,
                  newPaymentStatus: targetPaymentStatus,
                  notes: updated.notes
                })
              }
            });

            // Return reserved stock once
            for (const item of order.items) {
              const rows: any[] = await tx.$queryRaw`
                SELECT id, stock FROM products WHERE id = ${item.productId} FOR UPDATE
              `;
              if (rows && rows.length > 0) {
                const cur = Number(rows[0].stock);
                const restored = cur + item.quantity;
                await tx.product.update({
                  where: { id: item.productId },
                  data: { stock: restored }
                });
                await tx.stockMovement.create({
                  data: {
                    productId: item.productId,
                    movementType: MovementType.ORDER_RELEASE,
                    quantityChange: item.quantity,
                    previousBalance: cur,
                    newBalance: restored,
                    referenceId: id,
                    userId: user.id,
                    notes: `Cancellation stock return for order #${order.orderNumber}`
                  }
                });
              }
            }

            return {
              id: updated.id,
              status: updated.orderStatus,
              payment_status: updated.paymentStatus
            };
          });

          // Notify customer of order cancellation
          (async () => {
            try {
              if (order.user?.email) {
                await Mailer.sendOrderStatusUpdate({
                  orderId: id,
                  orderNumber: order.orderNumber,
                  customerEmail: order.user.email,
                  customerName: order.customerName || order.user.name || 'Customer',
                  status: 'CANCELLED',
                  notes: sanitize(body.notes) || 'Order Cancelled',
                  userId: order.userId
                });
              }
            } catch (err: any) {
              console.error('[OrderService] Cancellation email error:', err.message);
            }
          })();

          return cancelResult;
        }

        // Completion handling
        if (newStatus === OrderStatus.COMPLETED) {
          // Idempotent retry: if already completed, do nothing and return safely
          if (order.orderStatus === OrderStatus.COMPLETED) {
            return {
              id: order.id,
              status: order.orderStatus,
              payment_status: order.paymentStatus
            };
          }

          if (order.paymentMethod === PaymentMethod.CASH && !body.cash_received) {
            throw { status: 422, message: 'CASH completion requires cash_received: true' };
          }

          const completedResult = await prisma.$transaction(async (tx) => {
            const updated = await tx.salesOrder.update({
              where: { id },
              data: {
                orderStatus: OrderStatus.COMPLETED,
                paymentStatus: PaymentStatus.COMPLETED,
                notes: sanitize(body.notes) || 'Order Completed'
              }
            });

            await tx.auditLog.create({
              data: {
                userId: user.id,
                action: 'PAYMENT_STATUS_COMPLETED',
                entity: 'SalesOrder',
                entityId: id,
                details: JSON.stringify({
                  orderNumber: order.orderNumber,
                  previousPaymentStatus: order.paymentStatus,
                  newPaymentStatus: 'COMPLETED',
                  paymentMethod: order.paymentMethod,
                  notes: updated.notes
                })
              }
            });

            return {
              id: updated.id,
              status: updated.orderStatus,
              payment_status: updated.paymentStatus
            };
          });

          // Notify customer of order completion
          (async () => {
            try {
              if (order.user?.email) {
                await Mailer.sendOrderStatusUpdate({
                  orderId: completedResult.id,
                  orderNumber: order.orderNumber,
                  customerEmail: order.user.email,
                  customerName: order.customerName || order.user.name || 'Customer',
                  status: 'COMPLETED',
                  notes: sanitize(body.notes) || 'Order Completed',
                  userId: order.userId
                });
              }
            } catch (err: any) {
              console.error('[OrderService] Completed email error:', err.message);
            }
          })();

          // Stock was already reserved at order placement, DO NOT deduct again
          return completedResult;
        }

        // Advance to CONFIRMED, PREPARING, READY_FOR_PICKUP, or OUT_FOR_DELIVERY
        const updated = await prisma.salesOrder.update({
          where: { id },
          data: {
            orderStatus: newStatus,
            notes: sanitize(body.notes) || order.notes
          }
        });

        // Notify customer of status change (dispatched/ready for pickup, confirmed)
        (async () => {
          try {
            if (order.user?.email) {
              let friendlyStatus = newStatus.toString().replace(/_/g, ' ');
              if (newStatus === OrderStatus.READY_FOR_PICKUP) {
                friendlyStatus = 'READY FOR PICKUP';
              } else if (newStatus === OrderStatus.OUT_FOR_DELIVERY) {
                friendlyStatus = 'OUT FOR DELIVERY';
              } else if (newStatus === OrderStatus.PREPARING) {
                friendlyStatus = 'PREPARING';
              }
              await Mailer.sendOrderStatusUpdate({
                orderId: updated.id,
                orderNumber: order.orderNumber,
                customerEmail: order.user.email,
                customerName: order.customerName || order.user.name || 'Customer',
                status: friendlyStatus,
                notes: updated.notes,
                userId: order.userId
              });
            }
          } catch (err: any) {
            console.error('[OrderService] Status update email error:', err.message);
          }
        })();

        return {
          id: updated.id,
          status: updated.orderStatus,
          payment_status: updated.paymentStatus
        };
      }

      case 'refunded': {
        // Administrator records completed refund
        if (user.role !== Role.ADMIN) {
          throw { status: 403, message: 'Only Administrator can record refunds' };
        }

        const notes = sanitize(body.notes) || 'Refund completed in merchant wallet';
        const updated = await prisma.$transaction(async (tx) => {
          const u = await tx.salesOrder.update({
            where: { id },
            data: {
              paymentStatus: PaymentStatus.REFUNDED,
              notes
            }
          });

          await tx.auditLog.create({
            data: {
              userId: user.id,
              action: 'PAYMENT_STATUS_REFUNDED',
              entity: 'SalesOrder',
              entityId: id,
              details: JSON.stringify({
                orderNumber: order.orderNumber,
                previousPaymentStatus: order.paymentStatus,
                newPaymentStatus: 'REFUNDED',
                notes
              })
            }
          });

          return u;
        });

        return {
          id: updated.id,
          payment_status: updated.paymentStatus
        };
      }

      default:
        throw { status: 422, message: 'Invalid order action' };
    }
  }
}
