const PREFIX = 'ferryman3d:save:';

export function readSave(routeId) {
  try {
    const raw = localStorage.getItem(PREFIX + routeId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeSave(routeId, data) {
  try {
    localStorage.setItem(PREFIX + routeId, JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch {
    /* 忽略隐私模式下的写入失败 */
  }
}

export function clearSave(routeId) {
  try {
    localStorage.removeItem(PREFIX + routeId);
  } catch {
    /* noop */
  }
}

export function summarizeSave(routeId) {
  const s = readSave(routeId);
  if (!s) return '';
  const when = new Date(s.savedAt || Date.now());
  const hh = String(when.getHours()).padStart(2, '0');
  const mm = String(when.getMinutes()).padStart(2, '0');
  return `已有进度 · ${hh}:${mm}${s.phase >= 1 ? ' · 第一阶段' : ''}`;
}
