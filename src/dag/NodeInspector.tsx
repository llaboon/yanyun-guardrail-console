// DAG 节点属性面板：节点 ID、根节点、Function（引用或内联）、Router、Reduce 脚本。
import { useEffect, useState } from 'react';
import { CircleDot, Trash2 } from 'lucide-react';
import type { DagNode, JsonObject, SafetyFunction } from '../types';
import { INLINE_FUNCTION_TYPES, TYPE_LABELS } from '../lib/functionTypes';
import { ROUTER_TYPES, isDirectRouter } from '../lib/dag';
import { findSecrets, SECRET_HINT } from '../lib/secretGuard';
import { GuardConfForm } from './GuardConfForm';

function JsonField({ label, value, onChange }: { label: string; value: unknown; onChange: (value: JsonObject) => void }) {
  const serialized = JSON.stringify(value ?? {}, null, 2);
  const [text, setText] = useState(serialized);
  const [error, setError] = useState('');
  useEffect(() => { setText(serialized); setError(''); }, [serialized]);
  const apply = () => {
    try {
      const parsed = JSON.parse(text || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('必须是 JSON 对象');
      const leaks = findSecrets(parsed);
      if (leaks.length) throw new Error(`${SECRET_HINT}（${leaks.join('、')}）`);
      onChange(parsed as JsonObject);
      setError('');
    } catch (err) {
      setError(`未保存：${(err as Error).message}`);
    }
  };
  return (
    <label className="inspector-field wide">
      <span>{label}</span>
      <textarea className="inspector-code" spellCheck={false} value={text} onChange={e => setText(e.target.value)} onBlur={apply} />
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}

export function NodeInspector({ node, nodes, rootId, functions, canWrite, onChange, onRename, onRoot, onDelete }: {
  node: DagNode; nodes: DagNode[]; rootId: string; functions: SafetyFunction[]; canWrite: boolean;
  onChange: (node: DagNode) => void; onRename: (oldId: string, newId: string) => void; onRoot: () => void; onDelete: () => void;
}) {
  const [idDraft, setIdDraft] = useState(node.nodeId);
  useEffect(() => setIdDraft(node.nodeId), [node.nodeId]);
  const functionMode = node.functionConf?.ref ? 'ref' : 'inline';
  const routerType = node.routerConf?.type || 'stupid_end';
  const targets = nodes.filter(item => item.nodeId !== node.nodeId);
  const inlineType = node.functionConf?.type || 'dummy';
  const inlineTypes = [...new Set([...INLINE_FUNCTION_TYPES, ...functions.map(item => item.type), inlineType])];
  const referenced = functions.find(item => item.name === node.functionConf?.ref);

  const commitId = () => {
    const next = idDraft.trim();
    if (next && next !== node.nodeId) onRename(node.nodeId, next);
    else setIdDraft(node.nodeId);
  };
  const updateFunction = (patch: Partial<NonNullable<DagNode['functionConf']>>) => onChange({ ...node, functionConf: { ...node.functionConf, ...patch } });
  const setFunctionMode = (mode: string) => onChange({
    ...node,
    functionConf: mode === 'ref' ? { ref: functions[0]?.name || '' } : { type: 'dummy', name: 'dummy', timeoutMilliseconds: 5, conf: {} },
  });
  const setRouterType = (type: string) => {
    if (type === 'stupid_end') onChange({ ...node, routerConf: { type, name: type } });
    else if (type === 'groovy') onChange({ ...node, routerConf: { type, name: type, conf: { script: node.routerConf?.conf?.script || 'return null' } } });
    else onChange({ ...node, routerConf: { type, name: type, conf: { nodeId: node.routerConf?.conf?.nodeId || targets[0]?.nodeId || '' } } });
  };

  return (
    <aside className="dag-inspector">
      <header><div><span>节点属性</span><b>{node.nodeId}</b></div><button type="button" className="icon-action danger" title="删除节点" disabled={!canWrite} onClick={onDelete}><Trash2 /></button></header>
      <fieldset className="dag-inspector-scroll" disabled={!canWrite}>
        <label className="inspector-field"><span>节点 ID</span><input value={idDraft} onChange={e => setIdDraft(e.target.value)} onBlur={commitId} /></label>
        <div className="root-row"><span>执行入口</span><button type="button" className={`root-toggle ${rootId === node.nodeId ? 'active' : ''}`} onClick={onRoot}><CircleDot />{rootId === node.nodeId ? '当前根节点' : '设为根节点'}</button></div>
        <label className="toggle-row"><input type="checkbox" checked={node.ignoreError !== false} onChange={e => onChange({ ...node, ignoreError: e.target.checked })} /><span>能力失败时继续执行（结果置空）</span></label>

        <div className="inspector-section"><h3>Function</h3>
          <label className="inspector-field"><span>配置方式</span><select value={functionMode} onChange={e => setFunctionMode(e.target.value)}><option value="ref">引用在线能力</option><option value="inline">内联能力</option></select></label>
          {functionMode === 'ref' ? (
            <label className="inspector-field"><span>能力引用</span>
              <select value={node.functionConf?.ref || ''} onChange={e => onChange({ ...node, functionConf: { ref: e.target.value } })}>
                {node.functionConf?.ref && !referenced && <option value={node.functionConf.ref}>{node.functionConf.ref}（未找到在线能力）</option>}
                {functions.map(item => <option key={item.id || item.name} value={item.name}>{item.name} · {item.type}</option>)}
              </select>
              {referenced?.type === 'guard_check' && <small className="field-hint">阈值在“安全能力”页编辑该能力；也可以改成内联能力在这里调整。</small>}
            </label>
          ) : (
            <>
              <label className="inspector-field"><span>能力类型</span><select value={inlineType} onChange={e => updateFunction({ type: e.target.value })}>{inlineTypes.map(type => <option key={type} value={type}>{type}{TYPE_LABELS[type] ? ` · ${TYPE_LABELS[type]}` : ''}</option>)}</select></label>
              <label className="inspector-field"><span>能力名称</span><input value={node.functionConf?.name || ''} onChange={e => updateFunction({ name: e.target.value })} /></label>
              <label className="inspector-field"><span>超时（ms）</span><input type="number" min={1} value={node.functionConf?.timeoutMilliseconds || 1000} onChange={e => updateFunction({ timeoutMilliseconds: Number(e.target.value) })} /></label>
              {inlineType === 'guard_check' && <GuardConfForm conf={node.functionConf?.conf || {}} onChange={conf => updateFunction({ conf })} />}
              <JsonField label="能力参数 JSON" value={node.functionConf?.conf || {}} onChange={conf => updateFunction({ conf })} />
            </>
          )}
        </div>

        <div className="inspector-section"><h3>Router</h3>
          <label className="inspector-field"><span>路由类型</span><select value={routerType} onChange={e => setRouterType(e.target.value)}>{ROUTER_TYPES.map(type => <option key={type}>{type}</option>)}</select></label>
          {isDirectRouter(routerType) && (
            <label className="inspector-field"><span>下一节点</span>
              <select value={node.routerConf?.conf?.nodeId || ''} onChange={e => onChange({ ...node, routerConf: { ...node.routerConf!, conf: { ...node.routerConf?.conf, nodeId: e.target.value } } })}>
                <option value="">请选择</option>{targets.map(item => <option key={item.nodeId}>{item.nodeId}</option>)}
              </select>
            </label>
          )}
          {routerType === 'groovy' && (
            <label className="inspector-field wide"><span>Groovy 路由脚本</span>
              <textarea className="inspector-code groovy" spellCheck={false} value={node.routerConf?.conf?.script || ''} onChange={e => onChange({ ...node, routerConf: { ...node.routerConf!, conf: { ...node.routerConf?.conf, script: e.target.value } } })} />
              <small className="field-hint">脚本可读 ctx.curResult、ctx.curResult.resultMap、ctx.curReq；return 后面的节点名会自动画成分支连线（含三元表达式）。返回 null 表示结束。</small>
            </label>
          )}
        </div>

        <label className="inspector-field wide"><span>Reduce Script（可选）</span><textarea className="inspector-code" spellCheck={false} value={node.reduceScriptRaw || ''} onChange={e => onChange({ ...node, reduceScriptRaw: e.target.value })} /></label>
      </fieldset>
    </aside>
  );
}
