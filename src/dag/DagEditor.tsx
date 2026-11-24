// DAG 可视化编辑器：画布 / 高级 JSON 双模式、添加节点、插入分级审核模板、自动布局、发布前校验。
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import dagre from '@dagrejs/dagre';
import {
  Background, BackgroundVariant, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, applyNodeChanges,
  type Connection, type Edge, type Node, type NodeChange, type NodeProps,
} from '@xyflow/react';
import { AlertTriangle, Braces, CheckCircle2, CircleDot, GitBranch, LayoutGrid, Layers, LoaderCircle, Plus, Save, X } from 'lucide-react';
import type { DagNode, DagStrategy, SafetyFunction } from '../types';
import {
  buildDagEdges, cloneDag, connectDagNodes, disconnectDagNodes, insertTieredTemplate, renameDagNode, tieredTemplateNodes, validateDag,
} from '../lib/dag';
import { GUARD_TEMPLATE, JUDGE_TEMPLATE, MEDIA_EXTRACT_TEMPLATE } from '../lib/functionTypes';
import { NodeInspector } from './NodeInspector';

const NODE_WIDTH = 196;
const NODE_HEIGHT = 76;
const EDGE_COLOR = '#94070a';
const ESCALATE_COLOR = '#2a78d6';

interface NodeData extends Record<string, unknown> {
  label: string;
  functionLabel: string;
  routerType: string;
  isRoot: boolean;
  tier?: 'guard' | 'judge';
}

function functionTypeOf(node: DagNode, types: Record<string, string>) {
  return node.functionConf?.type || types[node.functionConf?.ref || ''];
}

function layoutNodes(config: DagNode[], rootId: string, types: Record<string, string>): Node<NodeData>[] {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: 'LR', ranksep: 92, nodesep: 34, marginx: 28, marginy: 28 });
  config.forEach(node => graph.setNode(node.nodeId, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  buildDagEdges(config, types).forEach(edge => { if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) graph.setEdge(edge.source, edge.target); });
  dagre.layout(graph);
  return config.map((node, index) => {
    const point = graph.node(node.nodeId) || { x: index * 250, y: 100 };
    const type = functionTypeOf(node, types);
    return {
      id: node.nodeId,
      type: 'dagNode',
      position: { x: point.x - NODE_WIDTH / 2, y: point.y - NODE_HEIGHT / 2 },
      data: {
        label: node.nodeId,
        functionLabel: node.functionConf?.ref || node.functionConf?.name || node.functionConf?.type || '未配置能力',
        routerType: node.routerConf?.type || '未配置路由',
        isRoot: node.nodeId === rootId,
        tier: type === 'guard_check' ? 'guard' : type === 'llm_judge' ? 'judge' : undefined,
      },
    };
  });
}

