import { prisma } from '../config/index.js';
import { Role } from '@prisma/client';
import { sanitize } from '../middleware/security.js';

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
    if (data.name !== undefined) updateData.name = sanitize(data.name);
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

  static async deleteUser(id: number) {
    const existing = await prisma.user.findUnique({
      where: { id },
      include: {
        salesOrders: { select: { id: true } },
        stockMovements: { select: { id: true } }
      }
    });

    if (!existing) {
      throw { status: 404, message: 'User not found' };
    }

    // Prevent deleting the last active Administrator
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
    }

    if (existing.salesOrders.length > 0 || existing.stockMovements.length > 0) {
      throw {
        status: 409,
        message: 'Cannot delete user with existing sales orders or stock ledger records. Deactivate account instead.'
      };
    }

    await prisma.user.delete({ where: { id } });
    return { success: true, message: 'User deleted' };
  }
}
