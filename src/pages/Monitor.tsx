import { useCallback, useEffect, useState } from 'react';
import { Activity, Link2, LoaderCircle, Search } from 'lucide-react';
import { admin, openMonitorStream, runtime } from '../api';
import { useAuth } from '../auth';
import { DataTable, Header, Metric, Pill, Sheet, State, StrategyBadge, type Column } from '../components/ui';
import { errorMessage, fmtCount, fmtDateTime, fmtTime } from '../lib/format';
import type { MonitorEvent, MonitorSnapshot, TraceRow } from '../types';

function LiveMonitor() {
  const { credentials } = useAuth();
  const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null);
  const [channel, setChannel] = useState<'connecting' | 'sse' | 'poll'>('connecting');
  const [error, setError] = useState('');
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    const poll = async () => {
      try {
        const snap = await runtime.monitorSnapshot(credentials);
        if (!stopped) { setSnapshot(snap); setError(''); }
      } catch (e) {
        if (!stopped) setError(errorMessage(e));
      }
    };
    const stop = openMonitorStream(credentials, {
      onSnapshot: snap => { if (stopped) return; setChannel('sse'); setSnapshot(snap); setError(''); },
      // SSE 不可用（代理缓冲或后端不支持）时降级为 5 秒轮询快照
      onError: () => { if (stopped || timer) return; setChannel('poll'); poll(); timer = setInterval(poll, 5000); },
    });
    return () => { stopped = true; stop(); if (timer) clearInterval(timer); };
  }, [credentials]);

  const columns: Column<MonitorEvent>[] = [
    { key: 'timestamp', title: '时间', render: r => fmtTime(r.timestamp) },
    { key: 'accessKey', title: '业务' },
    { key: 'mode', title: '模式' },
    { key: 'content', title: '检测内容', render: r => <span className="mono-clip" title={r.content || ''}>{r.content || '-'}</span> },
    { key: 'risk', title: '结果', render: r => (!r.success ? <Pill ok={false}>失败 {r.code}</Pill> : r.risky ? <Pill tone="danger">{r.riskCode} {r.riskMessage}</Pill> : <Pill ok>安全</Pill>) },
    { key: 'strategy', title: '处置', render: r => <StrategyBadge value={r.handleStrategy} /> },
    { key: 'cost', title: '耗时（ms）', render: r => fmtCount(r.cost) },
  ];
  return (
    <>
      <div className="sub-head">
        <div><h2>实时检测流</h2><p>test 前缀业务最近的检测流量（进程内最多保留 500 条）。SSE 实时推送，连接失败时自动改为每 5 秒轮询。</p></div>
        <Pill ok={channel === 'sse'}>{channel === 'sse' ? 'SSE 已连接' : channel === 'poll' ? '轮询模式' : '连接中'}</Pill>
      </div>
      {error && <div className="alert error">{error}</div>}
      <section className="metrics five">
        <Metric label="事件总数" value={fmtCount(snapshot?.total)} />
        <Metric label="成功" value={fmtCount(snapshot?.success)} tone="green" />
        <Metric label="失败" value={fmtCount(snapshot?.failed)} tone={snapshot?.failed ? 'red' : ''} />
        <Metric label="风险命中" value={fmtCount(snapshot?.risky)} tone={snapshot?.risky ? 'red' : ''} />
        <Metric label="平均耗时" value={snapshot ? `${fmtCount(snapshot.averageCost)} ms` : '-'} />
      </section>
      {snapshot && Object.keys(snapshot.riskCounts || {}).length > 0 && (
        <div className="chip-row">{Object.entries(snapshot.riskCounts || {}).map(([label, count]) => <span key={label} className={`pill ${label === 'safe' ? 'ok' : 'warn'}`}>{label} × {count}</span>)}</div>
      )}
      <DataTable columns={columns} rows={snapshot?.events || []} rowKey={r => r.id} empty="暂无检测事件；可在“AI 交互”页用 test 业务发起检测后回来查看" />
    </>
  );
}

