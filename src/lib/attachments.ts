// AI 交互页的多模态附件：文件转 base64 放进请求的 attachments，限制与 safety-api 的 GlobalConf 一致。
import type { Attachment, AttachmentType } from '../types';

export const MAX_ATTACHMENTS = 4;
/** safety-api 限制单个附件 base64 长度不超过 10MB，原文件约 7.5MB。 */
export const MAX_DATA_LENGTH = 10 * 1024 * 1024;
export const MAX_FILE_BYTES = Math.floor((MAX_DATA_LENGTH / 4) * 3);
export const MAX_URL_LENGTH = 2048;

export const ATTACHMENT_LABELS: Record<AttachmentType, string> = { picture: '图片', audio: '音频', video: '视频' };

export interface DraftAttachment extends Attachment {
  id: string;
  name: string;
  size?: number;
  /** 仅用于界面预览的 object URL，不会发送 */
  previewUrl?: string;
}

export function typeFromMime(mime: string): AttachmentType | null {
  if (mime.startsWith('image/')) return 'picture';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return null;
}

export const fmtBytes = (bytes?: number) => {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export function readFileAsBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}

let seq = 0;
const nextId = () => `att-${Date.now()}-${seq++}`;

export async function fileToAttachment(file: File): Promise<DraftAttachment> {
  const type = typeFromMime(file.type);
  if (!type) throw new Error(`不支持的文件类型：${file.name}（只支持图片、音频、视频）`);
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} 超过 ${fmtBytes(MAX_FILE_BYTES)}，请压缩后再上传`);
  const data = await readFileAsBase64(file);
  if (data.length > MAX_DATA_LENGTH) throw new Error(`${file.name} 编码后超过 10MB`);
  return {
    id: nextId(), name: file.name, size: file.size, type, mime: file.type, data,
    previewUrl: type === 'picture' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : undefined,
  };
}

export function urlAttachment(type: AttachmentType, url: string): DraftAttachment {
  const value = url.trim();
  if (!/^https?:\/\//i.test(value)) throw new Error('附件 URL 只支持 http/https');
  if (value.length > MAX_URL_LENGTH) throw new Error('附件 URL 过长');
  return { id: nextId(), name: value, type, url: value };
}

/** 去掉界面字段，得到请求体里的 attachments（url 与 data 只保留一个）。 */
export function toRequestAttachments(items: DraftAttachment[]): Attachment[] {
  return items.map(({ type, mime, url, data }) => (data ? { type, mime, data } : { type, mime, url }));
}

/** safety-api 对空 content 直接放行，只有附件时用占位文字送检（与安全网关一致）。 */
export function placeholderText(items: Attachment[]): string {
  const kinds = [...new Set(items.map(item => ATTACHMENT_LABELS[item.type]))];
  return kinds.map(kind => `[${kind}]`).join(' ') || '[附件]';
}
