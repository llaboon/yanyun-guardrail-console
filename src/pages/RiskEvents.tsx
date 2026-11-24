// 风险报表：KPI + 按天趋势 + 按处置 / 检测类型 / 业务的分布 + 事件明细（展开看分级审核详情）。
// risk_event 只记录有风险的事件，这里只展示事件数量，不计算拦截率、升级率这类比例。
import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { DataTable, Header, Metric, State, StrategyBadge, type Column } from '../components/ui';
import { BarList, ChartCard, type BarDatum } from '../components/charts/BarList';
import { StrategyBar } from '../components/charts/StrategyBar';
import { TrendChart } from '../components/charts/TrendChart';
import { RISK_TYPE_OPTIONS, riskTypeLabel } from '../lib/functionTypes';
import { fillDays, fmtCount, fmtPercent, lastDaysRange } from '../lib/format';
import { TIER_SHORT, parseRiskExt, tierDisagrees } from '../lib/riskExt';
import { STRATEGY_LABELS } from '../lib/strategy';
import { safetyLabel } from '../lib/tiered';
import { useBusinesses, useRiskByStrategy, useRiskEvents, useRiskStats } from '../queries';
import type { RiskEvent, RiskEventFilter, Stat } from '../types';

const RANGES = [{ days: 1, label: '今天' }, { days: 7, label: '最近 7 天' }, { days: 30, label: '最近 30 天' }];
const PAGE_SIZE = 20;

function ExtDetail({ row }: { row: RiskEvent }) {
  const ext = parseRiskExt(row.ext);
  if (!ext) return <div className="ext-detail"><span className="muted">该事件不是分级审核结果，没有分层详情。</span></div>;
  const disagree = tierDisagrees(ext);
  return (
    <div className={`ext-detail ${disagree ? 'disagree' : ''}`}>
      {disagree && <p className="warn-text"><AlertTriangle />第一层判为“{safetyLabel(ext.guardSafety)}”，裁判判为“{safetyLabel(ext.judgeSafety)}”。两层结论不一致的样本最适合用来调升级阈值。</p>}
      <dl>
        <div><dt>判定层级</dt><dd>{TIER_SHORT[ext.decidedBy || ''] || ext.decidedBy || '-'}</dd></div>
        <div><dt>第一层</dt><dd>{ext.guardModel || '-'} · {safetyLabel(ext.guardSafety)}{ext.guardRiskCode != null ? ` · 风险码 ${ext.guardRiskCode}` : ''}</dd></div>
        <div><dt>第一层置信度 / 升级阈值</dt><dd>{ext.guardConfidence == null ? '无置信度' : fmtPercent(ext.guardConfidence)} / {ext.escalateThreshold == null ? '-' : fmtPercent(ext.escalateThreshold, 0)}{ext.escalated ? '（已升级）' : ''}</dd></div>
        <div><dt>模型类目</dt><dd>{ext.guardCategories?.length ? ext.guardCategories.join('、') : '-'}</dd></div>
        <div><dt>裁判</dt><dd>{ext.judgeModel ? `${ext.judgeModel} · ${safetyLabel(ext.judgeSafety)}` : '-'}</dd></div>
        <div><dt>耗时</dt><dd>第一层 {ext.guardCost ?? '-'} ms · 裁判 {ext.judgeCost ?? '-'} ms</dd></div>
        <div><dt>图片数</dt><dd>{ext.guardImageCount ?? 0}</dd></div>
        {ext.judgeError && <div><dt>裁判错误</dt><dd className="warn-text">{ext.judgeError}</dd></div>}
      </dl>
      {ext.judgeReason && <div className="judge-reason"><b>裁判理由</b><span className="pill neutral">仅内部可见</span><p>{ext.judgeReason}</p></div>}
    </div>
  );
}

const toBars = (stats: Stat[], label: (key: string) => string): BarDatum[] =>
  stats.map(item => ({ key: item.dimension || '-', label: label(item.dimension || '-'), value: Number(item.count) || 0 }));

