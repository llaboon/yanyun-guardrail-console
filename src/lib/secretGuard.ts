// 能力配置会在控制台展示并进入版本历史，密钥只能放在服务器环境变量里（conf.apiKeyEnv 填变量名）。
export const SECRET_HINT = '密钥请配置在服务器环境变量（apiKeyEnv）中，这里只填环境变量名';

const SECRET_KEYS = new Set(['apikey', 'key', 'token', 'secret', 'secretkey', 'accesstoken', 'accesskeysecret', 'password', 'passwd', 'authorization', 'bearer', 'privatekey']);
const SECRET_SUFFIXES = ['apikey', 'token', 'secret', 'password', 'privatekey'];
const SECRET_VALUE = /^(sk-|hf_|ts-|ghp_|xox[abp]-|bearer\s)/i;
const URL_SECRET_PARAM = /[?&](api[_-]?key|access[_-]?token|token|secret|key)=[^&\s]+/i;

const normalize = (key: string) => key.toLowerCase().replace(/[_-]/g, '');

function isSecretKeyName(key: string): boolean {
  // apiKeyEnv / tokenEnv 这类字段存的是环境变量名，允许
  if (/env$/i.test(key)) return false;
  const name = normalize(key);
  return SECRET_KEYS.has(name) || SECRET_SUFFIXES.some(suffix => name.endsWith(suffix));
}

/** 返回疑似密钥的字段路径，空数组表示通过。 */
export function findSecrets(value: unknown, path = 'conf'): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => findSecrets(item, `${path}[${index}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
      const childPath = `${path}.${key}`;
      const hasValue = child !== null && child !== undefined && child !== '';
      if (isSecretKeyName(key) && hasValue) return [childPath];
      return findSecrets(child, childPath);
    });
  }
  if (typeof value === 'string') {
    const text = value.trim();
    if (SECRET_VALUE.test(text) || URL_SECRET_PARAM.test(text)) return [path];
  }
  return [];
}