const DagNodeView = memo(function DagNodeView({ data, selected }: NodeProps<Node<NodeData>>) {
  return (
    <div className={`dag-node ${selected ? 'selected' : ''} ${data.isRoot ? 'root' : ''} ${data.tier ? `tier-${data.tier}` : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="dag-node-title"><span>{data.isRoot ? <CircleDot /> : <GitBranch />}</span><b>{data.label}</b>{data.tier && <em>{data.tier === 'guard' ? '第一层' : '裁判'}</em>}</div>
      <div className="dag-node-meta"><span title={data.functionLabel}>{data.functionLabel}</span><code>{data.routerType}</code></div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
});

const nodeTypes = { dagNode: DagNodeView };

export default function DagEditor({ strategy, functions, canWrite, busy, onClose, onSave }: {
  strategy: DagStrategy; functions: SafetyFunction[]; canWrite: boolean; busy: boolean;
  onClose: () => void; onSave: (changes: { desc: string; rootId: string; confArray: DagNode[] }) => void;
}) {
  const types = useMemo(() => Object.fromEntries(functions.map(item => [item.name, item.type])), [functions]);
  const [config, setConfig] = useState<DagNode[]>(() => cloneDag(strategy.confArray));
  const [rootId, setRootId] = useState(strategy.rootId || strategy.confArray?.[0]?.nodeId || '');
  const [desc, setDesc] = useState(strategy.desc || '');
  const [selectedId, setSelectedId] = useState(rootId);
  const [mode, setMode] = useState<'visual' | 'json'>('visual');
  const [jsonText, setJsonText] = useState(() => JSON.stringify(strategy.confArray || [], null, 2));
  const [message, setMessage] = useState('');
  const [flowNodes, setFlowNodes] = useState(() => layoutNodes(config, rootId, types));

  const diagnostics = useMemo(() => {
    if (mode !== 'json') return validateDag(config, rootId);
    try {
      const parsed = JSON.parse(jsonText);
      return Array.isArray(parsed) ? validateDag(parsed, rootId) : { errors: ['JSON 顶层必须是节点数组'], warnings: [] };
    } catch (err) {
      return { errors: [`JSON 格式错误：${(err as Error).message}`], warnings: [] };
    }
  }, [config, rootId, mode, jsonText]);

  const flowEdges = useMemo<Edge[]>(() => buildDagEdges(config, types).map(edge => {
    const escalate = edge.label === '低置信升级';
    const color = escalate ? ESCALATE_COLOR : EDGE_COLOR;
    return {
      ...edge,
      type: 'smoothstep',
      animated: escalate,
      markerEnd: { type: MarkerType.ArrowClosed, color },
      style: { stroke: color, strokeWidth: escalate ? 2 : 1.5 },
      labelStyle: { fill: escalate ? '#1c5cab' : '#6f5557', fontSize: 11, fontWeight: escalate ? 600 : 400 },
      labelBgStyle: { fill: '#ffffff' },
    };
  }), [config, types]);
  const selectedNode = config.find(node => node.nodeId === selectedId) || config[0];

  useEffect(() => {
    setFlowNodes(previous => {
      const positions = new Map(previous.map(node => [node.id, node.position]));
      return layoutNodes(config, rootId, types).map(node => ({ ...node, position: positions.get(node.id) || node.position }));
    });
    if (selectedId && !config.some(node => node.nodeId === selectedId)) setSelectedId(config[0]?.nodeId || '');
  }, [config, rootId, selectedId, types]);

  const updateNode = useCallback((next: DagNode) => setConfig(current => current.map(node => (node.nodeId === next.nodeId ? next : node))), []);
  const renameNode = useCallback((oldId: string, newId: string) => {
    if (!/^[A-Za-z0-9_-]+$/.test(newId)) { setMessage('节点 ID 只能包含字母、数字、下划线和连字符'); return; }
    if (config.some(node => node.nodeId === newId)) { setMessage(`节点 ID ${newId} 已存在`); return; }
    setConfig(current => renameDagNode(current, oldId, newId));
    if (rootId === oldId) setRootId(newId);
    setSelectedId(newId); setMessage('');
  }, [config, rootId]);

  const addNode = () => {
    let index = config.length + 1;
    while (config.some(node => node.nodeId === `node_${index}`)) index += 1;
    const nodeId = `node_${index}`;
    const next: DagNode = {
      nodeId,
      functionConf: functions[0]?.name ? { ref: functions[0].name } : { type: 'dummy', name: 'dummy', timeoutMilliseconds: 5, conf: {} },
      routerConf: { type: 'stupid_end', name: 'stupid_end' },
      ignoreError: true,
    };
    setConfig(current => [...current, next]);
    if (!rootId) setRootId(nodeId);
    setSelectedId(nodeId);
  };

  const insertTiered = () => {
    const keywordRef = functions.find(item => item.type === 'keyword')?.name || 'keyword';
    const template = tieredTemplateNodes(GUARD_TEMPLATE, JUDGE_TEMPLATE, MEDIA_EXTRACT_TEMPLATE, keywordRef);
    // 选中节点是普通结束节点时，直接把它接到模板入口
    const from = selectedNode && (!selectedNode.routerConf || selectedNode.routerConf.type === 'stupid_end') ? selectedNode.nodeId : undefined;
    try {
      const next = insertTieredTemplate(config, template, from);
      setConfig(next);
      if (!rootId) setRootId(template[0].nodeId);
      setSelectedId('mm_guard');
      setMessage(from
        ? `已插入分级审核模板，并把 ${from} 接到 media_extract。请把 mm_guard、llm_judge 的 url / model 改成实际地址。`
        : '已插入分级审核模板。请把某个节点路由到 media_extract，并把 mm_guard、llm_judge 的 url / model 改成实际地址。');
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const deleteNode = () => {
    if (!selectedNode || !window.confirm(`确认删除节点“${selectedNode.nodeId}”？引用该节点的路由需要重新配置。`)) return;
    const next = config.filter(node => node.nodeId !== selectedNode.nodeId);
    setConfig(next);
    if (rootId === selectedNode.nodeId) setRootId(next[0]?.nodeId || '');
    setSelectedId(next[0]?.nodeId || '');
  };
  const connect = (connection: Connection) => {
    try {
      setConfig(connectDagNodes(config, connection.source, connection.target));
      setMessage('已生成直接路由；复杂条件分支请使用 Groovy 脚本');
    } catch (err) { setMessage((err as Error).message); }
  };
  const deleteEdges = (edges: Edge[]) => {
    try {
      setConfig(edges.reduce((current, edge) => disconnectDagNodes(current, edge.source, edge.target), config));
      setMessage('连线已移除，源节点已改为结束路由');
    } catch (err) { setMessage((err as Error).message); }
  };
  const changeMode = (next: 'visual' | 'json') => {
    if (next === mode) return;
    if (next === 'json') { setJsonText(JSON.stringify(config, null, 2)); setMode('json'); return; }
    try {
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) throw new Error('顶层必须是节点数组');
      setConfig(parsed as DagNode[]); setMessage('JSON 已同步到画布'); setMode('visual');
    } catch (err) { setMessage(`JSON 格式错误：${(err as Error).message}`); }
  };
  const submit = () => {
    let next = config;
    if (mode === 'json') {
      try {
        const parsed = JSON.parse(jsonText);
        if (!Array.isArray(parsed)) throw new Error('顶层必须是节点数组');
        next = parsed as DagNode[];
      } catch (err) { setMessage(`JSON 格式错误：${(err as Error).message}`); return; }
    }
    const result = validateDag(next, rootId);
    if (result.errors.length) { setMessage(`请先修复 ${result.errors.length} 个配置错误`); return; }
    onSave({ desc, rootId, confArray: next });
  };

  return (
    <>
      <div className="modal-scrim" />
      <section className="dag-editor-modal" role="dialog" aria-modal="true" aria-label={`编辑 ${strategy.businessName} DAG`}>
        <header className="dag-editor-head">
          <div><span>DAG 可视化编排</span><h2>{strategy.businessName} · 版本 {strategy.version}</h2></div>
          <div className="dag-head-fields">
            <label>描述<input value={desc} onChange={e => setDesc(e.target.value)} /></label>
            <label>根节点<select value={rootId} onChange={e => setRootId(e.target.value)}>{config.map(node => <option key={node.nodeId}>{node.nodeId}</option>)}</select></label>
          </div>
          <button type="button" className="icon-action" title="关闭" onClick={onClose}><X /></button>
        </header>
        <div className="dag-editor-toolbar">
          <div className="segmented" aria-label="编辑模式">
            <button type="button" className={mode === 'visual' ? 'active' : ''} onClick={() => changeMode('visual')}><GitBranch />画布</button>
            <button type="button" className={mode === 'json' ? 'active' : ''} onClick={() => changeMode('json')}><Braces />高级 JSON</button>
          </div>
          <button type="button" className="btn" onClick={addNode} disabled={!canWrite || mode !== 'visual'}><Plus />添加节点</button>
          <button type="button" className="btn" onClick={insertTiered} disabled={!canWrite || mode !== 'visual'} title="插入 media_extract → 关键词 → 安全模型 → 裁判四个节点"><Layers />分级审核模板</button>
          <button type="button" className="btn" onClick={() => setFlowNodes(layoutNodes(config, rootId, types))} disabled={mode !== 'visual'}><LayoutGrid />自动布局</button>
          <div className={`dag-validation ${diagnostics.errors.length ? 'invalid' : 'valid'}`}>
            {diagnostics.errors.length ? <AlertTriangle /> : <CheckCircle2 />}
            <span>{diagnostics.errors.length ? `${diagnostics.errors.length} 个错误` : '结构校验通过'}{diagnostics.warnings.length ? ` · ${diagnostics.warnings.length} 个提醒` : ''}</span>
          </div>
        </div>
        <div className="dag-editor-status">
          {message && <div className={`dag-message ${diagnostics.errors.length ? 'warn' : ''}`}>{message}</div>}
          {diagnostics.errors.length > 0 && <div className="dag-diagnostics">{diagnostics.errors.map(item => <span key={item}>{item}</span>)}</div>}
        </div>
        {mode === 'visual' ? (
          <div className="dag-editor-body">
            <aside className="dag-node-list"><h3>节点</h3><div>
              {config.map(node => (
                <button type="button" key={node.nodeId} className={selectedNode?.nodeId === node.nodeId ? 'active' : ''} onClick={() => setSelectedId(node.nodeId)}>
                  <GitBranch /><span><b>{node.nodeId}</b><small>{node.functionConf?.ref || node.functionConf?.type || '未配置能力'}</small></span>{rootId === node.nodeId && <CircleDot />}
                </button>
              ))}
            </div></aside>
            <div className="dag-canvas" data-testid="dag-canvas">
              <ReactFlow nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes}
                onNodesChange={(changes: NodeChange<Node<NodeData>>[]) => setFlowNodes(current => applyNodeChanges(changes, current))}
                onNodeClick={(_, node) => setSelectedId(node.id)} onConnect={connect} onEdgesDelete={deleteEdges}
                fitView minZoom={0.25} maxZoom={1.8} deleteKeyCode={null} nodesConnectable={canWrite} nodesDraggable={canWrite} edgesReconnectable={false}>
                <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
                <MiniMap pannable zoomable nodeColor={node => ((node.data as NodeData).isRoot ? '#94070a' : '#c7ccd2')} />
                <Controls showInteractive={false} />
              </ReactFlow>
            </div>
            {selectedNode && <NodeInspector node={selectedNode} nodes={config} rootId={rootId} functions={functions} canWrite={canWrite}
              onChange={updateNode} onRename={renameNode} onRoot={() => setRootId(selectedNode.nodeId)} onDelete={deleteNode} />}
          </div>
        ) : (
          <div className="dag-json-workspace">
            <div><h3>节点配置 JSON</h3><p>切回画布时会解析并同步这里的内容，发布前仍会执行结构校验。</p></div>
            <textarea className="code-editor dag-code" value={jsonText} onChange={e => setJsonText(e.target.value)} spellCheck={false} readOnly={!canWrite} />
          </div>
        )}
        <footer className="dag-editor-footer">
          <div>{diagnostics.warnings.map(item => <span key={item}><AlertTriangle />{item}</span>)}</div>
          <button type="button" className="btn" onClick={onClose}>取消</button>
          <button type="button" className="btn primary" disabled={!canWrite || busy || diagnostics.errors.length > 0 || !desc.trim()} onClick={submit}>
            {busy ? <LoaderCircle className="spin" /> : <Save />}{busy ? '发布中' : '发布新版本'}
          </button>
        </footer>
      </section>
    </>
  );
}
