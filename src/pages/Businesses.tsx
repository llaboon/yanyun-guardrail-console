import { useState } from 'react';
import { KeyRound, Plus, RefreshCw } from 'lucide-react';
import { admin } from '../api';
import { useAuth } from '../auth';
import { DataTable, Field, Header, Modal, Pill, State, VIEWER_HINT, VersionSheet, confirmAction, useMessage, type Column } from '../components/ui';
import { errorMessage } from '../lib/format';
import { useBusinesses, useInvalidateConfig } from '../queries';
import type { Business, CheckConf, VersionRecord } from '../types';

const CHECK_UNITS = [
  { value: 'message_single', label: '单条消息' },
  { value: 'message_multi', label: '多条消息' },
  { value: 'slice_single', label: '单个分片（流式输出）' },
  { value: 'slice_multi', label: '多个分片（流式输出）' },
];
const BUSINESS_TYPES = ['toC', 'toB', 'toE'];
const DEFAULT_USER_CHECK: CheckConf = { unit: 'message_single', checkNum: 1, timeoutMilliseconds: 5000 };
const DEFAULT_ROBOT_CHECK: CheckConf = { unit: 'slice_single', checkNum: 1, timeoutMilliseconds: 5000 };

interface BusinessDraft {
  isNew: boolean;
  row?: Business;
  name: string;
  desc: string;
  type: string;
  qpsLimit: number | string;
  secretKey: string;
  userCheck: CheckConf;
  robotCheck: CheckConf;
}

/** 生成 32 位随机密钥（base64url）。 */
function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_');
}

function CheckConfFields({ label, value, onChange }: { label: string; value: CheckConf; onChange: (next: CheckConf) => void }) {
  return (
    <fieldset className="wide check-conf">
      <legend>{label}</legend>
      <Field label="检测粒度"><select value={value.unit} onChange={e => onChange({ ...value, unit: e.target.value })}>{CHECK_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}</select></Field>
      <Field label="检测条数"><input type="number" min={1} required value={value.checkNum} onChange={e => onChange({ ...value, checkNum: Number(e.target.value) })} /></Field>
      <Field label="整体超时（ms）"><input type="number" min={1} required value={value.timeoutMilliseconds} onChange={e => onChange({ ...value, timeoutMilliseconds: Number(e.target.value) })} /></Field>
    </fieldset>
  );
}

