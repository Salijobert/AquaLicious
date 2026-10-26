import { Router, Request, Response } from 'express';
import { config } from '../config/index.js';

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
    gcash_qr_url: config.gcashQrUrl,
    maya_qr_url: config.mayaQrUrl,
    server_time: new Date().toISOString()
  });
});

export default router;
