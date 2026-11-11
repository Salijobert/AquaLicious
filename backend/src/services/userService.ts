import { prisma } from '../config/index.js';
import { Role } from '@prisma/client';
import { sanitize } from '../middleware/security.js';
import { assertAllowedName } from '../utils/nameFilter.js';
import admin from 'firebase-admin';

export class UserService {
  static async listUsers() {
    const users = await prisma.user.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        phone: true,
        address: true,
        role: true,
        active: true,
        createdAt: true
      }
    });

    return users.map(u => ({
      id: u.id,
      name: u.name,
      username: u.username,
      email: u.email,
      phone: u.phone,
      address: u.address,
      role: u.role === Role.ADMIN ? 'Administrator' : 'Customer',
      active: u.active ? 1 : 0,
      created_at: u.createdAt.toISOString()
    }));
  }

  static async createUser(data: {
    name: string;
    username: string;
    email?: string;
    role: string;
    firebaseUid?: string;
    active?: boolean;
  }) {
    assertAllowedName(data.name);
    assertAllowedName(data.username);

    const name = sanitize(data.name);
    const username = sanitize(data.username);
    const email = data.email ? sanitize(data.email) : `${username}@aqualicious.local`;

    let userRole: Role = Role.CUSTOMER;
    if (data.role === 'Administrator' || data.role === 'ADMIN') {
      userRole = Role.ADMIN;
    } else if (data.role === 'Customer' || data.role === 'CUSTOMER') {
      userRole = Role.CUSTOMER;
    } else {
      throw { status: 422, message: 'Invalid role. Only Administrator and Customer are supported' };
    }

    const firebaseUid = data.firebaseUid || `local-${username}-${Date.now()}`;

    const created = await prisma.user.create({
      data: {
        name,
        username,
        email,
        firebaseUid,
        role: userRole,
        active: data.active !== undefined ? !!data.active : true
      }
    });

    return {
      id: created.id,
      name: created.name,
      username: created.username,
      email: created.email,
      role: created.role === Role.ADMIN ? 'Administrator' : 'Customer',
      active: created.active ? 1 : 0
    };
  }

  static async updateUser(id: number, data: {
    name?: string;
    role?: string;
    active?: boolean | number;
  }) {
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw { status: 404, message: 'User not found' };
    }

    // Check if deactivating or changing role of the last active Administrator
    if (existing.role === Role.ADMIN && (data.active === false || data.active === 0 || (data.role && data.role !== 'Administrator' && data.role !== 'ADMIN'))) {
      const activeAdminCount = await prisma.user.count({
        where: {
          role: Role.ADMIN,
          active: true,
          id: { not: id }
        }
      });

      if (activeAdminCount === 0) {
        throw { status: 409, message: 'Cannot deactivate or demote the last active Administrator' };
      }
    }

    const updateData: any = {};
    if (data.name !== undefined) {
      assertAllowedName(data.name);
      updateData.name = sanitize(data.name);
    }
    if (data.active !== undefined) updateData.active = Boolean(data.active);
    if (data.role !== undefined) {
      if (data.role === 'Administrator' || data.role === 'ADMIN') {
        updateData.role = Role.ADMIN;
      } else if (data.role === 'Customer' || data.role === 'CUSTOMER') {
        updateData.role = Role.CUSTOMER;
      } else {
        throw { status: 422, message: 'Invalid role. Only Administrator and Customer are supported' };
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData
    });

    return {
      id: updated.id,
      name: updated.name,
      username: updated.username,
      role: updated.role === Role.ADMIN ? 'Administrator' : 'Customer',
      active: updated.active ? 1 : 0
    };
  }

  static async deleteUser(id: number, currentUserId?: number) {
    const existing = await prisma.user.findUnique({
      where: { id }
    });

    if (!existing) {
      throw { status: 404, message: 'User not found' };
    }

    // Guard: Admin cannot delete their own account
    if (currentUserId !== undefined && Number(currentUserId) === Number(id)) {
      throw { status: 409, message: 'You cannot delete your own administrator account' };
    }

    // Guard: Prevent deleting the last active Administrator
    if (existing.role === Role.ADMIN) {
      const activeAdminCount = await prisma.user.count({
        where: {
          role: Role.ADMIN,
          active: true,
          id: { not: id }
        }
      });

      if (activeAdminCount === 0) {
        throw { status: 409, message: 'Cannot delete the last active Administrator' };
      }

      // Administrator accounts with stock ledger or sales records cannot be deleted; deactivate instead
      const hasAdminHistory = (await prisma.salesOrder.count({ where: { OR: [{ userId: id }, { verifiedById: id }] } })) > 0 ||
        (await prisma.stockMovement.count({ where: { userId: id } })) > 0;

      if (hasAdminHistory) {
        throw {
          status: 409,
          message: 'Cannot delete user with existing sales orders or stock ledger records. Deactivate account instead.'
        };
      }
    }

    // Inspect historical transactions, orders, and ledger movements
    const salesOrdersCount = await prisma.salesOrder.count({ where: { userId: id } });
    const verifiedOrdersCount = await prisma.salesOrder.count({ where: { verifiedById: id } });
    const stockMovementsCount = await prisma.stockMovement.count({ where: { userId: id } });
    const hasHistory = (salesOrdersCount + verifiedOrdersCount + stockMovementsCount) > 0;

    if (hasHistory) {
      // Anonymize user row and past order snapshots while preserving accounting & order history
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id },
          data: {
            name: 'Removed user',
            username: `removed_user_${id}`,
            email: `removed_user_${id}@example.invalid`,
            phone: null,
            address: null,
            active: false
          }
        });

        await tx.salesOrder.updateMany({
          where: { userId: id },
          data: { customerName: 'Removed user' }
        });

        await tx.auditLog.create({
          data: {
            action: 'USER_ANONYMIZED',
            entity: 'User',
            entityId: id,
            userId: currentUserId || null,
            details: JSON.stringify({
              action: 'anonymized',
              reason: 'Account has order or stock ledger history and was anonymized to protect data privacy',
              ordersCount: salesOrdersCount,
              verifiedOrdersCount,
              stockMovementsCount
            })
          }
        });
      });

      // Disable Firebase user and revoke refresh tokens (resilient to already deleted/missing Firebase accounts)
      if (admin.apps.length > 0 && existing.firebaseUid) {
        try {
          await admin.auth().updateUser(existing.firebaseUid, {
            disabled: true,
            displayName: 'Removed user'
          });
          await admin.auth().revokeRefreshTokens(existing.firebaseUid).catch(() => {});
        } catch (fbErr: any) {
          if (fbErr.code !== 'auth/user-not-found') {
            console.warn(`[UserService] Firebase disable error for user #${id}: ${fbErr.message}`);
          }
        }
      }

      return {
        success: true,
        action: 'anonymized',
        message: 'User account has transactional history and has been anonymized.'
      };
    }

    // No history: completely hard-delete from Firebase and PostgreSQL
    if (admin.apps.length > 0 && existing.firebaseUid) {
      try {
        await admin.auth().deleteUser(existing.firebaseUid);
      } catch (fbErr: any) {
        if (fbErr.code !== 'auth/user-not-found') {
          console.warn(`[UserService] Firebase delete error for user #${id}: ${fbErr.message}`);
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.idempotencyLog.deleteMany({ where: { userId: id } });
      await tx.userConsent.deleteMany({ where: { userId: id } });
      await tx.emailLog.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          action: 'USER_DELETED',
          entity: 'User',
          entityId: id,
          userId: currentUserId || null,
          details: JSON.stringify({
            action: 'deleted',
            deletedUserId: id
          })
        }
      });
    });

    return {
      success: true,
      action: 'deleted',
      message: 'User account completely removed.'
    };
  }
}
