import { useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { admin } from '../api';
import { useAuth } from '../auth';
import { DataTable, Field, Header, Modal, Pill, State, VIEWER_HINT, useMessage, type Column } from '../components/ui';
import { sha256Hex } from '../lib/format';
import { useInvalidateConfig, useUsers } from '../queries';
import type { ConsoleUser, Role } from '../types';

interface UserDraft {
  isNew: boolean;
  id?: number;
  username: string;
  displayName: string;
  role: Role;
  status: 'active' | 'disabled';
  password: string;
}

export default function UsersPage() {
  const { credentials, canWrite } = useAuth();
  const users = useUsers();
  const invalidate = useInvalidateConfig();
  const msg = useMessage();
  const [editor, setEditor] = useState<UserDraft | null>(null);
  const [passwordEditor, setPasswordEditor] = useState<{ id: number; username: string; password: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!editor) return;
    setBusy(true); msg.clear();
    try {
      const body: Record<string, unknown> = { username: editor.username, displayName: editor.displayName, role: editor.role, status: editor.status };
      if (editor.isNew) {
        body.passwordHash = await sha256Hex(editor.password);
        await admin.userCreate(credentials, body);
      } else {
        await admin.userUpdate(credentials, editor.id!, body);
      }
      setEditor(null); msg.info('用户信息已保存'); invalidate();
    } catch (e) { msg.fail(e); } finally { setBusy(false); }
  };
  const changePassword = async () => {
    if (!passwordEditor) return;
    setBusy(true); msg.clear();
    try {
      await admin.userPassword(credentials, passwordEditor.id, await sha256Hex(passwordEditor.password));
      setPasswordEditor(null); msg.info('密码已更新');
    } catch (e) { msg.fail(e); } finally { setBusy(false); }
  };
  const edit = (row: ConsoleUser) => setEditor({ isNew: false, id: row.id, username: row.username, displayName: row.displayName || '', role: row.role, status: row.status, password: '' });

  const columns: Column<ConsoleUser>[] = [
    { key: 'username', title: '用户名' },
    { key: 'displayName', title: '显示名称' },
    { key: 'role', title: '角色', render: r => <Pill ok={r.role === 'admin'}>{r.role === 'admin' ? '管理员' : '只读访客'}</Pill> },
    { key: 'status', title: '状态', render: r => <Pill ok={r.status === 'active'}>{r.status === 'active' ? '启用' : '停用'}</Pill> },
    { key: 'lastLoginTime', title: '最近登录', render: r => r.lastLoginTime || '-' },
    { key: 'action', title: '操作', render: r => <div className="row-actions">
      <button className="link" disabled={!canWrite} title={canWrite ? undefined : VIEWER_HINT} onClick={() => edit(r)}>编辑</button>
      <button className="link" disabled={!canWrite} title={canWrite ? undefined : VIEWER_HINT} onClick={() => setPasswordEditor({ id: r.id, username: r.username, password: '' })}>改密</button>
    </div> },
  ];
  return (
    <>
      <Header title="用户管理" desc="管理控制台账号、角色和启用状态。密码只以 SHA-256 摘要提交。"
        action={<div className="heading-actions">
          <button className="btn" onClick={() => users.refetch()}><RefreshCw />刷新</button>
          <button className="btn primary" disabled={!canWrite} onClick={() => setEditor({ isNew: true, username: '', displayName: '', role: 'viewer', status: 'active', password: '' })}><Plus />新增用户</button>
        </div>} />
      {msg.view}
      <section className="panel"><State loading={users.isLoading} error={users.error} empty={!users.data?.length}><DataTable columns={columns} rows={users.data || []} rowKey={r => r.id} /></State></section>
      {editor && (
        <Modal title={editor.isNew ? '新增用户' : `编辑 ${editor.username}`} onClose={() => setEditor(null)} onSubmit={save} busy={busy} submitLabel={editor.isNew ? '创建用户' : '保存'}>
          <div className="form-grid">
            <Field label="用户名"><input required disabled={!editor.isNew} value={editor.username} onChange={e => setEditor({ ...editor, username: e.target.value })} /></Field>
            <Field label="显示名称"><input required value={editor.displayName} onChange={e => setEditor({ ...editor, displayName: e.target.value })} /></Field>
            <Field label="角色"><select value={editor.role} onChange={e => setEditor({ ...editor, role: e.target.value as Role })}><option value="admin">管理员</option><option value="viewer">只读访客</option></select></Field>
            <Field label="状态"><select value={editor.status} onChange={e => setEditor({ ...editor, status: e.target.value as UserDraft['status'] })}><option value="active">启用</option><option value="disabled">停用</option></select></Field>
            {editor.isNew && <Field label="初始密码"><input type="password" minLength={8} required value={editor.password} onChange={e => setEditor({ ...editor, password: e.target.value })} /></Field>}
          </div>
        </Modal>
      )}
      {passwordEditor && (
        <Modal title={`修改 ${passwordEditor.username} 的密码`} onClose={() => setPasswordEditor(null)} onSubmit={changePassword} busy={busy} submitLabel="更新密码">
          <Field label="新密码"><input type="password" minLength={8} required autoFocus value={passwordEditor.password} onChange={e => setPasswordEditor({ ...passwordEditor, password: e.target.value })} /></Field>
        </Modal>
      )}
    </>
  );
}
