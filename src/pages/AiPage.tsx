// AI 交互：在线试运行当前在线业务的真实 DAG。
// test 前缀业务免签、浏览器直连 Runtime API；其他业务和异步结果拉取由管理服务代为签名（仅管理员）。
import { useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, Bot, LoaderCircle, Lock, RefreshCw, Zap } from 'lucide-react';
import { admin, runtime } from '../api';
import { useAuth } from '../auth';
import { AttachmentPicker } from '../components/AttachmentPicker';
import { ResultList } from '../components/ResultCard';
import { Field, Header, Pill, useMessage } from '../components/ui';
import { MAX_ATTACHMENTS, placeholderText, toRequestAttachments, type DraftAttachment } from '../lib/attachments';
import { useBusinesses, useFunctions } from '../queries';
import type { Attachment, DefenseInput, DefenseItem, ResponseMode } from '../types';

const CAPABILITIES: [string, string, string][] = [
  ['内容审核分类', 'single_label_pred', 'BERT 或 FastText 对输入、模型输出进行风险分类。'],
  ['提示词注入检测', 'single_label_pred', '检测越权指令和提示注入，当前在线模型名通常以 bert_prompt_injection 开头。'],
  ['语义意图检测', 'intent_check', '将文本 embedding 与恶意意图原型做余弦相似度判断。'],
  ['知识检索与红线代答', 'kb_search / rag_answer', 'BGE 向量检索 Vearch；命中时返回预置安全回答（红线代答）。'],
  ['多轮对话检测', 'multi_turn_detect', '整理会话历史后调用外部 LLM 判断多轮风险。'],
  ['DT-Guard 三档审核', 'dtguard_check', '渐进决策 Intent → Category → Safety；Borderline(9000) 驱动智能纠偏而非硬拦截。'],
  ['策略护栏', 'policy_guard', '安全规则随配置下发（conf.policyText），由模型逐条核对；低置信自动转纠偏，改规则免重训。'],
  ['安全模型门控', 'guard_check', '分级审核第一层：全量检测文本和图片，置信度来自标签 token 概率，低置信样本升级给裁判。'],
  ['裁判大模型', 'llm_judge', '分级审核第二层：只看第一层拿不准的样本，输出 safe / unsafe / borderline 和判定理由。'],
  ['多模态内容抽取', 'media_extract', '图片 OCR、音频 ASR、视频抽帧后，把文字交给后续文本检测节点复用。'],
  ['图片真实性检测', 'mllm_check', '调用多模态大模型分析图片是否 AI 生成/伪造；uncertain 自动转人工复核（智能纠偏）。'],
];

function isTest(accessKey: string) {
  return accessKey.startsWith('test');
}

