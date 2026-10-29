export interface ServerNode {
  url: string;
  label: string;
  isPrimary: boolean;
  status: 'online' | 'offline' | 'checking';
  latencyMs?: number;
}

export const EXPECTED_CLUSTER_ID = 'aqualicious-cluster-primary';

// API base URL configured strictly via build-time VITE_API_URL
const apiBaseUrl = ((import.meta as any).env?.VITE_API_URL || '').replace(/\/$/, '');

class MultiServerResolver {
  private apiBaseUrl: string;
  private token: string = '';

  constructor() {
    this.apiBaseUrl = apiBaseUrl;
    this.token = localStorage.getItem('aq_token') || sessionStorage.getItem('aq_token') || '';
  }

  public setToken(token: string) {
    this.token = token;
    if (token) {
      localStorage.setItem('aq_token', token);
    } else {
      localStorage.removeItem('aq_token');
    }
  }

  public getToken(): string {
    return this.token;
  }

  public getServers(): ServerNode[] {
    return [
      {
        url: this.apiBaseUrl || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8088'),
        label: 'API Server',
        isPrimary: true,
        status: 'online'
      }
    ];
  }

  public getActiveServer(): string {
    return this.apiBaseUrl || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8088');
  }

  public async verifyCluster(serverUrl: string): Promise<boolean> {
    try {
      const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/config`, {
        signal: AbortSignal.timeout(5000),
        headers: {
          'X-AquaLicious-Cluster-Id': EXPECTED_CLUSTER_ID
        }
      });
      if (!res.ok) return false;
      const data = await res.json();
      return data.cluster_id === EXPECTED_CLUSTER_ID;
    } catch {
      return false;
    }
  }

  /**
   * Dispatches an HTTP request directly to the configured API base URL.
   * Injects authorization and idempotency headers.
   */
  public async request<T = any>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
      data?: any;
      headers?: Record<string, string>;
      idempotencyKey?: string;
    } = {}
  ): Promise<T> {
    const { method = 'GET', data, headers = {}, idempotencyKey } = options;
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const targetUrl = `${this.apiBaseUrl}${cleanEndpoint}`;

    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-AquaLicious-Cluster-Id': EXPECTED_CLUSTER_ID,
      ...headers
    };

    if (this.token) {
      reqHeaders['Authorization'] = `Bearer ${this.token}`;
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

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 403 && json.code === 'CONSENT_REQUIRED') {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('aqualicious:consent-required'));
        }
      }
      const err = new Error(json.error || `Request failed with status ${res.status}`);
      (err as any).status = res.status;
      (err as any).code = json.code;
      throw err;
    }

    return json as T;
  }
}

export const resolver = new MultiServerResolver();