export default function Businesses() {
  const { credentials, canWrite } = useAuth();
  const businesses = useBusinesses();
  const invalidate = useInvalidateConfig();
  const msg = useMessage();
  const [editor, setEditor] = useState<BusinessDraft | null>(null);
  const [history, setHistory] = useState<{ title: string; versions: VersionRecord[]; loading: boolean; error?: string } | null>(null);
  const [busy, setBusy] = useState<string | number | null>(null);

  const openNew = () => setEditor({ isNew: true, name: '', desc: '', type: 'toC', qpsLimit: 20, secretKey: '', userCheck: { ...DEFAULT_USER_CHECK }, robotCheck: { ...DEFAULT_ROBOT_CHECK } });
  const openEdit = (row: Business) => setEditor({
    isNew: false, row, name: row.name, desc: row.desc, type: row.type, qpsLimit: row.qpsLimit, secretKey: '',
    userCheck: { ...DEFAULT_USER_CHECK, ...row.userCheckConfObj }, robotCheck: { ...DEFAULT_ROBOT_CHECK, ...row.robotCheckConfObj },
  });

  const save = async () => {
    if (!editor) return;
    setBusy('save'); msg.clear();
    try {
      const common = {
        name: editor.name, group: 'default', desc: editor.desc, type: editor.type, qpsLimit: Number(editor.qpsLimit),
        accessTargetsArray: ['defenseV2', 'defenseResultV2'], userCheckConfObj: editor.userCheck, robotCheckConfObj: editor.robotCheck,
      };
      if (editor.isNew) {
        const created = await admin.businessNew(credentials, { ...common, secretKey: editor.secretKey });
        await admin.businessOnline(credentials, created.id);
      } else {
        const draft = await admin.businessNewVersion(credentials, { id: editor.row!.id });
        // 留空表示沿用原密钥：不发送 secretKey，由管理服务从草稿记录里补齐
        const body: Record<string, unknown> = { ...editor.row, ...common, id: draft.id, version: draft.version, status: 'edit' };
        if (editor.secretKey) body.secretKey = editor.secretKey;
        else delete body.secretKey;
        await admin.businessUpdate(credentials, body);
        await admin.businessUpgrade(credentials, draft.id);
      }
      setEditor(null);
      msg.info(editor.isNew ? '业务已创建并上线；Secret Key 不会再显示，请确认已交给业务方。' : '业务配置已发布，Runtime API 将在轮询后生效');
      invalidate();
    } catch (e) { msg.fail(e); } finally { setBusy(null); }
  };

  const offline = async (row: Business) => {
    if (!confirmAction(`确认下线业务“${row.name}”？该操作将影响运行时检测。`)) return;
    setBusy(row.id); msg.clear();
    try { await admin.businessOffline(credentials, row.id); msg.info('业务已下线，配置将在轮询后生效'); invalidate(); }
    catch (e) { msg.fail(e); } finally { setBusy(null); }
  };

  const showHistory = async (row: Business) => {
    const title = `${row.name} 版本历史`;
    setHistory({ title, versions: [], loading: true });
    try { setHistory({ title, versions: (await admin.businessVersions(credentials, { group: row.group, name: row.name })) || [], loading: false }); }
    catch (e) { setHistory({ title, versions: [], loading: false, error: errorMessage(e) }); }
  };

  const columns: Column<Business>[] = [
    { key: 'name', title: '业务名称', render: r => <>{r.name}{r.name.startsWith('test') && <span className="pill neutral inline-tag" title="test 开头的业务免签名，仅限测试环境">免签</span>}</> },
    { key: 'type', title: '类型' },
    { key: 'qpsLimit', title: 'QPS' },
    { key: 'timeout', title: '用户侧超时（ms）', render: r => r.userCheckConfObj?.timeoutMilliseconds ?? '-' },
    { key: 'version', title: '版本' },
    { key: 'status', title: '状态', render: r => <Pill ok={r.status === 'online'}>{r.status}</Pill> },
    { key: 'action', title: '操作', render: r => <div className="row-actions">
      <button className="link" onClick={() => showHistory(r)}>历史</button>
      <button className="link" disabled={!canWrite} title={canWrite ? undefined : VIEWER_HINT} onClick={() => openEdit(r)}>编辑</button>
      <button className="link danger" disabled={!canWrite || busy === r.id} title={canWrite ? undefined : VIEWER_HINT} onClick={() => offline(r)}>{busy === r.id ? '处理中' : '下线'}</button>
    </div> },
  ];

  return (
    <>
      <Header title="业务接入" desc="管理接入密钥、限流和检测粒度；在线配置通过创建新版本发布。"
        action={<div className="heading-actions">
          <button className="btn" onClick={() => businesses.refetch()}><RefreshCw />刷新</button>
          <button className="btn primary" disabled={!canWrite} onClick={openNew}><Plus />新建业务</button>
        </div>} />
      {msg.view}
      <div className="panel"><State loading={businesses.isLoading} error={businesses.error}><DataTable columns={columns} rows={businesses.data || []} rowKey={r => r.id} /></State></div>
      {editor && (
        <Modal title={editor.isNew ? '新建业务' : `编辑 ${editor.name}`} onClose={() => setEditor(null)} onSubmit={save} busy={busy === 'save'} submitLabel={editor.isNew ? '创建并上线' : '创建新版本并发布'}>
          <div className="form-grid">
            <Field label="业务名称（accessKey）" hint={editor.isNew ? 'test 开头的业务免签名，只能用于测试环境' : undefined}><input required disabled={!editor.isNew} pattern="[A-Za-z0-9_\-]+" title="只能包含字母、数字、下划线和连字符" value={editor.name} onChange={e => setEditor({ ...editor, name: e.target.value })} /></Field>
            <Field label="业务类型"><select value={editor.type} onChange={e => setEditor({ ...editor, type: e.target.value })}>{BUSINESS_TYPES.map(t => <option key={t}>{t}</option>)}</select></Field>
            <Field label="描述" wide><input required value={editor.desc} onChange={e => setEditor({ ...editor, desc: e.target.value })} /></Field>
            <Field label="Secret Key" hint={editor.isNew ? '保存后控制台不再显示密钥，请先复制给业务方' : '留空保持原密钥；填写则替换为新密钥'}>
              <div className="input-row">
                <input required={editor.isNew} type={editor.isNew ? 'text' : 'password'} autoComplete="new-password" placeholder={editor.isNew ? '请输入或随机生成' : '留空保持原密钥'} value={editor.secretKey} onChange={e => setEditor({ ...editor, secretKey: e.target.value })} />
                <button type="button" className="btn" title="随机生成" onClick={() => setEditor({ ...editor, secretKey: randomSecret() })}><KeyRound />生成</button>
              </div>
            </Field>
            <Field label="QPS 限制"><input required min={1} type="number" value={editor.qpsLimit} onChange={e => setEditor({ ...editor, qpsLimit: e.target.value })} /></Field>
            <CheckConfFields label="用户输入检测" value={editor.userCheck} onChange={userCheck => setEditor({ ...editor, userCheck })} />
            <CheckConfFields label="模型输出检测" value={editor.robotCheck} onChange={robotCheck => setEditor({ ...editor, robotCheck })} />
            <p className="field-hint wide">业务 DAG 含分级审核（多模态抽取 + 安全模型 + 裁判）时，用户输入检测的整体超时要大于各节点超时之和，按模板配置应不少于 11000 ms。</p>
          </div>
        </Modal>
      )}
      {history && <VersionSheet {...history} onClose={() => setHistory(null)} />}
    </>
  );
}
