// 处置方式构成：单根堆叠条（3 段，段间 2px 底色间隙）+ 图例 + 各段数值。
import { useState } from 'react';
import type { Stat } from '../../types';
import { fmtCount } from '../../lib/format';
import { STRATEGY_COLORS, STRATEGY_LABELS } from '../../lib/strategy';
import { LegendItem } from './BarList';

export function StrategyBar({ data }: { data: Stat[] }) {
  const [active, setActive] = useState<string | null>(null);
  const total = data.reduce((sum, item) => sum + item.count, 0);
  const segments = data.filter(item => item.count > 0);
  return (
    <div className="strategy-bar">
      <div className="viz-legend">
        {data.map(item => <LegendItem key={item.dimension} color={STRATEGY_COLORS[item.dimension] || '#8b9198'} label={STRATEGY_LABELS[item.dimension] || item.dimension} />)}
      </div>
      {total === 0 ? <div className="state">所选范围内暂无风险事件</div> : (
        <>
          <div className="stack-track" role="img" aria-label="处置方式构成">
            {segments.map(item => (
              <span key={item.dimension} tabIndex={0} className={active === item.dimension ? 'active' : ''}
                style={{ flexGrow: item.count, background: STRATEGY_COLORS[item.dimension] || '#8b9198' }}
                onPointerEnter={() => setActive(item.dimension)} onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(item.dimension)} onBlur={() => setActive(null)}>
                {active === item.dimension && (
                  <span className="viz-tooltip stack-tip" role="tooltip">
                    <b>{fmtCount(item.count)} 件</b>
                    <span><i style={{ background: STRATEGY_COLORS[item.dimension] }} />{STRATEGY_LABELS[item.dimension]}</span>
                  </span>
                )}
              </span>
            ))}
          </div>
          <dl className="stack-values">
            {data.map(item => (
              <div key={item.dimension}>
                <dt><i style={{ background: STRATEGY_COLORS[item.dimension] || '#8b9198' }} />{STRATEGY_LABELS[item.dimension] || item.dimension}</dt>
                <dd>{fmtCount(item.count)}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}
