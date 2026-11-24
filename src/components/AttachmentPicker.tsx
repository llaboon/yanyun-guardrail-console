// AI 交互页的附件区：上传图片 / 音频 / 视频（转 base64）或填写附件 URL，最多 4 个。
import { useRef, useState } from 'react';
import { FileAudio, FileVideo, Image as ImageIcon, Link, Paperclip, Plus, Trash2 } from 'lucide-react';
import type { AttachmentType } from '../types';
import {
  ATTACHMENT_LABELS, MAX_ATTACHMENTS, MAX_FILE_BYTES, fileToAttachment, fmtBytes, urlAttachment, type DraftAttachment,
} from '../lib/attachments';
import { errorMessage } from '../lib/format';

const ICONS = { picture: ImageIcon, audio: FileAudio, video: FileVideo };

export function AttachmentPicker({ items, onChange }: { items: DraftAttachment[]; onChange: (items: DraftAttachment[]) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [urlType, setUrlType] = useState<AttachmentType>('picture');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const room = MAX_ATTACHMENTS - items.length;

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError('');
    const picked = Array.from(files).slice(0, room);
    if (files.length > room) setError(`最多 ${MAX_ATTACHMENTS} 个附件，多出的文件已忽略`);
    setReading(true);
    try {
      const added: DraftAttachment[] = [];
      for (const file of picked) {
        try { added.push(await fileToAttachment(file)); } catch (e) { setError(errorMessage(e)); }
      }
      onChange([...items, ...added]);
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };
  const addUrl = () => {
    setError('');
    try { onChange([...items, urlAttachment(urlType, url)]); setUrl(''); } catch (e) { setError(errorMessage(e)); }
  };
  const remove = (id: string) => {
    const target = items.find(item => item.id === id);
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    onChange(items.filter(item => item.id !== id));
  };

  return (
    <div className="attachments">
      <div className="attach-head">
        <span><Paperclip />附件（{items.length}/{MAX_ATTACHMENTS}）</span>
        <small>图片、音频、视频，单个文件不超过 {fmtBytes(MAX_FILE_BYTES)}。需要业务 DAG 含多模态节点（media_extract / 安全模型 / 图片真实性）才会被检测。</small>
      </div>
      {items.length > 0 && (
        <ul className="attach-list">
          {items.map(item => {
            const Icon = ICONS[item.type];
            return (
              <li key={item.id}>
                {item.previewUrl ? <img src={item.previewUrl} alt="" /> : <span className="attach-icon"><Icon /></span>}
                <div><b title={item.name}>{item.name}</b><small>{ATTACHMENT_LABELS[item.type]} · {item.data ? `base64 · ${fmtBytes(item.size)}` : 'URL'}</small></div>
                <button type="button" className="icon-action danger" title="移除" onClick={() => remove(item.id)}><Trash2 /></button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="attach-actions">
        <input ref={inputRef} type="file" hidden multiple accept="image/*,audio/*,video/*" onChange={e => addFiles(e.target.files)} />
        <button type="button" className="btn" disabled={room <= 0 || reading} onClick={() => inputRef.current?.click()}><Plus />{reading ? '读取中' : '上传文件'}</button>
        <div className="attach-url">
          <select aria-label="附件类型" value={urlType} onChange={e => setUrlType(e.target.value as AttachmentType)}>
            {(Object.keys(ATTACHMENT_LABELS) as AttachmentType[]).map(type => <option key={type} value={type}>{ATTACHMENT_LABELS[type]}</option>)}
          </select>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="或填写附件 URL（http/https，由服务端拉取）" />
          <button type="button" className="btn" disabled={room <= 0 || !url.trim()} onClick={addUrl}><Link />添加</button>
        </div>
      </div>
      {error && <small className="field-error">{error}</small>}
    </div>
  );
}
