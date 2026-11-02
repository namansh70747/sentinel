export interface PrometheusSample { metric: Record<string, string>; value: [number, string] }
export interface PrometheusConfig { url: string; token?: string; timeoutMs?: number }

export class PrometheusClient {
  private readonly base: URL;
  constructor(private readonly config: PrometheusConfig) {
    this.base = new URL(config.url);
    if (!['https:', 'http:'].includes(this.base.protocol) || this.base.username || this.base.password) throw new Error('Invalid Prometheus URL');
  }
  private async request(path: string, query?: string): Promise<unknown> {
    const url = new URL(this.base);
    url.pathname = `${url.pathname.replace(/\/$/, '')}${path}`;
    url.search = '';
    if (query) url.searchParams.set('query', query);
    const response = await fetch(url, { headers: this.config.token ? { authorization: `Bearer ${this.config.token}` } : {}, signal: AbortSignal.timeout(this.config.timeoutMs ?? 10000), redirect: 'error' });
    if (!response.ok) throw new Error(`Prometheus request failed (${response.status})`);
    return response.json();
  }
  async health(): Promise<{ healthy: boolean; checkedAt: string }> {
    try { await this.query('vector(1)'); return { healthy: true, checkedAt: new Date().toISOString() }; }
    catch { return { healthy: false, checkedAt: new Date().toISOString() }; }
  }
  async query(expression: string): Promise<PrometheusSample[]> {
    if (!expression.trim() || expression.length > 16384) throw new Error('Invalid query');
    const body = await this.request('/api/v1/query', expression) as { status?: string; data?: { resultType?: string; result?: unknown[] } };
    if (body.status !== 'success' || body.data?.resultType !== 'vector' || !Array.isArray(body.data.result)) throw new Error('Invalid Prometheus response');
    return body.data.result.map((row) => {
      const sample = row as PrometheusSample;
      if (!sample || typeof sample.metric !== 'object' || sample.metric === null || !Array.isArray(sample.value) || sample.value.length !== 2 || typeof sample.value[0] !== 'number' || !Number.isFinite(sample.value[0]) || typeof sample.value[1] !== 'string' || !Number.isFinite(Number(sample.value[1]))) throw new Error('Invalid Prometheus sample');
      return sample;
    });
  }
}
