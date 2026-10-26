# AquaLicious Web and API

This is the live implementation. Serve this directory through PHP with MySQL configured; opening HTML as a local file is not supported. See `../docs/DEPLOYMENT.md` for setup and `../docs/API.md` for endpoints.

Install backend dependencies with `composer install --no-dev` in `backend/`. Import `backend/schema.sql` into a fresh database. Set the environment variables documented in `backend/.env.example`; the example file is not loaded automatically. Provision the first Administrator using the CLI, then record opening stock through Inventory.

The pages use authenticated API calls. No browser-backed product, sales or inventory store remains. Only the web session's short-lived JWT is held in sessionStorage. Mobile stores the server URL in localStorage and keeps its token in memory. Passwords are never persisted by either client.
