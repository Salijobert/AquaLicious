import { prisma, config } from '../config/index.js';
import { MovementType, OrderStatus, OrderType, PaymentMethod, PaymentStatus, Role } from '@prisma/client';
import { sanitize } from '../middleware/security.js';
import { Mailer } from './mailer.js';
import crypto from 'crypto';
// Single canonical definition shared by Admin Pending Orders tile, Notification bell, and Orders Pending filter
export const PENDING_ORDER_WHERE = {
    orderStatus: OrderStatus.PENDING
};
export function computeAllowedOrderActions(order, role = Role.ADMIN) {
    const isCompleted = order.orderStatus === OrderStatus.COMPLETED || order.orderStatus === 'COMPLETED';
    const isCancelled = order.orderStatus === OrderStatus.CANCELLED || order.orderStatus === 'CANCELLED';
    const isVoided = order.orderStatus === OrderStatus.VOIDED || order.orderStatus === 'VOIDED';
    if (isCompleted || isCancelled || isVoided) {
        return [];
    }
    const isCustomer = role === Role.CUSTOMER || role === 'CUSTOMER';
    if (isCustomer) {
        const isPendingOrder = order.orderStatus === OrderStatus.PENDING || order.orderStatus === 'PENDING';
        const isPaymentLockedForCancel = order.paymentStatus === PaymentStatus.SUBMITTED ||
            order.paymentStatus === 'SUBMITTED' ||
            order.paymentStatus === PaymentStatus.VERIFIED ||
            order.paymentStatus === 'VERIFIED' ||
            order.paymentStatus === PaymentStatus.COMPLETED ||
            order.paymentStatus === 'COMPLETED';
        return isPendingOrder && !isPaymentLockedForCancel ? ['CANCEL'] : [];
    }
    const isEWallet = order.paymentMethod === PaymentMethod.E_WALLET ||
        order.paymentMethod === 'E_WALLET' ||
        order.paymentMethod === PaymentMethod.GCASH_QR ||
        order.paymentMethod === 'GCASH_QR' ||
        order.paymentMethod === PaymentMethod.MAYA_QR ||
        order.paymentMethod === 'MAYA_QR';
    const isVerified = order.paymentStatus === PaymentStatus.VERIFIED ||
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
function serializeOrderRecord(o, viewerRole) {
    const customerName = o.customerName || (o.orderType === OrderType.WALK_IN_POS ? 'Walk-in customer' : (o.user?.name || 'Walk-in customer'));
    const paymentMethod = (o.paymentMethod === 'GCASH_QR' || o.paymentMethod === 'MAYA_QR' || o.paymentMethod === 'E_WALLET') ? 'E_WALLET' : 'CASH';
    const isEWallet = paymentMethod === 'E_WALLET';
    const hasReference = Boolean(o.paymentReference && String(o.paymentReference).trim().length > 0);
    const paymentExpiresAt = isEWallet &&
        o.orderStatus === OrderStatus.PENDING &&
        o.paymentStatus === PaymentStatus.PENDING &&
        !o.proofBase64 &&
        !hasReference
        ? new Date(o.createdAt.getTime() + config.unpaidOrderTtlMinutes * 60 * 1000).toISOString()
        : null;
    let cancelledByRole = null;
    if (o.orderStatus === OrderStatus.CANCELLED) {
        if (o.cancelledById) {
            if (o.cancelledBy?.role === Role.ADMIN) {
                cancelledByRole = 'ADMIN';
            }
            else if (o.cancelledById === o.userId || o.cancelledBy?.role === Role.CUSTOMER) {
                cancelledByRole = 'CUSTOMER';
            }
            else {
                cancelledByRole = 'ADMIN';
            }
        }
        else if (o.cancelReason === 'Auto-cancelled: unpaid' || o.notes === 'Auto-cancelled: unpaid') {
            cancelledByRole = 'SYSTEM';
        }
    }
    const rejectionReason = (o.paymentStatus === PaymentStatus.REJECTED || o.paymentStatus === 'REJECTED') ? (o.notes || null) : null;
    const deliveryLat = o.deliveryLat !== undefined && o.deliveryLat !== null ? Number(o.deliveryLat) : null;
    const deliveryLng = o.deliveryLng !== undefined && o.deliveryLng !== null ? Number(o.deliveryLng) : null;
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
            reference_number: o.paymentReference,
            notes: o.notes,
            rejection_reason: rejectionReason
        },
        rejection_reason: rejectionReason,
        delivery_lat: deliveryLat,
        delivery_lng: deliveryLng,
        delivery_street: o.deliveryStreet ?? null,
        delivery_barangay: o.deliveryBarangay ?? null,
        delivery_landmark: o.deliveryLandmark ?? null,
        delivery_contact: o.deliveryContact ?? null,
        delivery_details: (deliveryLat !== null || o.deliveryStreet) ? {
            lat: deliveryLat,
            lng: deliveryLng,
            street: o.deliveryStreet ?? null,
            barangay: o.deliveryBarangay ?? null,
            landmark: o.deliveryLandmark ?? null,
            contact: o.deliveryContact ?? null
        } : null,
        reference_number: o.paymentReference,
        has_proof: !!o.proofBase64,
        status: o.orderStatus,
        fulfillment: o.orderType,
        allowed_actions: computeAllowedOrderActions({
            orderStatus: o.orderStatus,
            paymentMethod: o.paymentMethod,
            paymentStatus: o.paymentStatus,
            orderType: o.orderType
        }, viewerRole),
        address: o.deliveryAddress,
        notes: o.notes,
        cancelled_at: o.cancelledAt ? o.cancelledAt.toISOString() : null,
        cancelled_by_id: o.cancelledById ?? null,
        cancelled_by_role: cancelledByRole,
        cancel_reason: o.cancelReason || (o.orderStatus === OrderStatus.CANCELLED ? o.notes : null) || null,
        payment_expires_at: paymentExpiresAt,
        created_at: o.createdAt.toISOString(),
        items: o.items.map((i) => ({
            product_id: i.productId,
            product_name: i.product.name,
            sku: i.product.sku,
            qty: i.quantity,
            unit_price: Number(i.unitPrice).toFixed(2),
            subtotal: Number(i.subtotal).toFixed(2)
        }))
    };
}
export class OrderService {
    /**
     * Places a customer order and immediately reserves stock under row locks.
     */
    static async createOrder(params) {
        const { userId, userRole, items, fulfillment, address, deliveryLat, deliveryLng, deliveryStreet, deliveryBarangay, deliveryLandmark, deliveryContact, method, expectedTotal, requestKey } = params;
        if (method !== 'CASH' && method !== 'E_WALLET') {
            throw { status: 422, message: 'Invalid payment method. Only Cash and E-Wallet are accepted.' };
        }
        if (fulfillment === 'PICKUP' && method === 'CASH') {
            throw {
                status: 422,
                code: 'PICKUP_REQUIRES_EWALLET',
                message: 'Pickup at Station orders must be paid via E-Wallet (GCash / Maya). Cash is only available for Delivery.'
            };
        }
        if (!items || items.length === 0) {
            throw { status: 422, message: 'Cart items cannot be empty' };
        }
        // Enforce simultaneous unpaid pending order limit for customers before acquiring product locks
        // (preserves ascending productId lock order; rare concurrent double-submits could briefly overshoot by 1 without creating product lock cycles).
        if (userRole !== Role.ADMIN) {
            const unpaidPendingCount = await prisma.salesOrder.count({
                where: {
                    userId,
                    orderStatus: OrderStatus.PENDING,
                    paymentStatus: { in: [PaymentStatus.PENDING, PaymentStatus.REJECTED] }
                }
            });
            if (unpaidPendingCount >= config.maxUnpaidPendingOrders) {
                throw {
                    status: 422,
                    code: 'UNPAID_ORDER_LIMIT',
                    message: `You already have ${unpaidPendingCount} unpaid pending orders (limit: ${config.maxUnpaidPendingOrders}). Please pay or cancel an existing order before placing a new one.`
                };
            }
        }
        const itemMap = new Map();
        for (const item of items) {
            const pid = Number(item.product_id);
            const qty = Number(item.qty);
            if (!pid || qty <= 0 || !Number.isInteger(qty)) {
                throw { status: 422, message: 'Invalid product quantity' };
            }
            itemMap.set(pid, (itemMap.get(pid) || 0) + qty);
        }
        const sortedProductIds = Array.from(itemMap.keys()).sort((a, b) => a - b);
        let receiptLines = [];
        const createdOrder = await prisma.$transaction(async (tx) => {
            // 1. Lock rows in ascending product ID order
            const lockedProducts = [];
            for (const pid of sortedProductIds) {
                const rows = await tx.$queryRaw `
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
            const orderLines = [];
            for (const prod of lockedProducts) {
                const qty = itemMap.get(prod.id);
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
            const constructedAddress = address
                ? sanitize(address)
                : (deliveryStreet
                    ? `${sanitize(deliveryStreet)}${deliveryBarangay ? `, ${sanitize(deliveryBarangay)}` : ''}, Angeles City, Pampanga${deliveryLandmark ? ` (Landmark: ${sanitize(deliveryLandmark)})` : ''}`
                    : null);
            // 4. Create Order with status PENDING
            const order = await tx.salesOrder.create({
                data: {
                    orderNumber,
                    userId,
                    customerId: userId,
                    customerName,
                    orderType: oType,
                    deliveryAddress: constructedAddress,
                    deliveryLat: typeof deliveryLat === 'number' ? deliveryLat : null,
                    deliveryLng: typeof deliveryLng === 'number' ? deliveryLng : null,
                    deliveryStreet: deliveryStreet ? sanitize(deliveryStreet) : null,
                    deliveryBarangay: deliveryBarangay ? sanitize(deliveryBarangay) : null,
                    deliveryLandmark: deliveryLandmark ? sanitize(deliveryLandmark) : null,
                    deliveryContact: deliveryContact ? sanitize(deliveryContact) : null,
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
            const orderDeliveryLat = order.deliveryLat !== undefined && order.deliveryLat !== null ? Number(order.deliveryLat) : null;
            const orderDeliveryLng = order.deliveryLng !== undefined && order.deliveryLng !== null ? Number(order.deliveryLng) : null;
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
                delivery_lat: orderDeliveryLat,
                delivery_lng: orderDeliveryLng,
                delivery_street: order.deliveryStreet ?? null,
                delivery_barangay: order.deliveryBarangay ?? null,
                delivery_landmark: order.deliveryLandmark ?? null,
                delivery_contact: order.deliveryContact ?? null,
                delivery_details: (orderDeliveryLat !== null || order.deliveryStreet) ? {
                    lat: orderDeliveryLat,
                    lng: orderDeliveryLng,
                    street: order.deliveryStreet ?? null,
                    barangay: order.deliveryBarangay ?? null,
                    landmark: order.deliveryLandmark ?? null,
                    contact: order.deliveryContact ?? null
                } : null,
                status: order.orderStatus,
                fulfillment: order.orderType,
                allowed_actions: computeAllowedOrderActions({
                    orderStatus: order.orderStatus,
                    paymentMethod: order.paymentMethod,
                    paymentStatus: order.paymentStatus,
                    orderType: order.orderType
                }, Role.CUSTOMER),
                payment_expires_at: order.paymentMethod !== PaymentMethod.CASH
                    ? new Date(order.createdAt.getTime() + config.unpaidOrderTtlMinutes * 60 * 1000).toISOString()
                    : null,
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
            }
            catch (err) {
                console.error('[OrderService] Async post-order email error:', err.message);
            }
        })();
        return createdOrder;
    }
    static buildStatusFilterWhere(user, status) {
        const isCustomer = user.role === Role.CUSTOMER;
        const normalized = (status || '').trim().toUpperCase();
        let statusWhere = {};
        if (normalized === 'PENDING') {
            statusWhere = PENDING_ORDER_WHERE;
        }
        else if (normalized === 'COMPLETED') {
            statusWhere = { orderStatus: OrderStatus.COMPLETED };
        }
        else if (normalized === 'CANCELLED') {
            statusWhere = { orderStatus: OrderStatus.CANCELLED };
        }
        return {
            ...(isCustomer ? { userId: user.id } : {}),
            ...statusWhere
        };
    }
    static async listOrders(user, limit = 200, status) {
        const normalized = (status || '').trim().toUpperCase();
        const whereClause = this.buildStatusFilterWhere(user, status);
        const effectiveLimit = normalized === 'PENDING' ? Math.max(limit, 1000) : limit;
        const orders = await prisma.salesOrder.findMany({
            where: whereClause,
            take: effectiveLimit,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            include: {
                user: { select: { name: true, username: true } },
                cancelledBy: { select: { id: true, role: true } },
                items: {
                    include: { product: { select: { name: true, sku: true } } }
                }
            }
        });
        return orders.map((o) => serializeOrderRecord(o, user.role));
    }
    static async listOrdersPaginated(user, params) {
        const safeLimit = Math.min(Math.max(Math.trunc(Number(params.limit) || 40), 1), 100);
        const safeOffset = Math.max(Math.trunc(Number(params.offset) || 0), 0);
        const userScope = user.role === Role.CUSTOMER ? { userId: user.id } : {};
        const whereClause = this.buildStatusFilterWhere(user, params.status);
        const [items, total, allCount, pendingCount, completedCount, cancelledCount] = await Promise.all([
            prisma.salesOrder.findMany({
                where: whereClause,
                take: safeLimit,
                skip: safeOffset,
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                include: {
                    user: { select: { name: true, username: true } },
                    cancelledBy: { select: { id: true, role: true } },
                    items: {
                        include: { product: { select: { name: true, sku: true } } }
                    }
                }
            }),
            prisma.salesOrder.count({ where: whereClause }),
            prisma.salesOrder.count({ where: userScope }),
            prisma.salesOrder.count({ where: { ...userScope, ...PENDING_ORDER_WHERE } }),
            prisma.salesOrder.count({ where: { ...userScope, orderStatus: OrderStatus.COMPLETED } }),
            prisma.salesOrder.count({ where: { ...userScope, orderStatus: OrderStatus.CANCELLED } })
        ]);
        return {
            items: items.map((o) => serializeOrderRecord(o, user.role)),
            total,
            limit: safeLimit,
            offset: safeOffset,
            has_more: safeOffset + items.length < total,
            counts: {
                all: allCount,
                pending: pendingCount,
                completed: completedCount,
                cancelled: cancelledCount
            }
        };
    }
    static async getOrder(id, user) {
        const order = await prisma.salesOrder.findUnique({
            where: { id },
            include: {
                user: { select: { name: true, username: true } },
                cancelledBy: { select: { id: true, role: true } },
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
        return serializeOrderRecord(order, user.role);
    }
    /**
     * Retrieves an academic demonstrative receipt snapshot for an order.
     * Strictly Demonstration / Academic: zero BIR/TIN/VAT claims.
     * Only exposes customer-facing snapshot values (unitPrice, quantity, subtotal, total).
     * Never leaks internal unit costs or profit margins.
     */
    static async getOrderReceipt(id, user) {
        const order = await prisma.salesOrder.findUnique({
            where: { id },
            include: {
                items: {
                    include: {
                        product: { select: { id: true, name: true, sku: true } }
                    }
                },
                user: { select: { id: true, name: true, username: true } }
            }
        });
        if (!order) {
            throw { status: 404, message: 'Order not found' };
        }
        if (user.role === Role.CUSTOMER && order.userId !== user.id) {
            throw { status: 403, message: 'You do not have permission to view this receipt.' };
        }
        const customerName = order.customerName || order.user?.name || 'Customer';
        return {
            receipt_number: `RCP-${order.orderNumber.replace('ORD-', '')}`,
            order_number: order.orderNumber,
            order_date: order.createdAt.toISOString(),
            customer_name: customerName,
            customer_username: order.user?.username,
            fulfillment: order.orderType,
            delivery_address: order.deliveryAddress,
            delivery_details: (order.deliveryLat !== null || order.deliveryStreet) ? {
                lat: order.deliveryLat !== null ? Number(order.deliveryLat) : null,
                lng: order.deliveryLng !== null ? Number(order.deliveryLng) : null,
                street: order.deliveryStreet,
                barangay: order.deliveryBarangay,
                landmark: order.deliveryLandmark,
                contact: order.deliveryContact
            } : null,
            payment_method: order.paymentMethod === 'E_WALLET' ? 'E-Wallet' : 'Cash',
            payment_status: order.paymentStatus,
            order_status: order.orderStatus,
            items: order.items.map((item) => ({
                product_name: item.product.name,
                sku: item.product.sku,
                quantity: item.quantity,
                unit_price: Number(item.unitPrice).toFixed(2),
                subtotal: Number(item.subtotal).toFixed(2)
            })),
            subtotal: Number(order.subtotal).toFixed(2),
            discount: Number(order.discount).toFixed(2),
            tax: Number(order.tax).toFixed(2),
            total: Number(order.totalAmount).toFixed(2),
            disclaimer: 'System-generated order receipt. For demonstration purposes only. Not an official receipt.'
        };
    }
    static async getPendingSummary(limit = 5) {
        const safeLimit = Math.min(Math.max(Math.trunc(Number(limit) || 5), 1), 20);
        const [count, pendingRows] = await Promise.all([
            prisma.salesOrder.count({ where: PENDING_ORDER_WHERE }),
            prisma.salesOrder.findMany({
                where: PENDING_ORDER_WHERE,
                take: safeLimit,
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                select: {
                    id: true,
                    orderNumber: true,
                    customerName: true,
                    orderType: true,
                    orderStatus: true,
                    paymentMethod: true,
                    paymentStatus: true,
                    totalAmount: true,
                    createdAt: true,
                    user: { select: { name: true } },
                    items: {
                        select: {
                            quantity: true,
                            product: { select: { name: true } }
                        },
                        orderBy: { id: 'asc' }
                    }
                }
            })
        ]);
        return {
            count,
            orders: pendingRows.map((order) => ({
                id: order.id,
                order_number: order.orderNumber,
                customer_name: (order.customerName || order.user?.name || '').trim() || 'Walk-in customer',
                fulfillment: order.orderType,
                status: order.orderStatus,
                payment_method: order.paymentMethod,
                payment_status: order.paymentStatus,
                total: Number(order.totalAmount).toFixed(2),
                created_at: order.createdAt.toISOString(),
                items_summary: order.items.map((item) => ({
                    product_name: item.product.name,
                    qty: item.quantity
                }))
            }))
        };
    }
    static async getProof(id, user) {
        const order = await prisma.salesOrder.findUnique({
            where: { id },
            include: {
                user: { select: { name: true, username: true } },
                verifiedBy: { select: { name: true } }
            }
        });
        if (!order) {
            throw { status: 404, message: 'Proof not found' };
        }
        // Only authorized for Customer owner or Administrator
        if (user.role === Role.CUSTOMER && order.userId !== user.id) {
            throw { status: 404, message: 'Proof not found' };
        }
        // Read verification directly from payment/order record
        let verifiedBy = order.verifiedBy?.name || null;
        let verifiedAt = order.verifiedAt ? order.verifiedAt.toISOString() : null;
        // Fallback to audit log for legacy orders if not populated on order record
        if (!verifiedBy && (order.paymentStatus === PaymentStatus.VERIFIED || order.paymentStatus === PaymentStatus.COMPLETED)) {
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
                }
                else {
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
    static async patchOrder(params) {
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
                if (lowerProof.includes('image/svg') ||
                    lowerProof.includes('<svg') ||
                    lowerProof.includes('<?xml') ||
                    lowerProof.includes('<!doctype')) {
                    throw { status: 422, message: 'SVG and vector formats are strictly rejected' };
                }
                // 3. Extract raw base64 data and decode buffer
                const commaIdx = proof_base64.indexOf(',');
                const rawBase64 = commaIdx !== -1 ? proof_base64.slice(commaIdx + 1) : proof_base64;
                let buffer;
                try {
                    buffer = Buffer.from(rawBase64, 'base64');
                }
                catch {
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
                    }
                    catch (err) {
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
                const verifyTime = new Date();
                const updated = await prisma.$transaction(async (tx) => {
                    const u = await tx.salesOrder.update({
                        where: { id },
                        data: {
                            paymentStatus: PaymentStatus.VERIFIED,
                            verifiedById: user.id,
                            verifiedAt: verifyTime,
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
                                verifiedById: user.id,
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
                    }
                    catch (err) {
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
                const rawReason = String(body.notes || body.reason || '').trim().slice(0, 500);
                const reason = sanitize(rawReason);
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
                    }
                    catch (err) {
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
                const newStatus = body.status;
                // Customer can only cancel their own PENDING order (before E-Wallet payment proof is submitted/verified)
                if (user.role !== Role.ADMIN) {
                    if (newStatus !== OrderStatus.CANCELLED) {
                        throw { status: 403, code: 'FORBIDDEN', message: 'Customers cannot change order fulfillment status' };
                    }
                    if (order.userId !== user.id) {
                        throw { status: 404, code: 'NOT_FOUND', message: 'Order not found' };
                    }
                    if (order.orderStatus === OrderStatus.CANCELLED) {
                        throw { status: 409, code: 'ALREADY_CANCELLED', message: 'Order is already cancelled' };
                    }
                    if (order.orderStatus !== OrderStatus.PENDING) {
                        throw {
                            status: 409,
                            code: 'ORDER_NOT_CANCELLABLE',
                            message: 'Orders can only be cancelled while still Pending.'
                        };
                    }
                    if (order.paymentStatus === PaymentStatus.SUBMITTED ||
                        order.paymentStatus === PaymentStatus.VERIFIED ||
                        order.paymentStatus === PaymentStatus.COMPLETED) {
                        throw {
                            status: 409,
                            code: 'PAYMENT_ALREADY_SUBMITTED',
                            message: 'Contact the station to cancel this order after payment proof has been submitted or verified.'
                        };
                    }
                }
                // Unverified E-Wallet/QR orders cannot enter fulfillment or completion
                const enteringFulfillment = [
                    OrderStatus.CONFIRMED,
                    OrderStatus.PREPARING,
                    OrderStatus.READY_FOR_PICKUP,
                    OrderStatus.OUT_FOR_DELIVERY,
                    OrderStatus.COMPLETED
                ];
                const isEWallet = order.paymentMethod === PaymentMethod.E_WALLET ||
                    order.paymentMethod === PaymentMethod.GCASH_QR ||
                    order.paymentMethod === PaymentMethod.MAYA_QR;
                if (enteringFulfillment.includes(newStatus) && isEWallet) {
                    if (newStatus === OrderStatus.COMPLETED && order.orderStatus === OrderStatus.COMPLETED) {
                        // Idempotent retry allowed
                    }
                    else if (order.paymentStatus !== PaymentStatus.VERIFIED && order.paymentStatus !== PaymentStatus.COMPLETED) {
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
                        throw { status: 409, code: 'ALREADY_CANCELLED', message: 'Repeated cancellation rejected' };
                    }
                    const rawReason = typeof body.reason === 'string' && body.reason.trim()
                        ? body.reason
                        : typeof body.notes === 'string'
                            ? body.notes
                            : '';
                    const cleanCancelReason = sanitize(rawReason).slice(0, 300) ||
                        (user.role === Role.CUSTOMER ? 'Cancelled by customer' : 'Cancelled by administrator');
                    const cancelResult = await prisma.$transaction(async (tx) => {
                        // Canonical lock order: lock SalesOrder row FOR UPDATE first, then Products FOR UPDATE in ascending productId order.
                        // Checkout locks only Products FOR UPDATE (never SalesOrder), preventing circular deadlock against concurrent cancel/prepare.
                        const lockedOrderRows = await tx.$queryRaw `
              SELECT id, "userId", "orderNumber", "orderStatus"::text AS "orderStatus", "paymentStatus"::text AS "paymentStatus", notes
              FROM sales_orders
              WHERE id = ${id}
              FOR UPDATE
            `;
                        const lockedOrder = lockedOrderRows?.[0];
                        if (!lockedOrder) {
                            throw { status: 404, code: 'NOT_FOUND', message: 'Order not found' };
                        }
                        if (lockedOrder.orderStatus === OrderStatus.CANCELLED) {
                            throw { status: 409, code: 'ALREADY_CANCELLED', message: 'Repeated cancellation rejected' };
                        }
                        if (lockedOrder.orderStatus === OrderStatus.COMPLETED) {
                            throw { status: 409, code: 'ORDER_NOT_CANCELLABLE', message: 'Completed orders cannot be cancelled' };
                        }
                        if (user.role !== Role.ADMIN) {
                            if (lockedOrder.orderStatus !== OrderStatus.PENDING) {
                                throw {
                                    status: 409,
                                    code: 'ORDER_NOT_CANCELLABLE',
                                    message: 'Order is no longer Pending and cannot be cancelled.'
                                };
                            }
                            if (lockedOrder.paymentStatus === PaymentStatus.SUBMITTED ||
                                lockedOrder.paymentStatus === PaymentStatus.VERIFIED ||
                                lockedOrder.paymentStatus === PaymentStatus.COMPLETED) {
                                throw {
                                    status: 409,
                                    code: 'PAYMENT_ALREADY_SUBMITTED',
                                    message: 'Contact the station to cancel this order after payment proof has been submitted or verified.'
                                };
                            }
                        }
                        const refundRequired = lockedOrder.paymentStatus === PaymentStatus.VERIFIED ||
                            lockedOrder.paymentStatus === PaymentStatus.COMPLETED;
                        const targetPaymentStatus = refundRequired
                            ? PaymentStatus.REFUND_REQUIRED
                            : lockedOrder.paymentStatus;
                        const now = new Date();
                        const updated = await tx.salesOrder.update({
                            where: { id },
                            data: {
                                orderStatus: OrderStatus.CANCELLED,
                                paymentStatus: targetPaymentStatus,
                                cancelledAt: now,
                                cancelledById: user.id,
                                cancelReason: cleanCancelReason,
                                notes: cleanCancelReason
                            }
                        });
                        await tx.auditLog.create({
                            data: {
                                userId: user.id,
                                action: user.role === Role.CUSTOMER
                                    ? 'ORDER_CANCELLED_BY_CUSTOMER'
                                    : targetPaymentStatus === PaymentStatus.REFUND_REQUIRED
                                        ? 'PAYMENT_STATUS_REFUND_REQUIRED'
                                        : 'ORDER_CANCELLED',
                                entity: 'SalesOrder',
                                entityId: id,
                                details: JSON.stringify({
                                    orderNumber: lockedOrder.orderNumber,
                                    cancelledByRole: user.role,
                                    previousPaymentStatus: lockedOrder.paymentStatus,
                                    newPaymentStatus: targetPaymentStatus,
                                    reason: cleanCancelReason
                                })
                            }
                        });
                        // Return reserved stock strictly once (protected by existing ORDER_RELEASE check)
                        const existingRelease = await tx.stockMovement.findFirst({
                            where: {
                                referenceId: id,
                                movementType: MovementType.ORDER_RELEASE
                            },
                            select: { id: true }
                        });
                        if (!existingRelease) {
                            const sortedItems = [...order.items].sort((a, b) => a.productId - b.productId);
                            for (const item of sortedItems) {
                                const rows = await tx.$queryRaw `
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
                                            notes: `Cancellation stock return for order #${lockedOrder.orderNumber}`
                                        }
                                    });
                                }
                            }
                        }
                        return {
                            id: updated.id,
                            status: updated.orderStatus,
                            payment_status: updated.paymentStatus,
                            cancelled_at: updated.cancelledAt?.toISOString() || null,
                            cancel_reason: updated.cancelReason || cleanCancelReason
                        };
                    });
                    // Notify customer once of order cancellation
                    (async () => {
                        try {
                            if (order.user?.email) {
                                await Mailer.sendOrderStatusUpdate({
                                    orderId: id,
                                    orderNumber: order.orderNumber,
                                    customerEmail: order.user.email,
                                    customerName: order.customerName || order.user.name || 'Customer',
                                    status: 'CANCELLED',
                                    notes: cleanCancelReason,
                                    userId: order.userId,
                                    idempotencyKey: `order-cancel-${id}`
                                });
                            }
                        }
                        catch (err) {
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
                        const lockedRows = await tx.$queryRaw `
              SELECT id, "orderStatus"::text AS "orderStatus", "paymentStatus"::text AS "paymentStatus", "paymentMethod"::text AS "paymentMethod"
              FROM sales_orders
              WHERE id = ${id}
              FOR UPDATE
            `;
                        const locked = lockedRows?.[0];
                        if (!locked) {
                            throw { status: 404, message: 'Order not found' };
                        }
                        if (locked.orderStatus === OrderStatus.COMPLETED) {
                            return {
                                id: locked.id,
                                status: locked.orderStatus,
                                payment_status: locked.paymentStatus
                            };
                        }
                        if (locked.orderStatus === OrderStatus.CANCELLED || locked.orderStatus === OrderStatus.VOIDED) {
                            throw { status: 409, code: 'ALREADY_CANCELLED', message: 'Cancelled orders cannot be completed' };
                        }
                        const lockedIsEWallet = locked.paymentMethod === PaymentMethod.E_WALLET ||
                            locked.paymentMethod === PaymentMethod.GCASH_QR ||
                            locked.paymentMethod === PaymentMethod.MAYA_QR;
                        if (lockedIsEWallet && locked.paymentStatus !== PaymentStatus.VERIFIED && locked.paymentStatus !== PaymentStatus.COMPLETED) {
                            throw { status: 409, code: 'PAYMENT_NOT_VERIFIED', message: 'Unverified QR cannot enter fulfillment' };
                        }
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
                                    previousPaymentStatus: locked.paymentStatus,
                                    newPaymentStatus: 'COMPLETED',
                                    paymentMethod: locked.paymentMethod,
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
                        }
                        catch (err) {
                            console.error('[OrderService] Completed email error:', err.message);
                        }
                    })();
                    // Stock was already reserved at order placement, DO NOT deduct again
                    return completedResult;
                }
                // Advance to CONFIRMED, PREPARING, READY_FOR_PICKUP, or OUT_FOR_DELIVERY under row lock
                const updated = await prisma.$transaction(async (tx) => {
                    const lockedRows = await tx.$queryRaw `
            SELECT id, "orderStatus"::text AS "orderStatus", "paymentStatus"::text AS "paymentStatus", "paymentMethod"::text AS "paymentMethod"
            FROM sales_orders
            WHERE id = ${id}
            FOR UPDATE
          `;
                    const locked = lockedRows?.[0];
                    if (!locked) {
                        throw { status: 404, message: 'Order not found' };
                    }
                    if (locked.orderStatus === OrderStatus.CANCELLED || locked.orderStatus === OrderStatus.VOIDED) {
                        throw { status: 409, code: 'ALREADY_CANCELLED', message: 'Cancelled orders cannot enter fulfillment' };
                    }
                    if (locked.orderStatus === OrderStatus.COMPLETED) {
                        throw { status: 409, message: 'Completed orders cannot change status' };
                    }
                    const lockedIsEWallet = locked.paymentMethod === PaymentMethod.E_WALLET ||
                        locked.paymentMethod === PaymentMethod.GCASH_QR ||
                        locked.paymentMethod === PaymentMethod.MAYA_QR;
                    if (lockedIsEWallet && locked.paymentStatus !== PaymentStatus.VERIFIED && locked.paymentStatus !== PaymentStatus.COMPLETED) {
                        throw { status: 409, code: 'PAYMENT_NOT_VERIFIED', message: 'Unverified QR cannot enter fulfillment' };
                    }
                    return tx.salesOrder.update({
                        where: { id },
                        data: {
                            orderStatus: newStatus,
                            notes: sanitize(body.notes) || order.notes
                        }
                    });
                });
                // Notify customer of status change (dispatched/ready for pickup, confirmed)
                (async () => {
                    try {
                        if (order.user?.email) {
                            let friendlyStatus = newStatus.toString().replace(/_/g, ' ');
                            if (newStatus === OrderStatus.READY_FOR_PICKUP) {
                                friendlyStatus = 'READY FOR PICKUP';
                            }
                            else if (newStatus === OrderStatus.OUT_FOR_DELIVERY) {
                                friendlyStatus = 'OUT FOR DELIVERY';
                            }
                            else if (newStatus === OrderStatus.PREPARING) {
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
                    }
                    catch (err) {
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
