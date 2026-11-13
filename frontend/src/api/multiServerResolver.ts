export interface ServerNode {
  url: string;
  label: string;
  isPrimary: boolean;
  status: 'online' | 'offline' | 'checking';
  latencyMs?: number;
}

export const EXPECTED_CLUSTER_ID = 'aqualicious-cluster-primary';

const isCapacitor = typeof window !== 'undefined' && (
  (window as any).Capacitor !== undefined ||
  window.location.protocol === 'capacitor:' ||
  window.location.protocol === 'file:'
);

const isBrowserRemote = isCapacitor || (
  typeof window !== 'undefined' &&
  window.location.hostname !== 'localhost' &&
  window.location.hostname !== '127.0.0.1'
);

const defaultRemoteUrl = 'https://muscular-donator-uncloak.ngrok-free.dev';

// API base URL configured via build-time VITE_API_URL, defaulting to ngrok when running remotely (Vercel/Capacitor)
const configuredApiUrl = ((import.meta as any).env?.VITE_API_URL || '').replace(/\/$/, '');
const apiBaseUrl = configuredApiUrl || (isBrowserRemote ? defaultRemoteUrl : 'http://localhost:8088');

class MultiServerResolver {
  private apiBaseUrl: string;
  private token: string = '';
  private tokenRefresher: ((forceRefresh?: boolean) => Promise<string | null>) | null = null;

  constructor() {
    this.apiBaseUrl = apiBaseUrl;
    this.token = localStorage.getItem('aq_token') || sessionStorage.getItem('aq_token') || '';
  }

  public setTokenRefresher(fn: (forceRefresh?: boolean) => Promise<string | null>) {
    this.tokenRefresher = fn;
  }

  public setToken(token: string) {
    this.token = token;
    if (token) {
      localStorage.setItem('aq_token', token);
    } else {
      localStorage.removeItem('aq_token');
      sessionStorage.removeItem('aq_token');
    }
  }

  public getToken(): string {
    return this.token;
  }

  public async getFreshToken(forceRefresh = false): Promise<string> {
    if (this.tokenRefresher) {
      try {
        const refreshed = await this.tokenRefresher(forceRefresh);
        if (refreshed) {
          this.setToken(refreshed);
          return refreshed;
        }
      } catch {
        // Fall back to existing stored token if Firebase refresh throws
      }
    }
    return this.token;
  }

  public getActiveServer(): string {
    return this.apiBaseUrl || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8088');
  }

