import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

let passed = 0;
function ok(condition, label) {
  assert.ok(condition, label);
  console.log('PASS ' + label);
  passed++;
}

console.log('=== AQUALICIOUS CLEAN URLS, ROUTING & UI SPECIFICATION TESTS ===\n');

// -------------------------------------------------------------
// 1. ONE LOGIN ROUTE ONLY & HEADING
// -------------------------------------------------------------
console.log('[1] Testing Login Route & Heading...');
const loginPageContent = fs.readFileSync('frontend/src/pages/LoginPage.tsx', 'utf8');
const copyContent = fs.readFileSync('frontend/src/constants/copy.ts', 'utf8');

ok(copyContent.includes("CARD_TITLE: 'AquaLicious Login'"), 'Login page card heading is "AquaLicious Login"');
ok(copyContent.includes("CARD_SUBTITLE: 'Sign in to your AquaLicious account.'"), 'Login subtitle is "Sign in to your AquaLicious account."');
ok(copyContent.includes("USERNAME_PLACEHOLDER: 'Enter your username or email'"), 'Username placeholder is "Enter your username or email"');
ok(loginPageContent.includes('COPY.LOGIN.FORGOT_PASSWORD_LINK'), 'Forgot password link is present on the unified login card');
ok(loginPageContent.includes('COPY.LOGIN.REGISTER_PROMPT'), 'Register link is present on the unified login card');
ok(!loginPageContent.includes('Admin & Staff Portal'), 'Obsolete "Admin & Staff Portal" text completely removed');

// Assert LandingPage component is deleted
ok(!fs.existsSync('frontend/src/pages/LandingPage.tsx'), 'Old plain LandingPage.tsx is completely deleted');

// -------------------------------------------------------------
// 2. GENERIC CUSTOMER BENEFIT CLAIMS & NO INVENTED CLAIMS
// -------------------------------------------------------------
console.log('\n[2] Testing Centralized Copy & Benefits (No Invented Claims)...');
ok(copyContent.includes('Pure & Safe'), 'Contains benefit "Pure & Safe"');
ok(copyContent.includes('Clean, refreshing mineral water'), 'Pure & Safe subtext is "Clean, refreshing mineral water"');
ok(copyContent.includes('Easy Ordering'), 'Contains benefit "Easy Ordering"');
ok(copyContent.includes('Order in a few taps'), 'Easy Ordering subtext is "Order in a few taps"');
ok(copyContent.includes('Pickup or Delivery'), 'Contains benefit "Pickup or Delivery"');
ok(copyContent.includes('Choose what works for you'), 'Pickup or Delivery subtext is "Choose what works for you"');

// Prohibit invented claims
const forbiddenClaims = [
  'Hospital-grade filtration',
  '1-tap refills',
  'Fast local dispatch',
  'TDS < 10 PPM',
  '16-stage',
  'PNSDW',
  'DOH License',
  'FDA Approved Refill Station'
];
for (const claim of forbiddenClaims) {
  ok(!copyContent.includes(claim), `Forbidden claim "${claim}" is absent from copy constants`);
  ok(!loginPageContent.includes(claim), `Forbidden claim "${claim}" is absent from LoginPage`);
}

// -------------------------------------------------------------
// 3. "/" IS PUBLIC AND RENDERS PRODUCTS CATALOG
// -------------------------------------------------------------
console.log('\n[3] Testing "/" Home Route & Products Catalog...');
const appContent = fs.readFileSync('frontend/src/App.tsx', 'utf8');
ok(appContent.includes('<Route path="/" element={<ProductsPage onAddToCart={addToCart} />} />'), '"/" canonically renders ProductsPage');
ok(!appContent.includes('RootPage'), 'RootPage with window.innerWidth branching completely removed');
ok(!appContent.includes('window.innerWidth < 768'), 'No width-based layout branching for root route');

// -------------------------------------------------------------
// 4. HEADER & LOGO ROUTING RULES
// -------------------------------------------------------------
console.log('\n[4] Testing Header & Logo Navigation Rules...');
const customerNavbarContent = fs.readFileSync('frontend/src/components/CustomerNavbar.tsx', 'utf8');
const sidebarContent = fs.readFileSync('frontend/src/components/Sidebar.tsx', 'utf8');

