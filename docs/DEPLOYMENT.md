# Deployment and connecting the clients

## 1. Database

Use a **fresh** MySQL 8 database. The SQL also runs on MariaDB 10.4, which was used for local verification. Back up existing records before migration; the new schema intentionally does not silently overwrite the prototype's single-item schema.

```powershell
Get-Content -Raw 'E:/AquaLicious/aqualicious website/backend/schema.sql' | mysql --host=127.0.0.1 --user=root -p
```

Create a dedicated application user with a unique password. Grant SELECT/INSERT/UPDATE on users, products, sales, orders, order_payments and auth_attempts; SELECT/INSERT on sale_items, order_items, stock_movements and audit_events. Do not give the runtime user schema-alteration privileges. The schema installs triggers that reject ledger UPDATE/DELETE even if accidentally granted. Keep MySQL on a private interface.

Opening stock is zero. After creating an Administrator, enter actual opening balances through Inventory → Restock/correct with a reason. Initial product costs/prices are sample catalog values; review them before trading.

## 2. Backend and web

Install PHP 8.2 or later with PDO MySQL and fileinfo. In `aqualicious website/backend`:

```powershell
composer install --no-dev --prefer-dist --optimize-autoloader
```

Set environment variables in the service/process that runs PHP. `.env.example` lists them; no automatic `.env` loader is used. Never place actual secrets in HTML or JavaScript.

```powershell
$env:DB_HOST='127.0.0.1'
$env:DB_PORT='3306'
$env:DB_NAME='aqualicious_db'
$env:DB_USER='aqualicious'
$env:DB_PASSWORD=Read-Host 'Database password' -MaskInput
$env:JWT_SECRET=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$env:CORS_ORIGINS='https://localhost,https://your-domain.example'
# Use actual merchant-owned QR images, publicly reachable over HTTPS:
$env:GCASH_QR_URL='https://your-domain.example/merchant/gcash.png'
$env:MAYA_QR_URL='https://your-domain.example/merchant/maya.png'
```

Keep JWT_SECRET stable in your deployment secret manager. Rotation invalidates existing tokens. CORS `https://localhost` is the Capacitor WebView origin; list the exact development web origin if testing the mobile web bundle in a browser. Native Capacitor HTTP does not rely on browser CORS; authorization still applies to every protected endpoint.

Provision the first account locally, without a default password:

```powershell
$env:AQ_ADMIN_PASSWORD=Read-Host 'New Administrator password (12–72 bytes)' -MaskInput
php create-admin.php station-owner 'Station Owner'
Remove-Item Env:AQ_ADMIN_PASSWORD
```

For local development, from `aqualicious website`:

```powershell
php -S 0.0.0.0:8080 backend/router.php
```

Open `http://localhost:8080` and log in. The PHP development server is **not** the production server. Use Apache/PHP-FPM with HTTPS in production, document root restricted to `aqualicious website`, and environment variables injected through the service manager. `.htaccess` blocks configuration/schema access on Apache. For Nginx use the supplied example and adapt certificate paths and PHP socket. Do not expose the repository root, backups, tests, SDK directories or signing files.

Configure `post_max_size=5M`, `memory_limit=128M` or higher, PHP error logging outside the web root, and `display_errors=Off`. Back up MySQL, including private payment proof blobs; restrict and encrypt backups. Schedule removal of stale auth_attempts windows. Serve a privacy notice explaining account data and receipt retention before public launch.

## 3. Android build

### Optional container deployment

At the workspace root, `compose.yaml` supplies MySQL 8.4 and Apache/PHP 8.3. Export DB_PASSWORD, MYSQL_ROOT_PASSWORD, JWT_SECRET and CORS_ORIGINS in the shell, then run `docker compose up -d --build`. The database is private and the web container binds only to host loopback port 8080 for a TLS reverse proxy. Initialization creates the schema and reduces the runtime account's grants. Provision an Administrator with `docker compose exec -e AQ_ADMIN_PASSWORD web php backend/create-admin.php station-owner 'Station Owner'` after setting AQ_ADMIN_PASSWORD locally; clear it afterward. This container path was supplied but not executed here because Docker's engine was unavailable. Do not remove its data volume during routine updates.

