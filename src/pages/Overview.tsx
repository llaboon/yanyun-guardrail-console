import { Activity, AlertTriangle, Bot, RefreshCw } from 'lucide-react';
import { Link } from 'react-router';
import { Header, Metric, Notice, Pill, State } from '../components/ui';
import { ChartCard } from '../components/charts/BarList';
import { TrendChart } from '../components/charts/TrendChart';
import { fillDays, fmtCount, lastDaysRange } from '../lib/format';
import { useBusinesses, useDags, useFunctions, useHealth, useRiskStats } from '../queries';
import type { SafetyFunction } from '../types';
import { useMemo, useState } from 'react';

const hasType = (functions: SafetyFunction[], ...types: string[]) => functions.some(item => types.includes(item.type));

export default function Overview() {
  const health = useHealth();
  const businesses = useBusinesses();
  const functions = useFunctions();
  const dags = useDags();
  // 区间在首次渲染时固定，避免每次渲染生成新的查询 key
  const [range] = useState(() => lastDaysRange(7));
  const filter = useMemo(() => ({ startTime: range.startTime, endTime: range.endTime }), [range]);
  const stats = useRiskStats(filter);
  const trend = useMemo(() => fillDays(stats.data?.byDay || [], range.start, range.end), [stats.data, range]);
  const weekTotal = trend.reduce((sum, item) => sum + item.count, 0);

  const fns = functions.data || [];
  const services: [string, string, boolean][] = [
    ['Runtime API', health.data ? '健康' : '不可用', !!health.data],
    ['Admin 配置', businesses.error ? '异常' : '可访问', !businesses.error],
    ['BERT 推理', '由能力配置发现', hasType(fns, 'single_label_pred', 'intent_check')],
    ['知识库 / 红线代答', '由能力配置发现', hasType(fns, 'kb_search', 'rag_answer', 'multi_turn_detect')],
    ['DT-Guard / 策略护栏', '由能力配置发现', hasType(fns, 'dtguard_check', 'policy_guard')],
    ['安全模型 / 裁判大模型', '由能力配置发现', hasType(fns, 'guard_check', 'llm_judge')],
    ['多模态（抽取 / 图片真实性）', '由能力配置发现', hasType(fns, 'media_extract', 'mllm_check')],
  ];
  const loading = businesses.isLoading || functions.isLoading || dags.isLoading;
  const refresh = () => { health.refetch(); businesses.refetch(); functions.refetch(); dags.refetch(); stats.refetch(); };

  return (
    <>
      <Header title="系统总览" desc="指标来自 Admin 配置和 Runtime 健康检查；风险趋势来自风险事件记录。" action={<button className="btn" onClick={refresh}><RefreshCw />刷新</button>} />
      <State loading={loading} error={businesses.error || functions.error || dags.error}>
        <section className="metrics">
          <Metric label="在线业务" value={fmtCount(businesses.data?.length)} />
          <Metric label="原子能力" value={fmtCount(fns.length)} />
          <Metric label="在线 DAG" value={fmtCount(dags.data?.length)} />
          <Metric label="近 7 天风险事件" value={stats.isLoading ? '-' : fmtCount(weekTotal)} hint={<Link to="/risk">查看风险报表</Link>} />
        </section>
        <ChartCard title="近 7 天风险事件趋势" desc="按天统计风险码非 0 的检测结果（北京时间）。" dim={stats.isFetching && !stats.isLoading}
          table={{ columns: ['日期', '风险事件数'], rows: trend.map(item => [item.dimension, item.count]) }}>
          {stats.error ? <div className="state error-state"><AlertTriangle /><b>{String((stats.error as Error).message)}</b></div> : <TrendChart data={trend} height={200} />}
        </ChartCard>
        <section className="grid two">
          <div className="panel">
            <h2>服务与能力发现</h2>
            {services.map(([name, status, ok]) => <div className="service-row" key={name}><span><Activity />{name}</span><Pill ok={ok}>{ok ? status : (status === '由能力配置发现' ? '未发现在线配置' : status)}</Pill></div>)}
          </div>
          <div className="panel">
            <h2>安全说明</h2>
            <Notice><p>登录保护覆盖控制台、Admin 代理和 Runtime 代理。当前使用 HTTP Basic Authentication，公网访问必须加 HTTPS。</p></Notice>
            <Notice tone="neutral" icon={Bot}><p>非 test 业务的在线检测由管理服务代为签名，浏览器不接触业务 Secret Key；经控制台返回的配置数据已去掉密钥字段。</p></Notice>
          </div>
        </section>
      </State>
    </>
  );
}