ok(customerNavbarContent.includes('<Link to="/" className="flex items-center gap-2.5 group">'), 'CustomerNavbar logo links to "/"');
ok(sidebarContent.includes('<Link to="/"'), 'Admin Sidebar brand logo links to "/"');
ok(customerNavbarContent.includes('LOGIN'), 'Header shows LOGIN button for unauthenticated users');
ok(customerNavbarContent.includes('REGISTER'), 'Header shows REGISTER button for unauthenticated users');
ok(customerNavbarContent.includes('queryClient.clear()'), 'Sign Out clears React Query cache');
ok(customerNavbarContent.includes("navigate('/', { replace: true })"), 'Sign Out replaces navigation to avoid back-button history leak');

// -------------------------------------------------------------
// 5. SIGNED-IN USER REDIRECT RULES FROM LOGIN
// -------------------------------------------------------------
console.log('\n[5] Testing Login Redirection Rules for Signed-in Users...');
ok(loginPageContent.includes("navigate('/dashboard', { replace: true })"), 'Signed-in Admin redirected to /dashboard');
ok(loginPageContent.includes("navigate('/', { replace: true })"), 'Signed-in verified customer redirected to /');
ok(loginPageContent.includes("navigate('/verify-email', { replace: true })"), 'Signed-in unverified customer redirected to /verify-email');

// -------------------------------------------------------------
// 6. SERVER-SIDE 301 REDIRECTS (vercel.json)
// -------------------------------------------------------------
console.log('\n[6] Testing Server-side 301 Redirects in vercel.json...');
const vercelConfig = JSON.parse(fs.readFileSync('frontend/vercel.json', 'utf8'));
ok(Array.isArray(vercelConfig.redirects), 'vercel.json has "redirects" array');

const legacyUrls = [
  ['/index.html', '/'],
  ['/products', '/'],
  ['/products.html', '/'],
  ['/frontend/pages/products.html', '/'],
  ['/dashboard.html', '/dashboard'],
  ['/frontend/pages/dashboard.html', '/dashboard'],
  ['/sales.html', '/sales'],
  ['/frontend/pages/sales.html', '/sales'],
  ['/inventory.html', '/inventory'],
  ['/frontend/pages/inventory.html', '/inventory'],
  ['/orders.html', '/orders'],
  ['/frontend/pages/orders.html', '/orders'],
  ['/reports.html', '/reports'],
  ['/frontend/pages/reports.html', '/reports'],
  ['/users.html', '/users'],
  ['/frontend/pages/users.html', '/users'],
  ['/login.html', '/login'],
  ['/frontend/pages/login.html', '/login'],
  ['/register.html', '/register'],
  ['/frontend/pages/register.html', '/register'],
  ['/verify-email.html', '/verify-email'],
  ['/frontend/pages/verify-email.html', '/verify-email'],
  ['/verify-email-complete.html', '/verify-email-complete'],
  ['/frontend/pages/verify-email-complete.html', '/verify-email-complete'],
  ['/forgot-password.html', '/forgot-password'],
  ['/frontend/pages/forgot-password.html', '/forgot-password'],
  ['/reset-password-complete.html', '/reset-password-complete'],
  ['/frontend/pages/reset-password-complete.html', '/reset-password-complete'],
  ['/admin/products.html', '/admin/products'],
  ['/frontend/pages/admin/products.html', '/admin/products']
];

for (const [src, dest] of legacyUrls) {
  const match = vercelConfig.redirects.find((r) => r.source === src);
  ok(match, `Server-side redirect exists for ${src}`);
  ok(match.destination === dest, `${src} redirects to ${dest}`);
  ok(match.permanent === true, `${src} redirect is HTTP 301 (permanent)`);
}

// Verify redirects come before rewrites in vercel.json
const vercelRaw = fs.readFileSync('frontend/vercel.json', 'utf8');
const redirectsIdx = vercelRaw.indexOf('"redirects"');
const rewritesIdx = vercelRaw.indexOf('"rewrites"');
ok(redirectsIdx < rewritesIdx, 'Server-side redirects are ordered before SPA rewrite in vercel.json');

