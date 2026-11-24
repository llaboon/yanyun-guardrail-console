import { afterEach, describe, expect, it, vi } from 'vitest';
import { admin, buildQuery, parseSseChunk, request } from './api';

afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('API request handling', () => {
  it('accepts the Runtime health endpoint plain-text payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok', { status: 200, headers: { 'Content-Type': 'application/json' } })));
    await expect(request('/health', null)).resolves.toBe('ok');
  });

  it('surfaces an application-level backend error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ code: 40001, message: 'timestamp需要大于0' })));
    await expect(request('/result', null)).rejects.toThrow('timestamp需要大于0');
  });

  it('sends Basic Auth and unwraps the data envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ code: 0, message: 'ok', data: [{ id: 1 }] }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(request('/x', { username: 'admin', password: 'p' })).resolves.toEqual([{ id: 1 }]);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Basic ${btoa('admin:p')}`);
  });

  it('sends defense tests through the signing proxy without any secret or signature field', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ code: 0, message: 'ok', data: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await admin.defenseTest(null, 'biz_prod', {
      content: '你好', contentType: 'text', responseMode: 'sync',
      messageInfo: { fromId: 'u', fromRole: 'user', sessionId: 's' },
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/admin-api/console/defense-test/biz_prod?group=default');
    expect(Object.keys(JSON.parse(init.body)).sort()).toEqual(['content', 'contentType', 'messageInfo', 'responseMode']);
    expect(init.body).not.toMatch(/secret|signature/i);
  });
});

describe('observability helpers', () => {
  it('builds a query string and drops empty filter values', () => {
    expect(buildQuery({ page: 1, limit: 20, name: '', sessionId: null, userId: undefined })).toBe('?page=1&limit=20');
    expect(buildQuery({ name: '多轮 检测', sessionId: 's/1' })).toBe('?name=%E5%A4%9A%E8%BD%AE%20%E6%A3%80%E6%B5%8B&sessionId=s%2F1');
    expect(buildQuery({})).toBe('');
  });

  it('extracts the data payload from an SSE chunk', () => {
    expect(parseSseChunk('event:snapshot\ndata:{"total":3}')).toBe('{"total":3}');
    expect(parseSseChunk('id:1\nretry:5000')).toBe('');
    expect(parseSseChunk('data:{"a":\ndata:1}')).toBe('{"a":1}');
  });
});
