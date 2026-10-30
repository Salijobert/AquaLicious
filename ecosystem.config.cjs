const path = require('node:path');

module.exports = {
  apps: [
    {
      name: 'aqualicious-api',
      cwd: path.resolve(__dirname, 'backend'),
      script: path.resolve(__dirname, 'backend', 'dist', 'server.js'),
      instances: 'max',
      exec_mode: 'cluster',
      wait_ready: true,
      listen_timeout: 10000,
      kill_timeout: 5000,
      max_restarts: 5,
      min_uptime: '10s',
      exp_backoff_restart_delay: 100,
      env: {
        NODE_ENV: 'production',
        PORT: 8088,
        ALLOW_LOCAL_AUTH_FALLBACK: 'true',
        CLEANUP_DRY_RUN: 'true',
        AQ_ADMIN_PASSWORD: 'admin123'
      }
    }
  ]
};
