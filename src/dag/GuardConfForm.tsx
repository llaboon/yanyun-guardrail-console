// guard_check 节点的阈值表单：escalateBelow（滑块）、categoryEscalateBelow（风险码 → 阈值）、categoryMap（模型类目 → 风险码）。
import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { JsonObject } from '../types';
import {
  fromRows, readEscalateBelow, toRows, validateCategoryMapRows, validateThresholdRows, type KeyValueRow, type RowProblem,
} from '../lib/guardConf';

function KeyValueTable({ title, hint, keyLabel, valueLabel, keyPlaceholder, valuePlaceholder, rows, problems, onChange }: {
  title: string; hint: string; keyLabel: string; valueLabel: string; keyPlaceholder: string; valuePlaceholder: string;
  rows: KeyValueRow[]; problems: RowProblem[]; onChange: (rows: KeyValueRow[]) => void;
}) {
  const update = (index: number, patch: Partial<KeyValueRow>) => onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <div className="kv-table">
      <div className="kv-head"><b>{title}</b><button type="button" className="link" onClick={() => onChange([...rows, { key: '', value: '' }])}><Plus />添加</button></div>
      <small className="field-hint">{hint}</small>
      {rows.length > 0 && <div className="kv-row kv-labels"><span>{keyLabel}</span><span>{valueLabel}</span><span /></div>}
      {rows.map((row, index) => {
        const rowProblems = problems.filter(problem => problem.index === index);
        return (
          <div key={index}>
            <div className={`kv-row ${rowProblems.length ? 'invalid' : ''}`}>
              <input aria-label={keyLabel} value={row.key} placeholder={keyPlaceholder} onChange={e => update(index, { key: e.target.value })} />
              <input aria-label={valueLabel} value={row.value} placeholder={valuePlaceholder} onChange={e => update(index, { value: e.target.value })} />
              <button type="button" className="icon-action danger" title="删除" onClick={() => onChange(rows.filter((_, i) => i !== index))}><Trash2 /></button>
            </div>
            {rowProblems.map(problem => <small key={problem.message} className="field-error">{problem.message}</small>)}
          </div>
        );
      })}
    </div>
  );
}

/** 本地保存行数据，只有校验通过才写回节点配置；外部（JSON 编辑）改动时重新载入。 */
function useRows(source: unknown, validate: (rows: KeyValueRow[]) => RowProblem[], emit: (value: Record<string, number | string>) => void) {
  const [rows, setRows] = useState<KeyValueRow[]>(() => toRows(source));
  const emitted = useRef(JSON.stringify(fromRows(toRows(source))));
  const external = JSON.stringify(fromRows(toRows(source)));
  useEffect(() => {
    if (external !== emitted.current) { setRows(toRows(source)); emitted.current = external; }
  }, [external]); // eslint-disable-line react-hooks/exhaustive-deps
  const problems = validate(rows);
  const change = (next: KeyValueRow[]) => {
    setRows(next);
    if (!validate(next).length) {
      const value = fromRows(next);
      emitted.current = JSON.stringify(value);
      emit(value);
    }
  };
  return { rows, problems, change };
}

export function GuardConfForm({ conf, onChange }: { conf: JsonObject; onChange: (conf: JsonObject) => void }) {
  const escalateBelow = readEscalateBelow(conf);
  const thresholds = useRows(conf.categoryEscalateBelow, validateThresholdRows, value => onChange({ ...conf, categoryEscalateBelow: value }));
  const categoryMap = useRows(conf.categoryMap, validateCategoryMapRows, value => onChange({ ...conf, categoryMap: value }));
  const setThreshold = (value: number) => onChange({ ...conf, escalateBelow: Math.round(Math.min(1, Math.max(0, value)) * 100) / 100 });
  return (
    <div className="inspector-section guard-form">
      <h3>分级审核阈值</h3>
      <label className="inspector-field">
        <span>升级阈值 escalateBelow：置信度低于它的样本交给裁判复核</span>
        <div className="slider-row">
          <input type="range" min={0} max={1} step={0.01} value={escalateBelow} onChange={e => setThreshold(Number(e.target.value))} />
          <input type="number" min={0} max={1} step={0.01} value={escalateBelow} onChange={e => setThreshold(Number(e.target.value))} />
        </div>
        <small className="field-hint">置信度来自标签 token 的 logprobs，未经校准；0.85 只是占位值，请用自己的验证集确定。争议类结论和拿不到置信度的样本一律升级。</small>
      </label>
      <KeyValueTable title="按类目单独设阈值（categoryEscalateBelow）" hint="对高风险类目设更严的阈值，例如涉政 1001 → 0.95。"
        keyLabel="风险码" valueLabel="阈值（0–1）" keyPlaceholder="1001" valuePlaceholder="0.95" {...thresholds} onChange={thresholds.change} />
      <KeyValueTable title="模型类目映射（categoryMap）" hint="把模型的原始类目（如 Llama Guard 的 S1–S14）映射到本系统风险码；映射不到的使用 defaultUnsafeRiskCode。"
        keyLabel="模型类目" valueLabel="风险码" keyPlaceholder="S1" valuePlaceholder="1003" {...categoryMap} onChange={categoryMap.change} />
    </div>
  );
}