  /**
   * Dispatches an HTTP request directly to the configured API base URL.
   * Injects authorization and idempotency headers, automatically refreshes Firebase ID tokens,
   * and handles 401 session expiration cleanly.
   */
  public async request<T = any>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
      data?: any;
      headers?: Record<string, string>;
      idempotencyKey?: string;
      _retried?: boolean;
    } = {}
  ): Promise<T> {
    const { method = 'GET', data, headers = {}, idempotencyKey, _retried = false } = options;
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const targetUrl = `${this.apiBaseUrl}${cleanEndpoint}`;
    const isPublicAuthPost = method === 'POST' && (cleanEndpoint === '/api/auth' || cleanEndpoint === '/api/auth/forgot-password');

    let activeToken = this.token;
    if (activeToken && !isPublicAuthPost && !headers['Authorization']) {
      activeToken = await this.getFreshToken(false);
    }

    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-AquaLicious-Cluster-Id': EXPECTED_CLUSTER_ID,
      'ngrok-skip-browser-warning': 'true',
      ...headers
    };

    if (activeToken && !reqHeaders['Authorization']) {
      reqHeaders['Authorization'] = `Bearer ${activeToken}`;
    }

    if (idempotencyKey) {
      reqHeaders['Idempotency-Key'] = idempotencyKey;
    }

    const res = await fetch(targetUrl, {
      method,
      headers: reqHeaders,
      body: data ? JSON.stringify(data) : undefined,
      signal: AbortSignal.timeout(10000)
    });

    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.toLowerCase().includes('application/json');

    if (!isJson) {
      console.error(`[API Client] Non-JSON response received from ${method} ${targetUrl} (status ${res.status}, content-type: ${contentType})`);
      const friendlyErr = new Error("The server isn't reachable right now. Please try again in a moment.");
      (friendlyErr as any).status = res.ok ? 503 : res.status;
      (friendlyErr as any).code = 'SERVER_UNREACHABLE';
      throw friendlyErr;
    }

    let json: any = {};
    try {
      json = await res.json();
    } catch (parseErr) {
      console.error(`[API Client] JSON parse error from ${method} ${targetUrl}:`, parseErr);
      const friendlyErr = new Error("The server isn't reachable right now. Please try again in a moment.");
      (friendlyErr as any).status = res.status;
      (friendlyErr as any).code = 'INVALID_JSON_RESPONSE';
      throw friendlyErr;
    }

    if (!res.ok) {
      const rawMsg = String(json.error || '');
      const isTokenError =
        res.status === 401 ||
        json.code === 'AUTH_TOKEN_INVALID' ||
        rawMsg.includes('no "kid" claim') ||
        rawMsg.includes('Firebase ID token');

      if (isTokenError && !isPublicAuthPost) {
        if (res.status === 401 && !_retried && this.tokenRefresher) {
          const fresh = await this.getFreshToken(true);
          if (fresh && fresh !== activeToken) {
            return this.request<T>(endpoint, { ...options, _retried: true });
          }
        }
        this.setToken('');
        if (typeof window !== 'undefined') {
          try {
            sessionStorage.setItem('aq_auth_notice', 'Your session has expired. Please sign in again.');
          } catch {}
          window.dispatchEvent(new CustomEvent('aqualicious:session-expired'));
        }
      }
      if (res.status === 403 && json.code === 'CONSENT_REQUIRED') {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('aqualicious:consent-required'));
        }
      }
      const safeErrorMsg =
        rawMsg.includes('no "kid" claim') || rawMsg.includes('firebase.google.com/docs')
          ? 'Your session has expired. Please sign in again.'
          : rawMsg || `Request failed with status ${res.status}`;
      const err = new Error(safeErrorMsg);
      (err as any).status = res.status;
      (err as any).code = json.code;
      throw err;
    }

    return json as T;
  }

  /**
   * Fetches binary blob (e.g. raw payment proof image) from configured API base URL,
   * injecting auth token, cluster id, and ngrok-skip-browser-warning headers.
   */
  public async fetchBlob(endpoint: string, options: { _retried?: boolean } = {}): Promise<Blob> {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const targetUrl = `${this.apiBaseUrl}${cleanEndpoint}`;

    let activeToken = this.token;
    if (activeToken) {
      activeToken = await this.getFreshToken(false);
    }

    const reqHeaders: Record<string, string> = {
      'X-AquaLicious-Cluster-Id': EXPECTED_CLUSTER_ID,
      'ngrok-skip-browser-warning': 'true',
      Accept: 'image/jpeg, image/png, image/*, */*'
    };

    if (activeToken) {
      reqHeaders['Authorization'] = `Bearer ${activeToken}`;
    }

    const res = await fetch(targetUrl, {
      method: 'GET',
      headers: reqHeaders,
      signal: AbortSignal.timeout(15000)
    });

    if (!res.ok) {
      if (res.status === 401 && !options._retried && this.tokenRefresher) {
        const fresh = await this.getFreshToken(true);
        if (fresh && fresh !== activeToken) {
          return this.fetchBlob(endpoint, { _retried: true });
        }
      }
      const contentType = res.headers.get('content-type') || '';
      let errMsg = `Failed to load image (status ${res.status})`;
      if (contentType.toLowerCase().includes('application/json')) {
        try {
          const json = await res.json();
          errMsg = json.error || errMsg;
        } catch {}
      }
      console.error(`[API Client] Error fetching image blob from ${targetUrl} (status ${res.status}): ${errMsg}`);
      const err = new Error(errMsg);
      (err as any).status = res.status;
      throw err;
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('image/') && !contentType.toLowerCase().startsWith('application/octet-stream')) {
      console.error(`[API Client] Expected image blob from ${targetUrl} but received non-image content-type: ${contentType}`);
      const err = new Error("The server isn't reachable right now. Please try again in a moment.");
      (err as any).status = 503;
      (err as any).code = 'INVALID_IMAGE_RESPONSE';
      throw err;
    }

    return await res.blob();
  }
}

export const resolver = new MultiServerResolver();
