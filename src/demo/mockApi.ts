// 演示模式的内置 API：拦截控制台的接口请求，返回与真实后端同形状的数据。
// 只用于 GitHub Pages 静态演示，不连接任何真实服务；写操作只修改内存副本。
import raw from './demoData.json';

type Any = Record<string, any>;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const now = () => Date.now();
const DAY = 86_400_000;
const CN_OFFSET = 8 * 3600_000;
const dayKey = (date: Date) => new Date(date.getTime() + CN_OFFSET).toISOString().slice(0, 10);
const pad = (n: number) => String(n).padStart(2, '0');
const fmtDateTime = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

let businesses: Any[] = clone(raw.businesses as Any[]);
let functions: Any[] = clone(raw.functions as Any[]);
let dags: Any[] = clone(raw.dags as Any[]);
let users: Any[] = clone(raw.users as Any[]);
let sensitive: Any[] = clone(raw.sensitive as Any[]);
let redline: Any[] = clone(raw.redline as Any[]);
let dicts: Any[] = clone(raw.dicts as Any[]);
let seq = 9000;

const nextId = () => ++seq;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
const reply = (data: unknown, message = 'success') => json({ code: 0, message, data });
const text = (body: string) => new Response(body, { status: 200, headers: { 'Content-Type': 'text/plain' } });

function toYaml(value: unknown, indent = 0): string {
  const pad = '  '.repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return `${pad}[]\n`;
    return value.map(item => {
      if (item && typeof item === 'object') return `${pad}-\n${toYaml(item, indent + 1)}`;
      return `${pad}- ${String(item)}\n`;
    }).join('');
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Any).map(([key, item]) => {
      if (item && typeof item === 'object') return `${pad}${key}:\n${toYaml(item, indent + 1)}`;
      return `${pad}${key}: ${String(item ?? '')}\n`;
    }).join('');
  }
  return `${pad}${String(value ?? '')}\n`;
}

function versionsFor(baseId: number, total = 3) {
  return Array.from({ length: total }, (_, index) => {
    const version = total - index;
    return {
      id: baseId * 10 + version, version,
      status: version === total ? 'online' : 'offline',
      updateTime: fmtDateTime(new Date(now() - (total - version) * 3 * DAY)),
      createTime: fmtDateTime(new Date(now() - (total - version) * 3 * DAY - 3600_000)),
    };
  });
}

function riskRows() {
  return (raw.risk.rows as Any[]).map(row => {
    const date = new Date(now() - row.daysAgo * DAY);
    date.setHours(row.hour, (row.id * 7) % 60, 0, 0);
    return {
      id: row.id,
      createTime: fmtDateTime(date),
      businessName: row.businessName,
      riskCheckType: row.riskCheckType,
      riskCheckName: row.riskCheckName,
      riskCode: row.riskCode,
      handleStrategy: row.handleStrategy,
      ext: row.ext ? JSON.stringify(row.ext) : null,
      contentSnippet: row.contentSnippet,
    };
  });
}

function riskFilter(rows: Any[], body: Any) {
  return rows.filter(row =>
    (!body.businessName || row.businessName === body.businessName)
    && (!body.riskCheckType || row.riskCheckType === body.riskCheckType)
    && (!body.handleStrategy || row.handleStrategy === body.handleStrategy));
}

function riskTotal(body: Any) {
  const byStrategy = raw.risk.byStrategy as Any;
  if (body.handleStrategy) return byStrategy[body.handleStrategy] || 0;
  if (body.businessName) return (raw.risk.byBusiness as Any[]).find(item => item.dimension === body.businessName)?.count || 12;
  if (body.riskCheckType) return (raw.risk.byType as Any[]).find(item => item.dimension === body.riskCheckType)?.count || 12;
  return 204;
}

function monitorSnapshot() {
  const source = raw.monitor as Any;
  const events: Any[] = (source.events as Any[]).map((event: Any) => ({ ...event, timestamp: now() - Math.round(event.minutesAgo * 60_000) }));
  const riskCounts: Record<string, number> = {};
  events.forEach(event => { riskCounts[event.riskMessage] = (riskCounts[event.riskMessage] || 0) + 1; });
  return {
    total: source.total, success: source.success, failed: source.failed, risky: source.risky,
    averageCost: source.averageCost, updatedAt: now(),
    businessCounts: { test: 802, test_tiered: 484 }, riskCounts, events,
  };
}

