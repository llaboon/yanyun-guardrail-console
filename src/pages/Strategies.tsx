import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { admin } from '../api';
import { useAuth } from '../auth';
import { DataTable, Header, Pill, State, VIEWER_HINT, VersionSheet, confirmAction, useMessage, type Column } from '../components/ui';
import DagEditor from '../dag/DagEditor';
import { errorMessage } from '../lib/format';
import { useDags, useFunctions, useInvalidateConfig } from '../queries';
import type { DagNode, DagStrategy, VersionRecord } from '../types';

export default function Strategies() {
  const { credentials, canWrite } = useAuth();
  const dags = useDags();
  const functions = useFunctions();
  const invalidate = useInvalidateConfig();
  const msg = useMessage();
  const [editor, setEditor] = useState<DagStrategy | null>(null);
  const [busy, setBusy] = useState<string | number | null>(null);
  const [history, setHistory] = useState<{ title: string; versions: VersionRecord[]; loading: boolean; error?: string } | null>(null);

  const save = async (changes: { desc: string; rootId: string; confArray: DagNode[] }) => {
    if (!editor) return;
    setBusy('save'); msg.clear();
    try {
      const draft = await admin.dagNewVersion(credentials, { id: editor.id });
      await admin.dagUpdate(credentials, { ...draft, ...changes });
      await admin.dagUpgrade(credentials, draft.id);
      setEditor(null); msg.info('DAG 新版本已发布，Runtime API 最多约两分钟后热更新'); invalidate();
    } catch (e) { msg.fail(e); } finally { setBusy(null); }
  };
  const toggle = async (row: DagStrategy) => {
    const online = row.status === 'online';
    if (!confirmAction(online ? `确认下线 DAG“${row.businessName}”？` : `确认发布并上线 DAG“${row.businessName}”版本 ${row.version}？`)) return;
    setBusy(row.id); msg.clear();
    try {
      await (online ? admin.dagOffline(credentials, row.id) : admin.dagOnline(credentials, row.id));
      msg.info(online ? 'DAG 已下线' : 'DAG 已提交上线，Runtime API 最多约两分钟后完成热更新'); invalidate();
    } catch (e) { msg.fail(e); } finally { setBusy(null); }
  };
  const showHistory = async (row: DagStrategy) => {
    const title = `${row.businessName} DAG 版本历史`;
    setHistory({ title, versions: [], loading: true });
    try { setHistory({ title, versions: (await admin.dagVersions(credentials, { group: row.group, businessName: row.businessName })) || [], loading: false }); }
    catch (e) { setHistory({ title, versions: [], loading: false, error: errorMessage(e) }); }
  };

  const tieredOf = (row: DagStrategy) => {
    const types = new Map((functions.data || []).map(item => [item.name, item.type]));
    const typeOf = (node: DagNode) => node.functionConf?.type || types.get(node.functionConf?.ref || '');
    return row.confArray?.some(node => typeOf(node) === 'guard_check') && row.confArray?.some(node => typeOf(node) === 'llm_judge');
  };
  const columns: Column<DagStrategy>[] = [
    { key: 'businessName', title: '业务', render: r => <>{r.businessName}{tieredOf(r) && <span className="pill info inline-tag">分级审核</span>}</> },
    { key: 'desc', title: '描述', render: r => <span className="mono-clip" title={r.desc}>{r.desc || '-'}</span> },
    { key: 'rootId', title: '根节点' },
    { key: 'version', title: '版本' },
    { key: 'status', title: '状态', render: r => <Pill ok={r.status === 'online'}>{r.status}</Pill> },
    { key: 'nodes', title: '节点数', render: r => r.confArray?.length ?? '-' },
    { key: 'action', title: '操作', render: r => <div className="row-actions">
      <button className="link" onClick={() => showHistory(r)}>历史</button>
      <button className="link" onClick={() => setEditor(r)}>{canWrite ? '编辑' : '查看'}</button>
      <button className={`link ${r.status === 'online' ? 'danger' : ''}`} disabled={!canWrite || busy === r.id} title={canWrite ? undefined : VIEWER_HINT} onClick={() => toggle(r)}>{busy === r.id ? '处理中' : r.status === 'online' ? '下线' : '上线'}</button>
    </div> },
  ];
  return (
    <>
      <Header title="DAG 策略" desc="在画布中编排节点、路由和能力配置；发布时自动创建新版本并原子升级，生效最多约 2 分钟。"
        action={<button className="btn" onClick={() => dags.refetch()}><RefreshCw />刷新</button>} />
      {msg.view}
      <div className="panel"><State loading={dags.isLoading} error={dags.error}><DataTable columns={columns} rows={dags.data || []} rowKey={r => r.id} /></State></div>
      {editor && <DagEditor strategy={editor} functions={functions.data || []} canWrite={canWrite} busy={busy === 'save'} onClose={() => setEditor(null)} onSave={save} />}
      {history && <VersionSheet {...history} onClose={() => setHistory(null)} />}
    </>
  );
}
