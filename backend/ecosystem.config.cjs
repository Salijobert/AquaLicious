module.exports = {
  apps: [
    {
      name: 'aqualicious-backend',
      script: './dist/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 8088,
        ALLOW_LOCAL_AUTH_FALLBACK: 'true'
      }
    }
  ]
};