### Native Android build

The checked-in Android project includes the Gradle wrapper, manifest, application ID `com.aqualicious.pos`, minimum Android API 24, target API 36 and all client screens. Install Node 22+, Java 21 and Android SDK platform/build tools 36. A local toolchain may be present in `.tools/` from verification; it is excluded from source control.

```powershell
cd E:/AquaLicious/mobile
npm ci
npm run sync
$env:JAVA_HOME='C:/path/to/jdk-21'
$env:ANDROID_HOME='C:/path/to/Android/Sdk'
cd android
.\gradlew.bat assembleDebug
```

Debug output: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`. On macOS/Linux use `./gradlew assembleDebug`.

For release, use your station's signing key, or securely back up the generated local key if one was created during this build. **Future updates must use the same key.** Never commit it or distribute the password with the APK.

```powershell
$env:AQ_KEYSTORE='E:/secure/aqualicious-release.jks'
$env:AQ_STORE_PASSWORD=Read-Host 'Keystore password' -MaskInput
$env:AQ_KEY_ALIAS='aqualicious'
$env:AQ_KEY_PASSWORD=Read-Host 'Key password' -MaskInput
.\gradlew.bat assembleRelease
```

Release output: `mobile/android/app/build/outputs/apk/release/app-release.apk`. Release builds refuse to run without signing configuration. Release Android traffic requires HTTPS. Debug builds permit local HTTP for LAN/emulator development. Debug APKs are for testing, not production distribution.

`tools/build-local-release.ps1` can create and reuse a project signing key at `private-signing/aqualicious-release.p12`. Its password is protected for the current Windows user/machine in `private-signing/password.dpapi`. That password file alone is not portable to another machine. Before distributing the APK, back up the keystore and recover/store its password in your secure password manager. The signing folder is excluded from both source and deployment ZIPs. The script reuses an existing key and refuses to replace an orphaned password file.

Install with `adb install -r path/to/apk` or transfer the APK to the device and open it. Installation by file requires permitting that file manager to install apps. A release APK cannot update a debug APK with a different signing key; use a clean test device or uninstall the debug app first.

## 4. Server Connection Settings

Open the Android drawer → Server Settings. Enter `https://your-domain.example/backend/api`. The API base includes `backend/api` and excludes a trailing endpoint filename. Changing the URL clears authentication. Production HTTPS must have a certificate trusted by Android.

For a physical phone on the same LAN, use the development computer's private IP, for example `http://192.168.1.100:8080/backend/api`, with a **debug APK**. Allow TCP 8080 through the host firewall on the private network. `localhost` on a phone points to the phone itself. An Android Studio emulator uses `http://10.0.2.2:8080/backend/api` for its host computer. The release app requires HTTPS, including on a private network.

No real GCash/Maya merchant QR was included in the assets. Configure authentic merchant QR URLs; otherwise QR checkout is disabled server-side. The mockup QR is not used for collecting money. Customers upload a reference and receipt; an Administrator must compare it with the real merchant wallet before selecting Verify payment.

## 5. Synchronization smoke test

1. Sign in on web as Administrator. Record stock and open Dashboard or Orders.
2. Register/sign in as Customer on Android. Add a product and place a CASH pickup order.
3. Within five seconds, the web order count/list updates and stock decreases by the reserved amount.
4. On web, Start refilling, then Complete/hand over and confirm cash collection. Android updates its timeline and the sale appears in reports. Stock must not decrease a second time.
5. Place a second pending order and cancel it. Stock returns exactly once.
6. For QR, submit receipt evidence, verify it against the wallet, then repeat fulfillment. A submission alone must never mark payment verified.
7. Disconnect the phone. Checkout must show a connection error, never a fake success. Reconnect and retry the same unchanged cart to recover a lost response without a duplicate sale/order.

## Source references

- [Capacitor environment setup](https://capacitorjs.com/docs/getting-started/environment-setup)
- [Android command-line tools](https://developer.android.com/studio)
- [PHP bcrypt password hashing](https://www.php.net/manual/en/function.password-hash.php)