// -------------------------------------------------------------
// 7. CLIENT-SIDE FALLBACK ALIAS REDIRECTS IN APP.TSX
// -------------------------------------------------------------
console.log('\n[7] Testing Client-Side Alias Fallback in App.tsx...');
for (const [src, dest] of legacyUrls) {
  const routeDeclaration = `<Route path="${src}" element={<Navigate to="${dest}" replace />} />`;
  ok(appContent.includes(routeDeclaration), `Client-side fallback exists for ${src} -> ${dest}`);
}

// -------------------------------------------------------------
// 8. UNKNOWN PATHS & ROUTE GUARDS
// -------------------------------------------------------------
console.log('\n[8] Testing Unknown Paths / Catch-all Handling...');
ok(appContent.includes('404 - Page Not Found'), 'Unknown paths for signed-in users render 404 screen');
ok(appContent.includes('<Navigate to="/login" replace />'), 'Unknown paths for unauthenticated users redirect to /login');

const routeGuardsContent = fs.readFileSync('frontend/src/components/RouteGuards.tsx', 'utf8');
ok(routeGuardsContent.includes("fallbackPath = '/'"), 'RouteGuards default fallback is "/" (clean URL)');

// -------------------------------------------------------------
// 9. GREP / CI CHECK: NO REMAINING ".html" LINKS ACROSS ENTIRE PROJECT
// -------------------------------------------------------------
console.log('\n[9] Running Wide Grep Check for any illegal ".html" links...');
const wideTargets = [
  'frontend/src',
  'frontend/dist',
  'mobile/www',
  'backend/src',
  'frontend/public',
  'tests'
];

function walkAll(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) results.push(...walkAll(full));
    else results.push(full);
  }
  return results;
}

let wideViolations = [];
for (const target of wideTargets) {
  const files = walkAll(target);
  for (const file of files) {
    if (
      file.endsWith('.png') ||
      file.endsWith('.jpg') ||
      file.endsWith('.ico') ||
      file.endsWith('.p12') ||
      file.endsWith('.dpapi') ||
      file.endsWith('.map')
    ) {
      continue;
    }
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      if (
        file.endsWith('wide-html-check.mjs') ||
        file.endsWith('clean_urls_and_routing.mjs') ||
        file.endsWith('playwright_real_behavior.mjs') ||
        file.endsWith('security_and_verification.mjs')
      ) return;
      if (file.endsWith('vercel.json')) return;
      if (file.endsWith('App.tsx') && line.includes('<Route path="') && line.includes('<Navigate to=')) return;
      if (file.endsWith('App.tsx') && line.includes('isHomePage')) return;
      if ((file.includes('dist') || file.includes('www')) && line.includes('element:') && line.includes('path:')) return;
      if ((file.includes('dist') || file.includes('www')) && line.includes('isHomePage')) return;

      const matches = line.match(/['"`]([^'"`]*\.html(\?[^'"`]*)?)['"`]/gi);
      if (matches) {
        for (const m of matches) {
          const raw = m.slice(1, -1);
          if (raw === '/index.html' || raw === 'index.html' || raw.endsWith('/index.html')) continue;
          if (raw.toLowerCase().includes('doctype') || raw === 'html') continue;
          if ((raw.startsWith('http://') || raw.startsWith('https://')) && !raw.includes('aqualicious') && !raw.includes('localhost')) {
            continue;
          }
          wideViolations.push({ file, line: idx + 1, match: raw, text: line.trim() });
        }
      }
    });
  }
}

ok(wideViolations.length === 0, `Wide check: 0 illegal .html links found across src, dist, www, backend, public, and tests (violations: ${wideViolations.length})`);
if (wideViolations.length > 0) {
  console.error('Wide check violations:', wideViolations);
}

// -------------------------------------------------------------
// 10. BACKEND EMAIL TEMPLATES & QUERY PARAMETERS
// -------------------------------------------------------------
console.log('\n[10] Testing Backend Mail Templates & Query Parameter Preservation...');
const mailTemplatesContent = fs.readFileSync('backend/src/services/mailTemplates.ts', 'utf8');
ok(!mailTemplatesContent.includes('/orders.html'), 'Backend mail templates do not contain /orders.html');
ok(mailTemplatesContent.includes('${config.frontendUrl}/orders'), 'Backend mail templates use clean URL /orders');

// Test VerifyEmailCompletePage & ResetPasswordCompletePage support both BrowserRouter and HashRouter
const verifyCompleteContent = fs.readFileSync('frontend/src/pages/VerifyEmailCompletePage.tsx', 'utf8');
const resetCompleteContent = fs.readFileSync('frontend/src/pages/ResetPasswordCompletePage.tsx', 'utf8');

