import { Router, Request, Response } from 'express';
import { ReportService } from '../services/reportService.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticate, async (req: Request, res: Response) => {
  const days = req.query.days ? Number(req.query.days) : 30;

  try {
    const report = await ReportService.getAnalytics(req.user!.role, days);
    return res.json(report);
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message || 'Report generation failed' });
  }
});

export default router;
