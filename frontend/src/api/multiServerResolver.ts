export interface ServerNode {
  url: string;
  label: string;
  isPrimary: boolean;
  status: 'online' | 'offline' | 'checking';
  latencyMs?: number;
}

const isBrowserRemote = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
const ngrokUrl = 'https://muscular-donator-uncloak.ngrok-free.dev';

const DEFAULT_SERVERS: ServerNode[] = [
  {
    url: (import.meta as any).env?.VITE_API_URL || (isBrowserRemote ? ngrokUrl : 'http://localhost:8088'),
    label: isBrowserRemote ? 'ngrok Public Endpoint' : 'Local Node (8088)',
    isPrimary: true,
    status: 'checking'
  },
  {
    url: ngrokUrl,
    label: 'ngrok Tunnel (Public)',
    isPrimary: false,
    status: 'checking'
  },
  {
    url: 'http://localhost:8088',
    label: 'Local Node (8088)',
    isPrimary: false,
    status: 'checking'
  }
];

export const EXPECTED_CLUSTER_ID = 'aqualicious-cluster-primary';

class MultiServerResolver {
  private servers: ServerNode[];
  private activeIndex: number = 0;
  private token: string = '';

  constructor() {
    const saved = localStorage.getItem('aq_servers');
    if (saved) {
      try {
        this.servers = JSON.parse(saved);
      } catch {
        this.servers = DEFAULT_SERVERS;
      }
    } else {
      this.servers = DEFAULT_SERVERS;
    }
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
    return [...this.servers];
  }

  public setServers(servers: ServerNode[]) {
    this.servers = servers;
    localStorage.setItem('aq_servers', JSON.stringify(servers));
  }

  public getActiveServer(): string {
    return this.servers[this.activeIndex]?.url || 'http://localhost:8088';
  }

  public async verifyCluster(serverUrl: string): Promise<boolean> {
    try {
      const start = Date.now();
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
   * Dispatches an HTTP request with automatic cluster-aware failover.
   * Preserves idempotency keys across server retries.
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

    let lastError: Error | null = null;
    const startIndex = this.activeIndex;
    const serverCount = this.servers.length;

    for (let attempt = 0; attempt < serverCount; attempt++) {
      const idx = (startIndex + attempt) % serverCount;
      const targetServer = this.servers[idx]!.url.replace(/\/$/, '');

      try {
        const reqHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-AquaLicious-Cluster-Id': EXPECTED_CLUSTER_ID,
          'ngrok-skip-browser-warning': 'true',
          ...headers
        };

        if (this.token) {
          reqHeaders['Authorization'] = `Bearer ${this.token}`;
        }

        if (idempotencyKey) {
          reqHeaders['Idempotency-Key'] = idempotencyKey;
        }

        const res = await fetch(`${targetServer}${cleanEndpoint}`, {
          method,
          headers: reqHeaders,
          body: data ? JSON.stringify(data) : undefined,
          signal: AbortSignal.timeout(10000)
        });

        // Business errors (400, 401, 403, 404, 409, 422) come from the database
        // and must NOT trigger failover.
        if (res.status < 500 && res.status !== 408) {
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            const err = new Error(json.error || `Request failed with status ${res.status}`);
            (err as any).status = res.status;
            throw err;
          }
          this.activeIndex = idx;
          return json as T;
        }

        // Server returned 5xx or gateway error; try next failover node
        console.warn(`Server ${targetServer} responded with ${res.status}. Attempting failover...`);
      } catch (err: any) {
        // If it's a client business error, rethrow immediately
        if (err.status && err.status < 500) {
          throw err;
        }
        console.warn(`Cannot reach node ${targetServer}: ${err.message}. Trying next node...`);
        lastError = err;
      }
    }

    throw new Error(
      lastError?.message ||
        'All configured AquaLicious cluster servers are unreachable. Please check your network connection.'
    );
  }
}

export const resolver = new MultiServerResolver();