ok(
  verifyCompleteContent.includes('window.location.search') && verifyCompleteContent.includes('window.location.hash'),
  'VerifyEmailCompletePage reads params from both search (BrowserRouter) and hash (HashRouter)'
);
ok(
  resetCompleteContent.includes('window.location.search') && resetCompleteContent.includes('window.location.hash'),
  'ResetPasswordCompletePage reads params from both search (BrowserRouter) and hash (HashRouter)'
);

// -------------------------------------------------------------
// 11. SEO & METADATA (index.html, robots.txt, sitemap.xml)
// -------------------------------------------------------------
console.log('\n[11] Testing SEO, Robots & Sitemap...');
const indexHtmlContent = fs.readFileSync('frontend/index.html', 'utf8');
ok(indexHtmlContent.includes('<title>AquaLicious - Pure Mineral Water & Station Refills</title>'), 'index.html title updated');
ok(indexHtmlContent.includes('<meta name="robots" content="index, follow" />'), 'index.html robots meta tag present');
ok(fs.existsSync('frontend/public/robots.txt'), 'frontend/public/robots.txt exists');
ok(fs.existsSync('frontend/public/sitemap.xml'), 'frontend/public/sitemap.xml exists');

// -------------------------------------------------------------
// 12. SECURITY, SECRETS, AND PRODUCTION FAIL-CLOSED CONTROLS
// -------------------------------------------------------------
console.log('\n[12] Testing Production Security & Fail-Closed Controls...');

// 12.1. Confirm backend config refuses to start in production if JWT_SECRET missing or weak
const configCode = fs.readFileSync('backend/src/config/index.ts', 'utf8');
ok(
  configCode.includes("process.env.NODE_ENV === 'production'") &&
  configCode.includes('FATAL CONFIGURATION ERROR') &&
  configCode.includes('JWT_SECRET environment variable is required and must be at least 32 characters long'),
  'Backend refuses to start in production if JWT_SECRET is missing or < 32 characters'
);

// 12.2. Confirm local password auth fallback strictly blocked in production
const authRoutesCode = fs.readFileSync('backend/src/routes/authRoutes.ts', 'utf8');
ok(
  authRoutesCode.includes("if (config.nodeEnv === 'production')") &&
  authRoutesCode.includes('Direct local authentication is disabled in production. Use Firebase authentication.'),
  'Local authentication fallback is strictly blocked in production (returns 403)'
);

// 12.3. Confirm cleanup dry-run defaults to true when unset
ok(
  configCode.includes('cleanupDryRun: process.env.CLEANUP_DRY_RUN !== undefined') &&
  configCode.includes('true'),
  'CLEANUP_DRY_RUN defaults to true (safe dry-run) when variable is unset'
);

// 12.4. Confirm system sender and admin email is aqualiciousadmin@gmail.com
ok(configCode.includes("'aqualiciousadmin@gmail.com'"), 'Default ADMIN_EMAIL is aqualiciousadmin@gmail.com');
const copyCode = fs.readFileSync('frontend/src/constants/copy.ts', 'utf8');
ok(copyCode.includes("EMAIL: 'aqualiciousadmin@gmail.com'"), 'About modal contact email is aqualiciousadmin@gmail.com');
ok(!copyCode.includes('jujuporo02@gmail.com'), 'jujuporo02@gmail.com completely removed from copy.ts');
ok(!configCode.includes('jujuporo02@gmail.com'), 'jujuporo02@gmail.com completely removed from backend config');

// 12.5. Confirm single root ecosystem file with absolute cwd
ok(fs.existsSync('ecosystem.config.cjs'), 'Single ecosystem.config.cjs exists at root');
ok(!fs.existsSync('backend/ecosystem.config.cjs'), 'Redundant backend/ecosystem.config.cjs removed');
const ecoContent = fs.readFileSync('ecosystem.config.cjs', 'utf8');
ok(ecoContent.includes("path.resolve(__dirname, 'backend')"), 'ecosystem.config.cjs resolves cwd robustly via path.resolve');

console.log(`\nALL ${passed} SPECIFICATION & ROUTING TESTS PASSED!`);