function defenseItem(code: number, message: string, type: string, name: string, strategy: string, result: Any, content: string, cost = 400) {
  if (result.cost == null) result.cost = cost;
  return {
    requests: [{ fromRole: 'user', content }], checkedContent: content,
    riskCode: code, riskMessage: message, riskCheckType: type, riskCheckName: name,
    riskCheckResult: result, handleStrategy: strategy,
  };
}

function mockDefense(key: string, body: Any): Any {
  const content: string = body?.content || '';
  const attachments: Any[] = body?.attachments || [];
  if (key === 'test_tiered') {
    if (attachments.length) {
      return defenseItem(1003, '违法犯罪', 'guard_check', 'mm_guard', 'INTERCEPT', {
        safety: 'unsafe', confidence: 0.93, escalate: false, escalateThreshold: 0.85,
        modelCategories: ['S1'], category: '违法犯罪：教唆或提供违法犯罪的方法，如制毒、制爆、诈骗',
        safetyProbabilities: { safe: 0.07, unsafe: 0.93 }, model: 'meta-llama/Llama-Guard-4-12B',
        outputFormat: 'llama_guard', imageCount: attachments.length, rawOutput: 'unsafe S1', decidedBy: 'guard', cost: 420,
      }, content, 420);
    }
    if (content.includes('安眠药') || content.includes('危险')) {
      const guard = {
        safety: 'controversial', confidence: 0.61, escalate: true, escalateThreshold: 0.85,
        safetyProbabilities: { safe: 0.36, controversial: 0.61, unsafe: 0.03 },
        model: 'meta-llama/Llama-Guard-4-12B', outputFormat: 'llama_guard', decidedBy: 'guard', rawOutput: 'controversial', cost: 380,
      };
      return defenseItem(9000, 'borderline', 'llm_judge', 'llm_judge', 'REDIRECT', {
        safety: 'borderline', category: '边界样本', riskCode: 9000, riskMessage: 'borderline',
        reason: '询问药物过量风险，可能出于健康关切，也可能存在自伤倾向；不宜直接拒答，建议给出安全提示和求助渠道。',
        model: 'Qwen/Qwen3-VL-8B-Instruct', decidedBy: 'llm_judge', judgeError: null, upstream: guard, cost: 2300,
      }, content, 2680);
    }
    if (content.includes('刷单')) {
      return defenseItem(1003, '1003违法犯罪', 'guard_check', 'mm_guard', 'INTERCEPT', {
        safety: 'unsafe', confidence: 0.93, escalate: false, escalateThreshold: 0.85, modelCategories: ['S2'],
        category: '违法犯罪', safetyProbabilities: { safe: 0.07, unsafe: 0.93 }, model: 'meta-llama/Llama-Guard-4-12B',
        outputFormat: 'llama_guard', imageCount: 0, rawOutput: 'unsafe S2', decidedBy: 'guard', cost: 410,
      }, content, 410);
    }
    return defenseItem(0, 'safe', 'guard_check', 'mm_guard', 'PASS', {
      safety: 'safe', confidence: 0.97, escalate: false, escalateThreshold: 0.85,
      safetyProbabilities: { safe: 0.97, unsafe: 0.03 }, model: 'meta-llama/Llama-Guard-4-12B',
      outputFormat: 'llama_guard', imageCount: 0, rawOutput: 'safe', decidedBy: 'guard', cost: 395,
    }, content, 395);
  }
  if (content.includes('忽略') || content.includes('系统提示词') || content.includes('DAN')) {
    return defenseItem(201, '201提示词注入', 'single_label_pred', 'bert_prompt_injection_20250828', 'INTERCEPT',
      { probability: 0.99978906, cost: 371 }, content, 371);
  }
  if (content.includes('安眠药') || content.includes('危险')) {
    return defenseItem(9000, 'borderline', 'llm_judge', 'llm_judge', 'REDIRECT',
      { safety: 'borderline', reason: '边界问题，建议引导就医。', decidedBy: 'llm_judge', cost: 1210 }, content, 1210);
  }
  return defenseItem(0, '0正常文本', 'mixed', 'none', 'PASS', { cost: 374 }, content, 374);
}