export default function RiskEvents() {
  const businesses = useBusinesses();
  const [days, setDays] = useState(7);
  const [businessName, setBusinessName] = useState('');
  const [riskCheckType, setRiskCheckType] = useState('');
  const [handleStrategy, setHandleStrategy] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [rangeKey, setRangeKey] = useState(0);
  // 区间在切换范围或手动刷新时才重算，避免每次渲染都换查询 key
  const range = useMemo(() => lastDaysRange(days), [days, rangeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const filter = useMemo<RiskEventFilter>(() => ({
    startTime: range.startTime, endTime: range.endTime,
    businessName: businessName || undefined, riskCheckType: riskCheckType || undefined, handleStrategy: handleStrategy || undefined,
  }), [range, businessName, riskCheckType, handleStrategy]);

  const stats = useRiskStats(filter);
  const byStrategy = useRiskByStrategy(filter);
  const events = useRiskEvents(filter, page, PAGE_SIZE);

  const trend = useMemo(() => fillDays(stats.data?.byDay || [], range.start, range.end), [stats.data, range]);
  const total = trend.reduce((sum, item) => sum + item.count, 0);
  const peak = trend.reduce<Stat | null>((best, item) => (!best || item.count > best.count ? item : best), null);
  const strategies = byStrategy.data || [];
  const countOf = (key: string) => strategies.find(item => item.dimension === key)?.count ?? 0;
  const typeOptions = useMemo(() => [...new Set([...RISK_TYPE_OPTIONS, ...(stats.data?.byType || []).map(item => item.dimension)])], [stats.data]);
  const totalPages = Math.max(1, Math.ceil((events.data?.total || 0) / PAGE_SIZE));
  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => { setter(value); setPage(1); setExpanded(null); };
  const refetching = (stats.isFetching || byStrategy.isFetching) && !stats.isLoading;

  const columns: Column<RiskEvent>[] = [
    { key: 'expand', title: '', render: r => (r.ext ? (expanded === r.id ? <ChevronDown className="row-chevron" /> : <ChevronRight className="row-chevron" />) : null) },
    { key: 'createTime', title: '时间' },
    { key: 'businessName', title: '业务' },
    { key: 'riskCheckType', title: '检测类型', render: r => <span title={r.riskCheckName}>{riskTypeLabel(r.riskCheckType)}</span> },
    { key: 'riskCode', title: '风险码', render: r => <span title={r.riskMessage}>{r.riskCode}</span> },
    { key: 'handleStrategy', title: '处置', render: r => <StrategyBadge value={r.handleStrategy} /> },
    { key: 'tier', title: '判定层级', render: r => { const ext = parseRiskExt(r.ext); return ext ? <>{TIER_SHORT[ext.decidedBy || ''] || ext.decidedBy || '-'}{tierDisagrees(ext) && <span className="pill warn inline-tag">两层不一致</span>}</> : '-'; } },
    { key: 'confidence', title: '第一层置信度', render: r => { const ext = parseRiskExt(r.ext); return ext ? (ext.guardConfidence == null ? '无' : fmtPercent(ext.guardConfidence)) : '-'; } },
    { key: 'images', title: '图片数', render: r => { const ext = parseRiskExt(r.ext); return ext ? ext.guardImageCount ?? 0 : '-'; } },
    { key: 'contentSnippet', title: '命中内容', render: r => <code className="truncate-code" title={r.contentSnippet}>{r.contentSnippet || '-'}</code> },
  ];

  return (
    <>
      <Header title="风险报表" desc="风险事件来自 risk_event 表，只记录风险码非 0 的检测结果。所有图表和明细都按下方筛选条件统计。"
        action={<button className="btn" onClick={() => { setRangeKey(k => k + 1); setPage(1); }}><RefreshCw />刷新</button>} />
      <div className="filter-row" role="group" aria-label="筛选条件">
        <div className="segmented">{RANGES.map(item => <button type="button" key={item.days} className={days === item.days ? 'active' : ''} onClick={() => resetPage(setDays)(item.days)}>{item.label}</button>)}</div>
        <select aria-label="业务" value={businessName} onChange={e => resetPage(setBusinessName)(e.target.value)}>
          <option value="">全部业务</option>{(businesses.data || []).map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
        </select>
        <select aria-label="检测类型" value={riskCheckType} onChange={e => resetPage(setRiskCheckType)(e.target.value)}>
          <option value="">全部检测类型</option>{typeOptions.map(type => <option key={type} value={type}>{riskTypeLabel(type)}（{type}）</option>)}
        </select>
        <select aria-label="处置方式" value={handleStrategy} onChange={e => resetPage(setHandleStrategy)(e.target.value)}>
          <option value="">全部处置</option>{['INTERCEPT', 'REDIRECT', 'REPLACE'].map(key => <option key={key} value={key}>{STRATEGY_LABELS[key]}</option>)}
        </select>
      </div>
      <State loading={stats.isLoading} error={stats.error}>
        <section className={`metrics ${refetching ? 'dim' : ''}`}>
          <Metric label="风险事件" value={fmtCount(total)} hint={peak && peak.count > 0 ? `峰值 ${peak.dimension.slice(5)}：${fmtCount(peak.count)} 件` : '所选范围内暂无事件'} />
          <Metric label="精准拦截" value={fmtCount(countOf('INTERCEPT'))} />
          <Metric label="智能纠偏" value={fmtCount(countOf('REDIRECT'))} hint="边界样本或低置信结论" />
          <Metric label="红线代答" value={fmtCount(countOf('REPLACE'))} />
        </section>
        <ChartCard title="风险事件趋势" desc="按天统计（北京时间）；左右方向键可逐日查看。" dim={refetching}
          table={{ columns: ['日期', '风险事件数'], rows: trend.map(item => [item.dimension, item.count]) }}>
          <TrendChart data={trend} height={240} />
        </ChartCard>
        <ChartCard title="处置方式构成" desc="风险事件按处置方式的数量。" dim={refetching}
          table={{ columns: ['处置方式', '风险事件数'], rows: strategies.map(item => [STRATEGY_LABELS[item.dimension] || item.dimension, item.count]) }}>
          <StrategyBar data={strategies} />
        </ChartCard>
        <section className="grid two">
          <ChartCard title="按检测类型" desc="哪类能力给出了风险结论。" dim={refetching}
            table={{ columns: ['检测类型', '风险事件数'], rows: (stats.data?.byType || []).map(item => [`${riskTypeLabel(item.dimension)}（${item.dimension}）`, item.count]) }}>
            <BarList data={toBars(stats.data?.byType || [], riskTypeLabel)} empty="所选范围内暂无风险事件" />
          </ChartCard>
          <ChartCard title="按业务" desc="风险事件最多的业务。" dim={refetching}
            table={{ columns: ['业务', '风险事件数'], rows: (stats.data?.byBusiness || []).map(item => [item.dimension, item.count]) }}>
            <BarList data={toBars(stats.data?.byBusiness || [], key => key)} empty="所选范围内暂无风险事件" />
          </ChartCard>
        </section>
      </State>
      <section className="panel">
        <div className="panel-title"><div><h2>风险事件明细（共 {fmtCount(events.data?.total || 0)} 条）</h2><p>点击带箭头的行查看分级审核详情：两层结论、置信度、耗时和裁判理由。</p></div></div>
        <State loading={events.isLoading} error={events.error}>
          <DataTable columns={columns} rows={events.data?.list || []} rowKey={r => r.id} empty="所选条件下暂无风险事件"
            onRowClick={r => r.ext && setExpanded(current => (current === r.id ? null : r.id))}
            rowClassName={r => `${r.ext ? 'clickable' : ''} ${tierDisagrees(parseRiskExt(r.ext)) ? 'highlight' : ''}`}
            expand={r => (expanded === r.id ? <ExtDetail row={r} /> : null)} />
        </State>
        <div className="row-actions pager">
          <button className="link" disabled={page <= 1 || events.isFetching} onClick={() => setPage(page - 1)}>上一页</button>
          <span>第 {page} / {totalPages} 页</span>
          <button className="link" disabled={page >= totalPages || events.isFetching} onClick={() => setPage(page + 1)}>下一页</button>
        </div>
      </section>
    </>
  );
}
