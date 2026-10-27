import { prisma } from '../config/index.js';
import { Role, ProductType } from '@prisma/client';
import { sanitize } from '../middleware/security.js';

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
      SELECT id, name, "volumeLabel"
      FROM products
      WHERE lower(trim(name)) = lower(trim(${name}))
        AND lower(trim("volumeLabel")) = lower(trim(${volumeLabel}))
      LIMIT 1
    `;

    if (existingConflict.length > 0) {
      throw {
        status: 409,
        message: `A product with name '${name}' and volume '${volumeLabel}' already exists (ID: ${existingConflict[0].id})`
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
        SELECT id, name, "volumeLabel"
        FROM products
        WHERE lower(trim(name)) = lower(trim(${finalName}))
          AND lower(trim("volumeLabel")) = lower(trim(${finalVolume}))
          AND id != ${id}
        LIMIT 1
      `;

      if (existingConflict.length > 0) {
        throw {
          status: 409,
          message: `A product with name '${finalName}' and volume '${finalVolume}' already exists (ID: ${existingConflict[0].id})`
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
}
