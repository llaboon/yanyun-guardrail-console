// 横向条形图与图表卡片。条形 ≤18px，数据端 4px 圆角、基线端方角，数值标在条形末端。
import { useState, type ReactNode } from 'react';
import { BarChart3, Table2 } from 'lucide-react';
import { fmtCount } from '../../lib/format';
import { CHART_COLOR } from '../../lib/strategy';

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  color?: string;
  hint?: string;
}

/** 超过 maxRows 的尾部合并成“其他”，不为它们生成新颜色。 */
export function foldTail(rows: BarDatum[], maxRows: number): BarDatum[] {
  if (rows.length <= maxRows) return rows;
  const head = rows.slice(0, maxRows - 1);
  const rest = rows.slice(maxRows - 1);
  return [...head, { key: '__other', label: `其他（${rest.length} 项）`, value: rest.reduce((sum, row) => sum + row.value, 0), hint: rest.map(row => row.label).join('、') }];
}

export function BarList({ data, maxRows = 8, unit = '件', empty = '暂无数据' }: {
  data: BarDatum[]; maxRows?: number; unit?: string; empty?: ReactNode;
}) {
  const [active, setActive] = useState<string | null>(null);
  const rows = foldTail([...data].sort((a, b) => b.value - a.value), maxRows);
  const max = Math.max(1, ...rows.map(row => row.value));
  if (!rows.length) return <div className="state">{empty}</div>;
  return (
    <ul className="bar-list" aria-label="条形图">
      {rows.map(row => {
        const color = row.color || CHART_COLOR;
        const width = row.value > 0 ? Math.max(1.5, (row.value / max) * 100) : 0;
        return (
          <li key={row.key} tabIndex={0} className={active === row.key ? 'active' : ''}
            onPointerEnter={() => setActive(row.key)} onPointerLeave={() => setActive(null)}
            onFocus={() => setActive(row.key)} onBlur={() => setActive(null)}>
            <span className="bar-label" title={row.label}>{row.label}</span>
            <span className="bar-track"><i style={{ width: `${width}%`, background: color }} /></span>
            <span className="bar-value">{fmtCount(row.value)}</span>
            {active === row.key && (
              <span className="viz-tooltip bar-tip" role="tooltip">
                <b>{fmtCount(row.value)} {unit}</b>
                <span><i style={{ background: color }} />{row.label}</span>
                {row.hint && <small>{row.hint}</small>}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** 图表卡片：标题 + 图表 / 数据表切换。数据表是图表的无障碍等价视图。 */
export function ChartCard({ title, desc, table, legend, children, dim }: {
  title: string; desc?: ReactNode; table: { columns: string[]; rows: (string | number)[][] }; legend?: ReactNode; children: ReactNode; dim?: boolean;
}) {
  const [mode, setMode] = useState<'chart' | 'table'>('chart');
  return (
    <section className={`panel chart-card ${dim ? 'dim' : ''}`}>
      <div className="chart-head">
        <div><h2>{title}</h2>{desc && <p>{desc}</p>}</div>
        <div className="segmented small" role="tablist" aria-label={`${title}视图`}>
          <button type="button" className={mode === 'chart' ? 'active' : ''} onClick={() => setMode('chart')}><BarChart3 />图表</button>
          <button type="button" className={mode === 'table' ? 'active' : ''} onClick={() => setMode('table')}><Table2 />数据表</button>
        </div>
      </div>
      {legend && mode === 'chart' && <div className="viz-legend">{legend}</div>}
      {mode === 'chart' ? children : (
        <div className="table-wrap compact">
          <table>
            <thead><tr>{table.columns.map(col => <th key={col}>{col}</th>)}</tr></thead>
            <tbody>
              {table.rows.length ? table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} className={typeof cell === 'number' ? 'num' : ''}>{typeof cell === 'number' ? fmtCount(cell) : cell}</td>)}</tr>)
                : <tr><td colSpan={table.columns.length}>暂无数据</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function LegendItem({ color, label }: { color: string; label: string }) {
  return <span className="legend-item"><i style={{ background: color }} />{label}</span>;
}