function modelCheck(model: string, content: string): Any {
  if (model === 'dtguard') {
    const unsafe = /harmful|dangerous|illegal/i.test(content);
    return {
      model, decision: unsafe ? 'Unsafe' : 'Safe', score: unsafe ? 0.93 : 0.06,
      scores: { unsafe: unsafe ? 0.93 : 0.06, benign: unsafe ? 0.07 : 0.94 },
      action: unsafe ? 'block' : 'allow',
      trace: ['model-demo reached dtguard', `decision=${unsafe ? 'Unsafe' : 'Safe'} policy=unsafe→block, controversial→review, safe→allow`],
      metadata: { source: 'remote_model', latency_ms: 38 },
    };
  }
  if (model === 'mllm') {
    return {
      model, decision: 'Uncertain', score: 0.47, scores: { unsafe: 0.47, benign: 0.53 }, action: 'review',
      trace: ['model-demo reached safety-multimodal', 'verdict=uncertain confidence=0.53', 'status=completed', 'model=Qwen3-VL-8B-Instruct latency_ms=2380', 'explanation=未发现明确的生成痕迹，也无法确认来源，建议人工复核'],
      metadata: { source: 'remote_model', verdict: 'uncertain', status: 'completed', model: 'Qwen3-VL-8B-Instruct', requires_human_review: true, latency_ms: 2380 },
    };
  }
  const unsafe = /harmful|bypass|dangerous/i.test(content);
  return {
    model, decision: unsafe ? 'Unsafe' : 'Safe', score: unsafe ? 0.91 : 0.08,
    scores: { unsafe: unsafe ? 0.91 : 0.08, benign: unsafe ? 0.09 : 0.92 },
    action: unsafe ? 'block' : 'allow',
    trace: [`model-demo reached ${model}`, `decision=${unsafe ? 'Unsafe' : 'Safe'} score=${unsafe ? 0.91 : 0.08}`],
    metadata: { source: 'remote_model', latency_ms: 38 },
  };
}

