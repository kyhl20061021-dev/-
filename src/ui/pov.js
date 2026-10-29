/**
 * 「此章另一视角」回看面板。
 *
 * 规则（作者 2026-10-29 表格）：
 *   - 第 8 章读完后才出现入口
 *   - 只显示「你没选的那个视角」
 *   - 可选回看，不强制、不自动跳转
 *   - 只补内心片段，不改写任何事实（补写量 ≤10%）
 *
 * 因此这个面板永远是玩家主动打开的，且打开后不会推进任何剧情。
 */
export class PovPanel {
  constructor() {
    this.root = document.getElementById('povPanel');
    this.listEl = document.getElementById('povList');
    this.readEl = document.getElementById('povRead');
    this.subEl = document.getElementById('povSub');
    this.entries = [];
    this.current = -1;
    this.open = false;
    if (!this.root) return;

    document.getElementById('povClose').addEventListener('click', () => this.hide());
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.hide();
    });
  }

  /** @param {{name:string, entries:Array}} data */
  mount(data) {
    if (!this.root) return;
    this.entries = (data && data.entries) || [];
    this.subEl.textContent = data ? `你选的是另一条路。这里是 ${data.name} 的内心片段。` : '';
    this.listEl.innerHTML = '';
    this.entries.forEach((e, i) => {
      const li = document.createElement('button');
      li.className = 'pov-item';
      li.innerHTML = `<span class="pov-n">${cn(e.n)}</span><span class="pov-t">${e.title}</span>`;
      li.addEventListener('click', () => this.select(i));
      this.listEl.appendChild(li);
    });
    this.current = -1;
    this.readEl.innerHTML = '<div class="pov-empty">选一章，看看他那时的心里。</div>';
  }

  select(i) {
    const e = this.entries[i];
    if (!e) return;
    this.current = i;
    [...this.listEl.children].forEach((b, k) => b.classList.toggle('on', k === i));
    this.readEl.innerHTML = '';
    const h = document.createElement('div');
    h.className = 'pov-rh';
    h.textContent = `第 ${cn(e.n)} 章 · ${e.title}`;
    this.readEl.appendChild(h);
    for (const l of e.lines || []) {
      const p = document.createElement('p');
      p.className = 'pov-line' + (l.italic ? ' italic' : '');
      p.textContent = l.text;
      this.readEl.appendChild(p);
    }
  }

  show() {
    if (!this.root || !this.entries.length) return;
    this.open = true;
    this.root.classList.remove('hidden');
    if (this.current < 0) this.select(0);
  }

  hide() {
    if (!this.root) return;
    this.open = false;
    this.root.classList.add('hidden');
  }

  toggle() {
    if (this.open) this.hide();
    else this.show();
  }
}

const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
export function cn(n) {
  if (n <= 10) return CN[n] || String(n);
  if (n < 20) return '十' + CN[n - 10];
  const t = Math.floor(n / 10), o = n % 10;
  return CN[t] + '十' + (o ? CN[o] : '');
}
