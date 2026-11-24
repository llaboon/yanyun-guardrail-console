// 控制台唯一的接口层：组件里不要直接写 fetch。
import type {
  Business, ConsoleUser, Credentials, DagStrategy, DefenseInput, DefenseItem, DictEntry, ModelCheckResult,
  ModelHealth, MonitorSnapshot, RedlineKnowledge, RiskEventFilter, RiskEventPage, Role, SafetyFunction,
  SensitiveWord, Stat, TracePage, VersionRecord,
} from './types';

const TOKEN_KEY = 'yanyun.guardrail.console.auth';
/** 收到 401 时派发，AuthProvider 监听后回到登录页。 */
export const AUTH_EXPIRED_EVENT = 'yanyun-console-auth-expired';

const hasSession = () => typeof sessionStorage !== 'undefined';

export function readCredentials(): Credentials | null {
  if (!hasSession()) return null;
  const raw = sessionStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Credentials;
  } catch {
    sessionStorage.removeItem(TOKEN_KEY);
    return null;
  }
}

export function saveCredentials(username: string, password: string, role?: Role): Credentials {
  const credentials: Credentials = { username, password, role };
  if (hasSession()) sessionStorage.setItem(TOKEN_KEY, JSON.stringify(credentials));
  return credentials;
}

