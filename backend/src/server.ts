import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config, prisma } from './config/index.js';
import { Mailer } from './services/mailer.js';
import { AccountCleanupService } from './services/accountCleanupService.js';
import { UnpaidOrderCleanupService } from './services/unpaidOrderCleanupService.js';
import { securityHeaders, corsHandler, apiLimiter } from './middleware/security.js';

import authRoutes from './routes/authRoutes.js';
import productRoutes from './routes/productRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js';
import salesRoutes from './routes/salesRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import userRoutes from './routes/userRoutes.js';
import configRoutes, { versionHandler, adminSystemStatusHandler, adminStatusMiddlewares } from './routes/configRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();

  // Initialize outbound mail transport (Gmail SMTP / Mock)
  Mailer.initialize();

  // Trust reverse proxy headers (ngrok, Vercel, Nginx, Docker)
  app.set('trust proxy', 1);

  // Basic security and parsing
  app.use(securityHeaders);
  app.use(corsHandler);
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));
  app.use('/api', apiLimiter);

  // Mount standard REST API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/sales', salesRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/config', configRoutes);
  app.get('/api/version', versionHandler);
  app.get('/api/admin/system-status', ...adminStatusMiddlewares, adminSystemStatusHandler);

  // Legacy PHP compatibility aliases (for existing tests & scripts)
  app.use('/backend/api/auth.php', authRoutes);
  app.use('/backend/api/products.php', productRoutes);
  app.use('/backend/api/inventory.php', inventoryRoutes);
  app.use('/backend/api/sales.php', salesRoutes);
  app.use('/backend/api/orders.php', orderRoutes);
  app.use('/backend/api/reports.php', reportRoutes);
  app.use('/backend/api/users.php', userRoutes);
  app.use('/backend/api/config.php', configRoutes);

  // Direct root compatibility (e.g. for fetch('products.php'))
  app.use('/products.php', productRoutes);
  app.use('/sales.php', salesRoutes);
  app.use('/inventory.php', inventoryRoutes);
  app.use('/orders.php', orderRoutes);
  app.use('/reports.php', reportRoutes);
  app.use('/users.php', userRoutes);
  app.use('/config.php', configRoutes);
  app.use('/auth.php', authRoutes);

  // Catch-all JSON 404 for any unhandled /api or /backend/api path across all HTTP methods
  app.all(['/api', '/api/*', '/backend/api', '/backend/api/*'], (_req: Request, res: Response) => {
    return res.status(404).json({
      error: 'Endpoint not found',
      code: 'NOT_FOUND'
    });
  });

  // Static files for client (if built)
  const clientDist = path.resolve(__dirname, '../../frontend/dist');
  app.use(express.static(clientDist));
  app.use('/frontend/pages/assets', express.static(path.join(clientDist, 'assets')));
  app.use('/pages/assets', express.static(path.join(clientDist, 'assets')));
  app.use('/deliverables', express.static(path.join(clientDist, 'deliverables')));
  app.use('/deliverables', express.static(path.resolve(__dirname, '../../deliverables')));
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.includes('/assets/')) {
      const assetName = path.basename(req.path);
      const targetFile = path.join(clientDist, 'assets', assetName);
      if (fs.existsSync(targetFile)) {
        return res.sendFile(targetFile);
      }
    }
    next();
  });

  // Legacy .html HTTP 301 Permanent Redirects (strictly preserves query strings)
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' && /\.html$/i.test(req.path) && !req.path.includes('/assets/')) {
      const cleanPath = req.path.replace(/\.html$/i, '');
      const targetPath = cleanPath === '/index' ? '/' : cleanPath;
      const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      return res.redirect(301, targetPath + query);
    }
    next();
  });

  // Fallback for single page application (SPA) routing
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/backend/api') || req.path.endsWith('.php')) {
      return res.status(404).json({ error: 'Endpoint not found' });
    }
    const indexHtml = path.join(clientDist, 'index.html');
    res.sendFile(indexHtml, (err) => {
      if (err) {
        res.status(404).json({ error: 'Resource not found' });
      }
    });
  });

  // Global Error Handler with Transient Database Connection Reset Recovery
  app.use(async (err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('Unhandled server error:', err);
    const isDbReset =
      err?.code === 'P1001' ||
      err?.code === 'P1002' ||
      err?.code === 'P1017' ||
      err?.name === 'PrismaClientInitializationError' ||
      err?.name === 'PrismaClientRustPanicError' ||
      err?.message?.includes('closed the connection') ||
      err?.message?.includes('Connection terminated') ||
      err?.message?.includes('ECONNRESET') ||
      err?.message?.includes('ECONNREFUSED');

    if (isDbReset) {
      console.warn('[DB Recovery] Transient database connection reset detected. Triggering reconnection and returning 503.');
      prisma.$disconnect().then(() => prisma.$connect()).catch((reconnectErr: any) => {
        console.error('[DB Recovery] Reconnection retry error:', reconnectErr.message);
      });
      res.setHeader('Retry-After', '1');
      return res.status(503).json({
        error: 'Database connection temporarily unavailable. Please retry.',
        code: 'DATABASE_UNAVAILABLE'
      });
    }

    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Internal server error' });
  });

  return app;
}

process.on('uncaughtException', (err: any) => {
  console.error('[Process] Caught uncaught exception (recovering without crash):', err?.stack || err?.message || err);
  if (
    err?.code === 'P1017' ||
    err?.message?.includes('closed the connection') ||
    err?.message?.includes('ECONNRESET')
  ) {
    prisma.$disconnect().then(() => prisma.$connect()).catch(() => {});
  }
});

process.on('unhandledRejection', (reason: any) => {
  console.warn('[Process] Caught unhandled rejection (recovering without crash):', reason?.message || reason);
  if (
    reason?.code === 'P1017' ||
    reason?.message?.includes('closed the connection') ||
    reason?.message?.includes('ECONNRESET')
  ) {
    prisma.$disconnect().then(() => prisma.$connect()).catch(() => {});
  }
});

const isMain = Boolean(
  process.env.pm_id !== undefined ||
  process.env.NODE_APP_INSTANCE !== undefined ||
  (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === path.resolve(process.argv[1]).toLowerCase())
);

if (isMain) {
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`AquaLicious Express Server running on port ${config.port} (IPv4 + IPv6)`);
    console.log(`Cluster ID: ${config.clusterId}`);
    console.log(`Timezone: ${config.timezone}`);

    // Start scheduled unverified account cleanup & unpaid order auto-cancel (PM2 cluster worker 0 guard)
    AccountCleanupService.startSchedule();
    UnpaidOrderCleanupService.startSchedule();

    // Notify PM2 that process is ready to handle connections
    if (process.send) {
      process.send('ready');
    }
  });
}
