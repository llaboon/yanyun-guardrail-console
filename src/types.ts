// 控制台与 safety-admin / safety-api 交互的数据结构。字段名与后端 JSON 保持一致。

export type Role = 'admin' | 'viewer';
export type HandleStrategy = 'PASS' | 'INTERCEPT' | 'REPLACE' | 'REDIRECT';
export type ResponseMode = 'sync' | 'free_taxi';
export type AttachmentType = 'picture' | 'audio' | 'video';
export type JsonObject = Record<string, unknown>;

export interface Credentials {
  username: string;
  password: string;
  role?: Role;
}

export interface CheckConf {
  unit: string;
  checkNum: number;
  timeoutMilliseconds: number;
}

export interface Business {
  id: number;
  name: string;
  group: string;
  desc: string;
  type: string;
  qpsLimit: number;
  version: number;
  status: string;
  accessTargetsArray?: string[];
  robotCheckConfObj?: CheckConf;
  userCheckConfObj?: CheckConf;
  createTime?: string;
  updateTime?: string;
}

export interface SafetyFunction {
  id: number;
  name: string;
  group: string;
  type: string;
  desc: string;
  timeoutMilliseconds: number;
  version: number;
  status: string;
  confObj?: JsonObject;
}

export interface FunctionConf {
  ref?: string;
  type?: string;
  name?: string;
  timeoutMilliseconds?: number;
  conf?: JsonObject;
}

export interface RouterConf {
  type: string;
  name?: string;
  conf?: { nodeId?: string; script?: string; [key: string]: unknown };
}

export interface DagNode {
  nodeId: string;
  functionConf?: FunctionConf;
  routerConf?: RouterConf;
  ignoreError?: boolean;
  reduceScriptRaw?: string;
}

export interface DagStrategy {
  id: number;
  businessName: string;
  group: string;
  rootId: string;
  version: number;
  status: string;
  desc?: string;
  confArray: DagNode[];
}

export interface VersionRecord {
  id: number;
  version: number;
  status: string;
  updateTime?: string;
  createTime?: string;
}

export interface ConsoleUser {
  id: number;
  username: string;
  displayName?: string;
  role: Role;
  status: 'active' | 'disabled';
  lastLoginTime?: string;
}

export interface SensitiveWord {
  id?: number;
  word: string;
  businessScene: string;
  firstClassName: string;
  firstClassNo: number | string;
  secondClassName: string;
  secondClassNo: number | string;
  tags?: string;
  matchType: string;
  handleStrategy: string;
  source: string;
  desc?: string;
  version?: number;
  status?: string;
}

export interface RedlineKnowledge {
  id?: number;
  question: string;
  answer: string;
  businessScene: string;
  className: string;
  classNo: number | string;
  source: string;
  type?: string;
  metadata?: string;
  desc?: string;
  status?: string;
}

export interface DictEntry {
  id: number;
  key: string;
  desc?: string;
  version: number;
  status: string;
  value?: string;
  valueObj?: unknown;
}

export interface RiskEvent {
  id: number;
  createTime: string;
  businessName: string;
  sessionId?: string;
  fromRole?: string;
  riskCheckType: string;
  riskCheckName: string;
  riskCode: number;
  riskMessage?: string;
  handleStrategy?: string;
  contentSnippet?: string;
  cost?: number;
  ext?: string | null;
}

export interface RiskEventPage {
  total: number;
  page: number;
  pageSize: number;
  list: RiskEvent[];
}

export interface Stat {
  dimension: string;
  count: number;
}

export interface RiskEventFilter {
  startTime: string;
  endTime: string;
  businessName?: string;
  riskCheckType?: string;
  handleStrategy?: string;
}

export interface Attachment {
  type: AttachmentType;
  mime?: string;
  url?: string;
  data?: string;
}

export interface MessageInfo {
  fromId: string;
  fromRole: 'user' | 'robot';
  sessionId: string;
  messageId?: number;
}

/** 控制台提交给检测接口的内容；签名字段由服务端代理生成，不在这里出现。 */
export interface DefenseInput {
  content: string;
  contentType: 'text' | AttachmentType;
  businessType?: string;
  responseMode: ResponseMode;
  mediaUrl?: string;
  attachments?: Attachment[];
  messageInfo: MessageInfo;
}

export interface GuardResult {
  decidedBy?: string;
  safety?: string;
  modelCategories?: string[];
  category?: string;
  confidence?: number | null;
  escalateThreshold?: number | null;
  escalate?: boolean;
  safetyProbabilities?: Record<string, number> | null;
  outputFormat?: string;
  model?: string;
  imageCount?: number;
  rawOutput?: string;
  cost?: number;
  riskCode?: number;
  riskMessage?: string;
}

export interface JudgeResult extends GuardResult {
  reason?: string;
  judgeError?: string | null;
  upstream?: GuardResult | null;
}

export interface DefenseItem {
  requests?: { fromRole?: string; content?: string; messageId?: number }[];
  checkedContent?: string;
  riskCode?: number;
  riskMessage?: string;
  riskCheckType?: string;
  riskCheckName?: string;
  riskCheckResult?: (JudgeResult & JsonObject) | null;
  handleStrategy?: HandleStrategy | string;
}

export interface MonitorEvent {
  id: number;
  timestamp: number;
  accessKey: string;
  mode: string;
  content?: string;
  success: boolean;
  risky: boolean;
  code: number;
  riskCode?: number;
  riskMessage?: string;
  handleStrategy?: string;
  cost: number;
}

export interface MonitorSnapshot {
  total: number;
  success: number;
  failed: number;
  risky: number;
  averageCost: number;
  updatedAt: number;
  businessCounts?: Record<string, number>;
  riskCounts?: Record<string, number>;
  events: MonitorEvent[];
}

export interface TraceRow {
  id: string;
  timestamp?: string;
  name?: string;
  sessionId?: string;
  userId?: string;
  latency?: number;
}

export interface TracePage {
  data: TraceRow[];
  meta?: { page?: number; limit?: number; totalItems?: number; totalPages?: number };
}

export interface ModelHealth {
  models?: Record<string, { available?: boolean; source?: string }>;
}

export interface ModelCheckResult {
  model: string;
  decision: string;
  score?: number;
  scores?: { unsafe?: number; benign?: number };
  action?: string;
  trace?: string[];
  metadata?: JsonObject & { source?: string; latency_ms?: number };
}