export function clearCredentials() {
  if (hasSession()) sessionStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export function authHeader(credentials: Credentials | null | undefined): Record<string, string> {
  if (!credentials) return {};
  try {
    return { Authorization: `Basic ${btoa(`${credentials.username}:${credentials.password}`)}` };
  } catch {
    throw new ApiError('用户名和密码只能使用英文字母、数字和常见符号');
  }
}

export interface RequestOptions {
  method?: string;
  body?: string;
  contentType?: 'application/json' | 'text/plain';
  timeout?: number;
  raw?: boolean;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export async function request<T = unknown>(path: string, credentials: Credentials | null, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout ?? 20000);
  const isText = typeof options.body === 'string' && options.contentType === 'text/plain';
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method,
      body: options.body,
      signal: options.signal || controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': isText ? 'text/plain' : 'application/json' } : {}),
        ...authHeader(credentials),
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw new ApiError('请求超时，请检查后端服务状态');
    throw new ApiError(`网络请求失败：${(error as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401) {
    clearCredentials();
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    throw new ApiError('登录已失效，请重新登录', 401);
  }
  if (response.status === 403) throw new ApiError('当前账号没有执行该操作的权限', 403);
  if (response.status === 413) throw new ApiError('请求体过大，请减少附件数量或大小', 413);
  if (!response.ok) throw new ApiError(`请求失败（HTTP ${response.status}）`, response.status);
  if (response.status === 204) return null as T;
  // 部分 Spring 健康检查接口返回纯文本却声明 application/json，按内容而不是响应头解析。
  const text = await response.text();
  if (options.raw) return text as T;
  let data: unknown = text;
  if (text.trim()) {
    try { data = JSON.parse(text); } catch { /* 纯文本响应 */ }
  }
  if (data && typeof data === 'object' && 'code' in data && (data as { code: unknown }).code !== 0) {
    throw new ApiError(String((data as { message?: unknown }).message || '后端返回失败'));
  }
  if (data && typeof data === 'object' && 'data' in data) return (data as { data: T }).data;
  return data as T;
}

export function buildQuery(params: Record<string, unknown> = {}): string {
  const pairs = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return pairs.length ? `?${pairs.join('&')}` : '';
}

const post = (body: unknown): RequestOptions => ({ method: 'POST', body: JSON.stringify(body) });
const manage = (resource: string, op: string) => `/admin-api/config/defense/manage/${resource}/${op}`;

type C = Credentials | null;
type Id = number | string;
type Version = { id: number; version: number };

export const admin = {
  identity: (c: C) => request<{ username: string; role: Role }>('/admin-api/console/auth/me', c),
  users: (c: C) => request<ConsoleUser[]>('/admin-api/console/users', c),
  userCreate: (c: C, body: unknown) => request('/admin-api/console/users', c, post(body)),
  userUpdate: (c: C, id: Id, body: unknown) => request(`/admin-api/console/users/${id}`, c, { method: 'PUT', body: JSON.stringify(body) }),
  userPassword: (c: C, id: Id, passwordHash: string) => request(`/admin-api/console/users/${id}/password`, c, { method: 'PUT', body: JSON.stringify({ passwordHash }) }),

  businesses: (c: C) => request<Business[]>(manage('business', 'allActive'), c, post({ group: 'default' })),
  businessNew: (c: C, body: unknown) => request<Version>(manage('business', 'new'), c, post(body)),
  businessNewVersion: (c: C, body: unknown) => request<Version>(manage('business', 'newVersion'), c, post(body)),
  businessUpdate: (c: C, body: unknown) => request(manage('business', 'update'), c, post(body)),
  businessUpgrade: (c: C, id: Id) => request(manage('business', 'upgrade'), c, post({ id })),
  businessOnline: (c: C, id: Id) => request(manage('business', 'online'), c, post({ id })),
  businessOffline: (c: C, id: Id) => request(manage('business', 'offline'), c, post({ id })),
  businessVersions: (c: C, body: unknown) => request<VersionRecord[]>(manage('business', 'listAllVersions'), c, post(body)),

  functions: (c: C) => request<SafetyFunction[]>(manage('function', 'allActive'), c, post({ group: 'default' })),
  functionNew: (c: C, body: unknown) => request<Version>(manage('function', 'new'), c, post(body)),
  functionNewVersion: (c: C, body: unknown) => request<Version>(manage('function', 'newVersion'), c, post(body)),
  functionUpdate: (c: C, body: unknown) => request(manage('function', 'update'), c, post(body)),
  functionUpgrade: (c: C, id: Id) => request(manage('function', 'upgrade'), c, post({ id })),
  functionOnline: (c: C, id: Id) => request(manage('function', 'online'), c, post({ id })),
  functionOffline: (c: C, id: Id) => request(manage('function', 'offline'), c, post({ id })),

  dags: (c: C) => request<DagStrategy[]>(manage('dag', 'allActive'), c, post({ group: 'default' })),
  dagNewVersion: (c: C, body: unknown) => request<DagStrategy>(manage('dag', 'newVersion'), c, post(body)),
  dagUpdate: (c: C, body: unknown) => request(manage('dag', 'update'), c, post(body)),
  dagUpgrade: (c: C, id: Id) => request(manage('dag', 'upgrade'), c, post({ id })),
  dagOnline: (c: C, id: Id) => request(manage('dag', 'online'), c, post({ id })),
  dagOffline: (c: C, id: Id) => request(manage('dag', 'offline'), c, post({ id })),
  dagVersions: (c: C, body: unknown) => request<VersionRecord[]>(manage('dag', 'listAllVersion'), c, post(body)),
  dagImportYaml: (c: C, yaml: string) => request<string>(manage('dag', 'dagUpdateYaml'), c, { method: 'POST', body: yaml, contentType: 'text/plain', raw: true }),

  sensitiveSearch: (c: C, body: unknown) => request<SensitiveWord[]>('/admin-api/data/sensitive_words/queryByWord', c, post(body)),
  sensitiveUpsert: (c: C, body: unknown) => request('/admin-api/data/sensitive_words/upsert', c, post(body)),
  sensitiveUpgrade: (c: C, id: Id) => request('/admin-api/data/sensitive_words/upgrade', c, post({ id })),
  sensitiveOnline: (c: C, id: Id) => request('/admin-api/data/sensitive_words/online', c, post({ id })),
  sensitiveOffline: (c: C, id: Id) => request('/admin-api/data/sensitive_words/offline', c, post({ id })),
  redlineFind: (c: C, body: unknown) => request<Record<string, RedlineKnowledge>>('/admin-api/data/redline_knowledge/getByWord', c, post(body)),
  redlineUpsert: (c: C, body: unknown) => request('/admin-api/data/redline_knowledge/upsert', c, post(body)),
  redlineOnline: (c: C, id: Id) => request('/admin-api/data/redline_knowledge/online', c, post({ id })),
  redlineOffline: (c: C, id: Id) => request('/admin-api/data/redline_knowledge/offline', c, post({ id })),
  dictList: (c: C, body: unknown) => request<DictEntry[]>('/admin-api/platform/dict/list', c, post(body)),
  dictUpgrade: (c: C, body: unknown) => request('/admin-api/platform/dict/upgrade', c, post(body)),
  dictOnline: (c: C, id: Id) => request('/admin-api/platform/dict/online', c, post({ id })),
  dictOffline: (c: C, id: Id) => request('/admin-api/platform/dict/offline', c, post({ id })),

  funcToBusiness: (c: C, body: unknown) => request<unknown>('/admin-api/config/defense/api/func2Biz', c, post(body)),
  businessToFunctions: (c: C, body: unknown) => request<unknown>('/admin-api/config/defense/api/biz2Func', c, post(body)),
  runtimeConfig: (c: C, body: unknown) => request<unknown>('/admin-api/config/defense/api/conf', c, post(body)),
  runtimeConfigYaml: (c: C, body: unknown) => request<string>('/admin-api/config/defense/api/confYaml', c, { ...post(body), raw: true }),
  dagYaml: (c: C, body: unknown) => request<string>('/admin-api/config/defense/api/dagYaml', c, { ...post(body), raw: true }),

  riskEventQuery: (c: C, body: RiskEventFilter & { page: number; pageSize: number }) => request<RiskEventPage>('/admin-api/data/risk_event/query', c, post(body)),
  riskEventStatsByDay: (c: C, body: RiskEventFilter) => request<Stat[]>('/admin-api/data/risk_event/statsByDay', c, post(body)),
  riskEventStatsByRiskCheckType: (c: C, body: RiskEventFilter) => request<Stat[]>('/admin-api/data/risk_event/statsByRiskCheckType', c, post(body)),
  riskEventStatsByBusiness: (c: C, body: RiskEventFilter) => request<Stat[]>('/admin-api/data/risk_event/statsByBusiness', c, post(body)),

  observabilityTraces: (c: C, params: Record<string, unknown>) => request<TracePage>(`/admin-api/observability/traces${buildQuery(params)}`, c),
  observabilityTrace: (c: C, traceId: string) => request<unknown>(`/admin-api/observability/traces/${encodeURIComponent(traceId)}`, c),

  /** 服务端代签的检测请求（非 test 业务）：浏览器不接触 Secret Key，仅管理员可用。 */
  defenseTest: (c: C, accessKey: string, body: DefenseInput) =>
    request<DefenseItem[]>(`/admin-api/console/defense-test/${encodeURIComponent(accessKey)}?group=default`, c, { ...post(body), timeout: 60000 }),
  defenseTestResult: (c: C, accessKey: string, body: { sessionId: string; type: 'all' | 'latest' }) =>
    request<DefenseItem[]>(`/admin-api/console/defense-test/${encodeURIComponent(accessKey)}/result?group=default`, c, { ...post(body), timeout: 30000 }),
};

export const runtime = {
  authCheck: (c: C) => request<string>('/auth-check', c, { raw: true, timeout: 10000 }),
  health: (c: C) => request<string>('/runtime-api/basic/healthcheck', c),
  monitorSnapshot: (c: C) => request<MonitorSnapshot>('/runtime-api/llmsec/api/monitor/snapshot', c),
  /** test 前缀业务免签，浏览器直接调用 safety-api；其他业务走 admin.defenseTest。 */
  defenseUnsigned: (c: C, accessKey: string, body: DefenseInput & { accessKey: string; requestId: string }) =>
    request<DefenseItem[]>(`/runtime-api/llmsec/api/defense/v2/${encodeURIComponent(accessKey)}`, c, { ...post(body), timeout: 60000 }),
};

export const modelDemo = {
  health: (c: C) => request<ModelHealth>('/model-api/api/safety-demo/health', c),
  check: (c: C, model: string, text: string) => request<ModelCheckResult>('/model-api/api/safety-demo/check', c, { ...post({ model, text }), timeout: 120000 }),
};

export function parseSseChunk(chunk: string): string {
  return chunk.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('');
}

// EventSource 不能携带 Basic Auth 头，所以用 fetch + ReadableStream 读取 SSE。
export function openMonitorStream(c: C, handlers: { onSnapshot?: (s: MonitorSnapshot) => void; onError?: (e: Error) => void } = {}) {
  const controller = new AbortController();
  (async () => {
    try {
      const response = await fetch('/runtime-api/llmsec/api/monitor/stream', {
        headers: { Accept: 'text/event-stream', ...authHeader(c) },
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error(`监控流连接失败（HTTP ${response.status}）`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          const data = parseSseChunk(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary + 2);
          if (data) {
            try { handlers.onSnapshot?.(JSON.parse(data) as MonitorSnapshot); } catch { /* 跳过无法解析的事件 */ }
          }
          boundary = buffer.indexOf('\n\n');
        }
      }
      throw new Error('监控流已断开');
    } catch (error) {
      if ((error as Error).name !== 'AbortError') handlers.onError?.(error as Error);
    }
  })();
  return () => controller.abort();
}