export default function AiPage() {
  const { credentials, canWrite, username } = useAuth();
  const businesses = useBusinesses();
  const functions = useFunctions();
  const msg = useMessage();
  const list = businesses.data || [];
  const [selectedKey, setSelectedKey] = useState('');
  const selected = list.find(item => item.name === selectedKey) || list[0];
  const [content, setContent] = useState('你好，请用一句话介绍一下你自己。');
  const [mediaUrl, setMediaUrl] = useState('');
  const [responseMode, setResponseMode] = useState<ResponseMode>('sync');
  const [fromRole, setFromRole] = useState<'user' | 'robot'>('user');
  const [sessionId, setSessionId] = useState('console-session');
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [result, setResult] = useState<DefenseItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const registeredTypes = useMemo(() => new Set((functions.data || []).map(item => item.type)), [functions.data]);
  const isRegistered = (type: string) => type.split(' / ').some(item => registeredTypes.has(item));
  const canRun = !!selected && (canWrite || isTest(selected.name));
  const scopeHint = selected && isTest(selected.name)
    ? 'test 开头的业务免签名，由浏览器直接调用 Runtime API；仅限测试环境。'
    : '非 test 业务由管理服务代为签名，浏览器不接触 Secret Key，只有管理员可以发起。';

  const requestAttachments: Attachment[] = toRequestAttachments(attachments);
  const media = mediaUrl.trim();
  const canSubmit = canRun && (content.trim() !== '' || requestAttachments.length > 0) && !busy;

  const buildInput = (): DefenseInput => {
    const items = requestAttachments;
    const text = content.trim() || (items.length ? placeholderText(items) : '');
    const input: DefenseInput = {
      content: text,
      contentType: items.length ? items[0].type : 'text',
      responseMode,
      messageInfo: { fromId: `console-${username || 'user'}`, fromRole, sessionId: sessionId.trim() || 'console-session' },
    };
    if (selected?.type) input.businessType = selected.type;
    if (items.length) input.attachments = items;
    if (media) input.mediaUrl = media;
    return input;
  };

  const run = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!selected || !canSubmit) return;
    setBusy('run'); msg.clear();
    try {
      const input = buildInput();
      const data = isTest(selected.name)
        ? await runtime.defenseUnsigned(credentials, selected.name, { ...input, accessKey: selected.name, requestId: `console-${Date.now()}` })
        : await admin.defenseTest(credentials, selected.name, input);
      setResult(data || []);
    } catch (e) {
      setResult(null); msg.fail(e);
    } finally { setBusy(null); }
  };

  const fetchResult = async () => {
    if (!selected) return;
    setBusy('fetch'); msg.clear();
    try {
      setResult(await admin.defenseTestResult(credentials, selected.name, { sessionId: sessionId.trim() || 'console-session', type: 'all' }) || []);
    } catch (e) {
      msg.fail(e);
    } finally { setBusy(null); }
  };

  return (
    <>
      <Header title="AI 交互" desc="在线试运行当前在线业务的真实 DAG，查看处置方式、风险码和分级审核详情。" />
      <section className="panel test-panel">
        <div className="panel-title"><div><h2>在线检测</h2><p>支持 sync 和 free_taxi 两种响应模式；可附加图片、音频、视频（最多 {MAX_ATTACHMENTS} 个）。</p></div><Zap /></div>
        <form onSubmit={run}>
          <div className="test-controls">
            <label>业务<select value={selected?.name || ''} onChange={e => setSelectedKey(e.target.value)}>{list.map(item => <option key={item.name} value={item.name}>{item.name} · {item.type}</option>)}</select></label>
            <label>检测方向<select value={fromRole} onChange={e => setFromRole(e.target.value as 'user' | 'robot')}><option value="user">用户输入</option><option value="robot">模型输出</option></select></label>
            <label>响应模式<select value={responseMode} onChange={e => setResponseMode(e.target.value as ResponseMode)}><option value="sync">sync（同步）</option><option value="free_taxi">free_taxi（异步取已有结果）</option></select></label>
            <label>Session ID<input value={sessionId} onChange={e => setSessionId(e.target.value)} required /></label>
          </div>
          <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="输入待检测文本" />
          <div className="test-controls">
            <Field label="媒体地址（可选，图片真实性检测 mllm_check 读取）" wide>
              <input value={mediaUrl} onChange={e => setMediaUrl(e.target.value)} placeholder="http/https 图片地址；也可以直接上传附件" />
            </Field>
          </div>
          <AttachmentPicker items={attachments} onChange={setAttachments} />
          <p className="field-hint">{scopeHint}</p>
          {!canRun && selected && <p className="warn-text"><Lock />当前账号是只读访客：只能试运行 test 开头的业务，其他业务需要管理员权限。</p>}
          <div className="button-row">
            <button className="btn primary" disabled={!canSubmit}>{busy === 'run' ? <LoaderCircle className="spin" /> : <Zap />}{busy === 'run' ? '检测中' : '运行检测'}</button>
            <button type="button" className="btn" disabled={!selected || !canWrite || busy !== null || responseMode !== 'free_taxi'} title={canWrite ? '需要先以 free_taxi 模式提交，再按 sessionId 拉取结果' : '拉取异步结果需要管理员权限'} onClick={fetchResult}>
              {busy === 'fetch' ? <LoaderCircle className="spin" /> : <RefreshCw />}拉取异步结果
            </button>
          </div>
        </form>
        {msg.view}
        {result && <ResultList items={result} />}
        {result && (
          <details className="raw-block"><summary>原始 JSON</summary><pre className="result-block">{JSON.stringify(result, null, 2)}</pre></details>
        )}
      </section>
      <section className="panel ai-flow">
        <h2>请求链路</h2>
        <div><span>业务应用</span><Zap /><span>安全 API</span><Zap /><span>DAG 编排</span><Zap /><span>规则 / 模型能力</span><Zap /><span>处置结论</span></div>
        {!isTest(selected?.name || '') && <small><Lock />代签请求：浏览器 → 管理服务（签名）→ 安全 API，Secret Key 不出服务端。</small>}
      </section>
      <section className="cards">
        {CAPABILITIES.map(([title, type, desc]) => {
          const found = isRegistered(type);
          return <article className="panel" key={title}><Bot /><h3>{title}</h3><code>{type}</code><p>{desc}</p><Pill ok={found}>{found ? '已注册' : '未发现在线配置'}</Pill></article>;
        })}
      </section>
      <div className="notice panel"><AlertTriangle /><div><p>裁判理由、第一层原始输出等只用于内部排查，不要展示给终端用户。附件只随本次请求发送，控制台不保存文件。</p></div></div>
    </>
  );
}