function LangfuseTraces() {
  const { credentials } = useAuth();
  const [filters, setFilters] = useState({ name: '', sessionId: '', userId: '' });
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<TraceRow[]>([]);
  const [totalPages, setTotalPages] = useState<number | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<{ title: string; loading: boolean; data?: unknown; error?: string } | null>(null);

  const load = useCallback(async (target: number) => {
    setBusy(true); setError('');
    try {
      const data = await admin.observabilityTraces(credentials, { page: target, limit: 20, ...filters });
      setRows(data?.data || []); setTotalPages(data?.meta?.totalPages); setPage(target);
    } catch (e) {
      setError(errorMessage(e)); setRows([]); setTotalPages(undefined);
    } finally { setBusy(false); }
  }, [credentials, filters]);
  // 只在首次进入时自动查询，之后由用户点击查询
  useEffect(() => { load(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openDetail = async (row: TraceRow) => {
    const title = row.name || row.id;
    setDetail({ title, loading: true });
    try { setDetail({ title, loading: false, data: await admin.observabilityTrace(credentials, row.id) }); }
    catch (e) { setDetail({ title, loading: false, error: errorMessage(e) }); }
  };
  const columns: Column<TraceRow>[] = [
    { key: 'timestamp', title: '时间', render: r => fmtDateTime(r.timestamp) },
    { key: 'name', title: '名称' },
    { key: 'sessionId', title: 'Session' },
    { key: 'userId', title: 'User' },
    { key: 'latency', title: '耗时（s）' },
    { key: 'action', title: '操作', render: r => <button className="link" onClick={() => openDetail(r)}>详情</button> },
  ];
  return (
    <>
      <div className="sub-head"><div><h2>Langfuse 追踪</h2><p>经管理服务转发查询 Langfuse 全链路追踪；需在 safety-admin 配置 LANGFUSE_HOST / LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY。</p></div></div>
      <form className="search-bar" onSubmit={e => { e.preventDefault(); load(1); }}>
        <input value={filters.name} onChange={e => setFilters({ ...filters, name: e.target.value })} placeholder="Trace 名称（可选）" />
        <input value={filters.sessionId} onChange={e => setFilters({ ...filters, sessionId: e.target.value })} placeholder="Session ID（可选）" />
        <input value={filters.userId} onChange={e => setFilters({ ...filters, userId: e.target.value })} placeholder="User ID（可选）" />
        <button className="btn" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Search />}查询</button>
      </form>
      {error && <div className="alert error">{error}</div>}
      <DataTable columns={columns} rows={rows} rowKey={r => r.id} empty="暂无追踪数据；请确认 Langfuse 已配置且有流量上报" />
      <div className="button-row">
        <button className="btn" disabled={busy || page <= 1} onClick={() => load(page - 1)}>上一页</button>
        <span className="pager-info">第 {page} 页{totalPages ? ` / 共 ${totalPages} 页` : ''}</span>
        <button className="btn" disabled={busy || (totalPages ? page >= totalPages : rows.length < 20)} onClick={() => load(page + 1)}>下一页</button>
      </div>
      {detail && (
        <Sheet eyebrow="Langfuse Trace" title={detail.title} onClose={() => setDetail(null)}>
          <State loading={detail.loading} error={detail.error}><pre className="result-block">{JSON.stringify(detail.data, null, 2)}</pre></State>
        </Sheet>
      )}
    </>
  );
}

export default function Monitor() {
  const [tab, setTab] = useState<'live' | 'traces'>('live');
  return (
    <>
      <Header title="运行监控" desc="实时查看 Runtime 检测流量，并检索 Langfuse 全链路追踪。" />
      <section className="panel governance">
        <div className="tabs" role="tablist">
          <button className={tab === 'live' ? 'active' : ''} onClick={() => setTab('live')}><Activity />实时检测流</button>
          <button className={tab === 'traces' ? 'active' : ''} onClick={() => setTab('traces')}><Link2 />Langfuse 追踪</button>
        </div>
        {tab === 'live' ? <LiveMonitor /> : <LangfuseTraces />}
      </section>
    </>
  );
}
