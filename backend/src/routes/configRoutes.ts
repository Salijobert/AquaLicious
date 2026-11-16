import { Router, Request, Response } from 'express';
import { config } from '../config/index.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { Mailer } from '../services/mailer.js';
import { Role } from '@prisma/client';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const clientClusterId = req.headers['x-aqualicious-cluster-id'];
  if (clientClusterId && clientClusterId !== config.clusterId) {
    return res.status(400).json({ error: 'Cluster ID mismatch: server does not belong to expected cluster' });
  }

  return res.json({
    cluster_id: config.clusterId,
    timezone: config.timezone,
    polling_interval_ms: 5000,
    unpaid_order_ttl_minutes: config.unpaidOrderTtlMinutes,
    max_unpaid_pending_orders: config.maxUnpaidPendingOrders,
    gcash_qr_url: config.gcashQrUrl,
    maya_qr_url: config.mayaQrUrl,
    terms_version: config.termsVersion,
    terms_version_allowlist: config.termsVersionAllowlist,
    server_time: new Date().toISOString()
  });
});

export function versionHandler(_req: Request, res: Response) {
  return res.json({
    version: '2.0.8',
    build_id: config.buildId,
    terms_version: config.termsVersion,
    terms_version_allowlist: config.termsVersionAllowlist,
    server_time: new Date().toISOString()
  });
}

export async function adminSystemStatusHandler(_req: Request, res: Response) {
  const mailStatus = Mailer.getStatus();
  const outboxStats = await Mailer.getOutboxStats();

  return res.json({
    build_id: config.buildId,
    version: '2.0.8',
    node_env_production: config.nodeEnv === 'production',
    local_auth_fallback_enabled: config.nodeEnv === 'test' && process.env.ALLOW_LOCAL_AUTH_FALLBACK === 'true',
    jwt_secret_strength: config.jwtSecret.trim().length >= 32 ? 'ok' : 'weak',
    mail_transport_verified: mailStatus.configured,
    mail_transport_status: mailStatus.status,
    outbox: outboxStats,
    terms_version: config.termsVersion,
    terms_version_allowlist: config.termsVersionAllowlist,
    cleanup_dry_run: config.cleanupDryRun,
    auto_cancel_dry_run: config.autoCancelDryRun,
    unpaid_order_ttl_minutes: config.unpaidOrderTtlMinutes,
    max_unpaid_pending_orders: config.maxUnpaidPendingOrders
  });
}

export const adminStatusMiddlewares = [authenticate, requireRole(Role.ADMIN)];

export default router;
