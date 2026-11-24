// 手写 SVG 的单系列趋势图：面积 + 2px 折线，十字线跟随指针吸附到最近的日期，键盘左右键同样可用。
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { Stat } from '../../types';
import { fmtCount, niceTicks } from '../../lib/format';
import { CHART_COLOR } from '../../lib/strategy';

export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const update = () => setWidth(element.clientWidth);
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const shortDay = (day: string) => day.slice(5);

export function TrendChart({ data, height = 220, color = CHART_COLOR, unit = '件', label = '风险事件' }: {
  data: Stat[]; height?: number; color?: string; unit?: string; label?: string;
}) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const margin = { top: 18, right: 28, bottom: 28, left: 44 };
  const plotW = Math.max(0, width - margin.left - margin.right);
  const plotH = height - margin.top - margin.bottom;
  const max = Math.max(0, ...data.map(d => d.count));
  const ticks = useMemo(() => niceTicks(max), [max]);
  const top = ticks[ticks.length - 1] || 1;
  const x = (i: number) => margin.left + (data.length <= 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const y = (v: number) => margin.top + plotH - (v / top) * plotH;
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.count).toFixed(1)}`).join(' ');
  const area = data.length ? `${line} L${x(data.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z` : '';
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(plotW / 56))));
  const last = data.length - 1;

  const pick = (event: PointerEvent<SVGRectElement>) => {
    if (!data.length) return;
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - box.left) / Math.max(1, box.width);
    setActive(Math.min(last, Math.max(0, Math.round(ratio * last))));
  };
  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    if (!data.length) return;
    if (event.key === 'ArrowLeft') setActive(index => Math.max(0, (index ?? last) - 1));
    if (event.key === 'ArrowRight') setActive(index => Math.min(last, (index ?? -1) + 1));
  };

  const shown = active ?? null;
  return (
    <div className="viz-wrap" ref={wrapRef} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`${label}趋势`} tabIndex={0} onKeyDown={onKey} onBlur={() => setActive(null)} className="viz-svg">
          {ticks.map(t => (
            <g key={t}>
              <line x1={margin.left} x2={width - margin.right} y1={y(t)} y2={y(t)} className={t === 0 ? 'viz-baseline' : 'viz-grid'} />
              <text x={margin.left - 8} y={y(t)} className="viz-tick" textAnchor="end" dominantBaseline="middle">{fmtCount(t)}</text>
            </g>
          ))}
          {data.map((d, i) => (i % labelEvery === 0 || i === last) && (
            <text key={d.dimension} x={x(i)} y={height - 8} className="viz-tick" textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'}>{shortDay(d.dimension)}</text>
          ))}
          {area && <path d={area} fill={color} opacity={0.1} />}
          {line && <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {shown != null && <line x1={x(shown)} x2={x(shown)} y1={margin.top} y2={margin.top + plotH} className="viz-cross" />}
          {last >= 0 && (
            <g>
              <circle cx={x(last)} cy={y(data[last].count)} r={6} fill="var(--viz-surface)" />
              <circle cx={x(last)} cy={y(data[last].count)} r={4} fill={color} />
              <text x={x(last) - 8} y={y(data[last].count) - 10} className="viz-value" textAnchor="end">{fmtCount(data[last].count)}</text>
            </g>
          )}
          {shown != null && shown !== last && (
            <g>
              <circle cx={x(shown)} cy={y(data[shown].count)} r={6} fill="var(--viz-surface)" />
              <circle cx={x(shown)} cy={y(data[shown].count)} r={4} fill={color} />
            </g>
          )}
          <rect x={margin.left} y={margin.top} width={plotW} height={plotH} fill="transparent" onPointerMove={pick} onPointerLeave={() => setActive(null)} />
        </svg>
      )}
      {shown != null && data[shown] && (
        <div className="viz-tooltip" style={{ left: Math.min(Math.max(x(shown), 70), width - 70), top: margin.top }}>
          <b>{fmtCount(data[shown].count)} {unit}</b>
          <span><i style={{ background: color }} />{label} · {data[shown].dimension}</span>
        </div>
      )}
    </div>
  );
}
