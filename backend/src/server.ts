import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from './config/index.js';
import { securityHeaders, corsHandler, apiLimiter } from './middleware/security.js';

import authRoutes from './routes/authRoutes.js';
import productRoutes from './routes/productRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js';
import salesRoutes from './routes/salesRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import userRoutes from './routes/userRoutes.js';
import configRoutes from './routes/configRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();

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

  // Static files for client (if built)
  const clientDist = path.resolve(__dirname, '../../frontend/dist');
  app.use(express.static(clientDist));
  app.use('/frontend/pages/assets', express.static(path.join(clientDist, 'assets')));
  app.use('/pages/assets', express.static(path.join(clientDist, 'assets')));
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

  // Global Error Handler
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('Unhandled server error:', err);
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Internal server error' });
  });

  return app;
}

const app = createApp();
app.listen(config.port, () => {
  console.log(`AquaLicious Express Server running on port ${config.port} (IPv4 + IPv6)`);
  console.log(`Cluster ID: ${config.clusterId}`);
  console.log(`Timezone: ${config.timezone}`);
});
