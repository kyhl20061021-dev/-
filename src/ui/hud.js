import { cn } from './pov.js';

export class HUD {
  constructor() {
    this.routeTag = document.getElementById('routeTag');
    this.modeTag = document.getElementById('modeTag');
    this.questList = document.getElementById('questList');
    this.prompt = document.getElementById('prompt');
    this.promptText = document.getElementById('promptText');
    this.toastEl = document.getElementById('toast');
    this.lockHint = document.getElementById('lockHint');
    this.crosshair = document.getElementById('crosshair');
    this.statPanel = document.getElementById('statPanel');
    this.objectives = [];
    this.toastTimer = null;
  }

  setRoute(label, chapter) {
    this.routeTag.textContent = chapter ? `${label} · 第${cn(chapter)}章` : label;
  }

  setObjectives(objectives) {
    this.objectives = objectives || [];
  }

  renderQuests(state) {
    const items = [];
    for (const o of this.objectives) {
      const done = o.done(state);
      items.push({ text: o.text, done });
      if (!done) break;
    }
    this.questList.innerHTML = '';
    for (const it of items) {
      const li = document.createElement('li');
      li.textContent = it.text;
      li.className = it.done ? 'done' : 'current';
      this.questList.appendChild(li);
    }
  }

  showPrompt(text) {
    this.promptText.textContent = text;
    this.prompt.classList.remove('hidden');
  }

  hidePrompt() {
    this.prompt.classList.add('hidden');
  }

  toast(text, ms = 2800) {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.add('hidden'), ms);
  }

  setMode(mode) {
    this.modeTag.textContent = mode === 'first' ? '第一人称' : '第三人称';
    this.crosshair.classList.toggle('hidden', mode !== 'first');
  }

  setLocked(locked) {
    this.lockHint.classList.toggle('hide', locked);
  }

  /* ---------------- 状态数值 ---------------- */

  /** 迪伦只显示完整度，崔斯坦只显示报废度，两人都显示信任 */
  setStatsRole(role) {
    if (!this.statPanel) return;
    this.statPanel.classList.remove('hidden');
    const show = (key, on) => {
      const row = this.statPanel.querySelector(`[data-stat="${key}"]`);
      if (row) row.style.display = on ? '' : 'none';
    };
    show('integrity', role === 'dylan');
    show('anomaly', role === 'tristan');
    show('trust', true);
  }

  hideStats() {
    if (this.statPanel) this.statPanel.classList.add('hidden');
  }

  /** 改一行状态的显示名。迪伦在知道真相前不能看到「灵魂」二字 */
  setStatLabel(key, text) {
    if (!this.statPanel) return;
    const row = this.statPanel.querySelector(`[data-stat="${key}"] .sname`);
    if (row && row.textContent !== text) row.textContent = text;
  }

  /** @param {{integrity:number, trust:number, anomaly:number}} v */
  updateStats(v) {
    if (!this.statPanel || !v) return;
    const put = (key, val) => {
      const row = this.statPanel.querySelector(`[data-stat="${key}"]`);
      if (!row) return;
      const pct = Math.max(0, Math.min(100, val));
      row.querySelector('.sbar i').style.width = pct + '%';
      row.querySelector('.sval').textContent = Math.round(val);
    };
    put('integrity', v.integrity);
    put('anomaly', v.anomaly);
    put('trust', v.trust);
    this.statPanel.classList.toggle('critical', v.integrity <= 30);
  }
}