function sseStream() {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream({
    start(controller) {
      const push = () => controller.enqueue(encoder.encode(`event: snapshot\ndata: ${JSON.stringify(monitorSnapshot())}\n\n`));
      push();
      timer = setInterval(() => { try { push(); } catch { /* closed */ } }, 8000);
    },
    cancel() { if (timer) clearInterval(timer); },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function defenseEnvelope(key: string, body: Any) {
  const item = mockDefense(key, body);
  return json({ code: 0, message: 'success', cost: item.riskCheckResult?.cost || 400, data: item.riskCheckResult ? [item] : [] });
}

export function createDemoFetch(original: typeof fetch): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const parsed = new URL(url, window.location.href);
    const path = parsed.pathname;
    const method = (init?.method || (typeof input !== 'string' && !(input instanceof URL) ? input.method : 'GET')).toUpperCase();
    const rawBody = typeof init?.body === 'string' ? init.body : '';
    let body: Any = {};
    try { body = rawBody ? JSON.parse(rawBody) : {}; } catch { body = {}; }

    if (path === '/auth-check') return text('ok\n');
    if (path === '/admin-api/console/auth/me') return reply({ username: 'demo', role: 'admin' });

    if (path === '/admin-api/console/users' && method === 'GET') return reply(users);
    if (path === '/admin-api/console/users' && method === 'POST') {
      const user = { ...body, id: nextId(), lastLoginTime: fmtDateTime(new Date()) };
      users = [...users, user]; return reply(user);
    }
    const userMatch = path.match(/^\/admin-api\/console\/users\/(\d+)(\/password)?$/);
    if (userMatch) {
      const id = Number(userMatch[1]);
      if (userMatch[2]) return reply(null);
      users = users.map(user => (user.id === id ? { ...user, ...body, id } : user));
      return reply(users.find(user => user.id === id));
    }

    const manage = path.match(/^\/admin-api\/config\/defense\/manage\/(business|function|dag)\/([A-Za-z0-9]+)$/);
    if (manage) {
      const [, resource, op] = manage;
      const list = resource === 'business' ? businesses : resource === 'function' ? functions : dags;
      const setList = (next: Any[]) => { if (resource === 'business') businesses = next; else if (resource === 'function') functions = next; else dags = next; };
      if (op === 'allActive') return reply(list);
      if (op === 'listAllVersions' || op === 'listAllVersion') return reply(versionsFor(resource === 'dag' ? 3 : 1, resource === 'dag' ? 2 : 3));
      if (op === 'get') return reply(list.find(item => item.id === body.id) || list[0]);
      if (op === 'active') return reply(list.find(item => (resource === 'dag' ? item.businessName : item.name) === (body.businessName || body.name)) || list[0]);
      if (op === 'new') {
        const item: Any = { ...body, id: nextId(), version: 1, status: 'edit' };
        if (resource === 'dag') item.businessName = body.businessName || body.name;
        setList([...list, item]); return reply({ id: item.id, version: item.version });
      }
      if (op === 'newVersion') {
        const found = list.find(item => item.id === body.id) || list[0];
        const draft = { ...clone(found), id: nextId(), version: (found?.version || 1) + 1, status: 'edit' };
        setList([...list, draft]); return reply(draft);
      }
      if (op === 'update') {
        setList(list.map(item => (item.id === body.id ? { ...item, ...body, id: item.id, status: 'edit' } : item)));
        return reply(body);
      }
      if (op === 'upgrade' || op === 'online' || op === 'offline') {
        const target = list.find(item => item.id === body.id);
        const name = resource === 'dag' ? target?.businessName : target?.name;
        const status = op === 'offline' ? 'offline' : 'online';
        setList(list.map(item => {
          if (item.id === body.id) return { ...item, status };
          if (op !== 'offline' && (resource === 'dag' ? item.businessName : item.name) === name && item.status === 'online') return { ...item, status: 'offline' };
          return item;
        }));
        return reply(target || body);
      }
      if (op === 'dagUpdateYaml' || op === 'dagActiveYaml' || op === 'newDagWithYaml') return text(toYaml(body || { ok: true }));
      return reply(body);
    }

    const api = path.match(/^\/admin-api\/config\/defense\/api\/([A-Za-z0-9]+)$/);
    if (api) {
      const op = api[1];
      const dag = dags.find(item => item.businessName === body.businessName) || dags[0];
      const refs = new Set<string>((dag?.confArray || []).map((node: Any) => node.functionConf?.ref).filter(Boolean));
      if (op === 'biz2Func') return reply(functions.filter(item => refs.has(item.name)));
      if (op === 'func2Biz') return reply(dags.filter(item => (item.confArray || []).some((node: Any) => node.functionConf?.ref === body.functionName)).map(item => ({ group: item.group, businessName: item.businessName, version: item.version })));
      if (op === 'confYaml' || op === 'dagYaml') return text(toYaml(op === 'confYaml' ? { business: businesses.find(item => item.name === body.businessName), dag } : dag));
      return reply({ business: businesses.find(item => item.name === body.businessName), dag });
    }

    const data = path.match(/^\/admin-api\/data\/(sensitive_words|redline_knowledge|risk_event)\/([A-Za-z0-9]+)$/);
    if (data) {
      const [, kind, op] = data;
      if (kind === 'sensitive_words') {
        if (op === 'queryByWord') {
          const word = String(body.word || '');
          return reply(sensitive.filter(item => item.word.includes(word) && (!body.businessScene || item.businessScene === body.businessScene) && (!body.status || item.status === body.status)));
        }
        if (op === 'upsert') {
          const item = { ...body, id: body.id || nextId(), version: (body.version || 0) + 1, status: 'online' };
          sensitive = body.id ? sensitive.map(old => (old.id === body.id ? item : old)) : [...sensitive, item];
          return reply(item);
        }
        const id = Number(body.id);
        sensitive = sensitive.map(item => (item.id === id ? { ...item, status: op === 'offline' ? 'offline' : 'online', version: op === 'upgrade' ? (item.version || 1) + 1 : item.version } : item));
        return reply(null);
      }
      if (kind === 'redline_knowledge') {
        if (op === 'getByWord') {
          const questions: string[] = body.questions || [];
          const found: Record<string, Any> = {};
          questions.forEach(question => {
            const hit = redline.find(item => item.question === question || item.question.includes(question));
            if (hit) found[hit.question] = hit;
          });
          return reply(found);
        }
        if (op === 'upsert') {
          const item = { ...body, id: body.id || nextId(), status: 'online' };
          redline = body.id ? redline.map(old => (old.id === body.id ? item : old)) : [...redline, item];
          return reply(item);
        }
        const id = Number(body.id);
        redline = redline.map(item => (item.id === id ? { ...item, status: op === 'offline' ? 'offline' : 'online' } : item));
        return reply(null);
      }
      const rows = riskFilter(riskRows(), body);
      if (op === 'query') {
        const page = Number(body.page || 1); const size = Number(body.pageSize || 20);
        const total = riskTotal(body);
        return reply({ total, page, pageSize: size, list: rows.slice((page - 1) * size, page * size) });
      }
      if (op === 'statsByDay') {
        const counts = raw.risk.byDay as number[];
        return reply(counts.map((count, index) => ({ dimension: dayKey(new Date(now() - (counts.length - 1 - index) * DAY)), count })));
      }
      if (op === 'statsByRiskCheckType') return reply(raw.risk.byType);
      if (op === 'statsByBusiness') return reply(raw.risk.byBusiness);
      return reply([]);
    }

    if (path.startsWith('/admin-api/platform/dict/')) {
      const op = path.split('/').pop();
      if (op === 'list') return reply(dicts.filter(item => !body.key || item.key.includes(body.key)));
      if (op === 'upgrade') {
        const existing = dicts.find(item => item.key === body.key);
        const item = { id: existing?.id || nextId(), key: body.key, desc: body.desc, value: JSON.stringify(body.valueObj), valueObj: body.valueObj, version: (existing?.version || 0) + 1, status: 'online' };
        dicts = [...dicts.map(old => (old.key === body.key ? { ...old, status: 'offline' } : old)), item];
        return reply(item);
      }
      const id = Number(body.id);
      dicts = dicts.map(item => (item.id === id ? { ...item, status: op === 'offline' ? 'offline' : 'online' } : item));
      return reply(null);
    }

    if (path === '/admin-api/observability/traces') {
      const rows = (raw.traces.rows as Any[]).map(row => {
        const date = new Date(now() - row.minutesAgo * 60_000);
        return { ...row, timestamp: date.toISOString() };
      });
      return reply({ data: rows, meta: { page: 1, limit: 20, totalItems: rows.length, totalPages: 1 } });
    }
    if (path.startsWith('/admin-api/observability/traces/')) return reply(raw.traces.detail);

    if (path === '/runtime-api/basic/healthcheck') return text('ok\n');
    if (path === '/runtime-api/llmsec/api/monitor/snapshot') return reply(monitorSnapshot());
    if (path === '/runtime-api/llmsec/api/monitor/stream') return sseStream();
    const defense = path.match(/^\/runtime-api\/llmsec\/api\/defense(Result)?\/v2\/(.+)$/);
    if (defense) return defenseEnvelope(decodeURIComponent(defense[2]), body);
    const proxy = path.match(/^\/admin-api\/console\/defense-test\/(.+?)(\/result)?$/);
    if (proxy) {
      const key = decodeURIComponent(proxy[1]);
      if (proxy[2]) return reply([mockDefense(key, { content: '', messageInfo: body })]);
      return reply([mockDefense(key, body)]);
    }

    if (path === '/model-api/api/safety-demo/health') return reply(raw.modelHealth);
    if (path === '/model-api/api/safety-demo/check') return reply(modelCheck(body.model, body.text || ''));

    return original(input, init);
  };
}
