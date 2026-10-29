const CHARS_PER_SEC = 46;

export class DialogueSystem {
  constructor(state) {
    this.state = state;
    this.root = document.getElementById('dialogue');
    this.whoEl = this.root.querySelector('.dwho');
    this.textEl = this.root.querySelector('.dtext');
    this.choicesEl = this.root.querySelector('.dchoices');
    this.hintEl = this.root.querySelector('.dhint');

    this.timerEl = this.root.querySelector('.dtimer');
    this.timerFill = this.timerEl ? this.timerEl.querySelector('i') : null;
    this.timerNum = this.timerEl ? this.timerEl.querySelector('b') : null;

    this.active = false;
    this.queue = [];
    this.line = null;
    this.shown = 0;
    this.typing = false;
    this.pendingChoices = null;
    this.onClose = null;
    this.def = null;
    this.transcript = '';

    /** 限时选择：只有 def.timeLimit 存在时才启动 */
    this.timeLimit = 0;
    this.timeLeft = 0;
    this.timed = false;
    /** 玩家是否因为超时被系统代选 */
    this.timedOut = false;
  }

  start(def, onClose = null) {
    if (!def) return;
    this.def = def;
    this.onClose = onClose;
    this.active = true;
    this.transcript = '';
    this.timed = false;
    this.timedOut = false;
    this.timeLimit = 0;
    this.timeLeft = 0;
    this.queue = (def.lines || []).slice();
    this.pendingChoices = def.choices ? def.choices.slice() : null;
    if (def.set) def.set.forEach(f => { this.state.flags[f] = true; });
    if (def.fx) this.state.onFx?.(def.fx, 'dialogue:' + (def.id || ''));

    // 章节前进：只增不减，读档回退时由外部直接写 state.chapter
    if (def.chapter) {
      this.state.chapter = Math.max(this.state.chapter || 1, def.chapter);
    }

    this.root.classList.remove('hidden');
    this.choicesEl.innerHTML = '';
    this.hintEl.style.visibility = 'hidden';
    this.hideTimer();
    this.nextLine();
  }

  /* ---------------- 限时选择（docs/mechanics.md 失败机制） ---------------- */

  hideTimer() {
    if (this.timerEl) this.timerEl.classList.add('hidden');
    this.root.classList.remove('timed');
  }

  beginTimer() {
    if (!this.def || !this.def.timeLimit) return;
    this.timeLimit = this.def.timeLimit;
    this.timeLeft = this.def.timeLimit;
    this.timed = true;
    this.root.classList.add('timed');
    if (this.timerEl) this.timerEl.classList.remove('hidden');
    this.paintTimer();
  }

  paintTimer() {
    if (!this.timerEl) return;
    const frac = this.timeLimit > 0 ? Math.max(0, this.timeLeft / this.timeLimit) : 0;
    if (this.timerFill) this.timerFill.style.width = (frac * 100).toFixed(1) + '%';
    if (this.timerNum) this.timerNum.textContent = Math.ceil(this.timeLeft) + 's';
    this.timerEl.classList.toggle('low', frac < 0.34);
  }

  /** 时间到：由系统代选（通常是「不选」本身也有后果的那一项） */
  expire() {
    if (!this.pendingChoices) return;
    const idx = typeof this.def?.timeoutChoice === 'number' ? this.def.timeoutChoice : 0;
    this.timedOut = true;
    this.state.flags.timed_out = true;
    this.choose(idx, { timedOut: true });
  }

  nextLine() {
    if (this.queue.length === 0) {
      this.afterLines();
      return;
    }
    const l = this.queue.shift();
    if (l.set) l.set.forEach(f => { this.state.flags[f] = true; });
    // 章节可以在对话内部推进（一幕里往往只有几个节点，但章是连续的）
    if (l.chapter) this.state.chapter = Math.max(this.state.chapter || 1, l.chapter);
    // 台词也可以带数值效果：一次精神打击、一次被触碰，都写在数据里
    if (l.fx) this.state.onFx?.(l.fx, 'line');
    // 演出效果（心跳停止、透明化…）同样由数据触发，不写死在流程里
    if (l.effect) this.state.onEffect?.(l.effect, l);

    this.line = l;
    this.shown = 0;
    this.typing = true;
    this.transcript += (l.who ? l.who + '：' : '') + l.text + '\n';

    const who = l.who || '';
    this.whoEl.textContent = who;
    this.whoEl.className = 'dwho' + (who === '崔斯坦' ? ' cold' : (who ? '' : ' none'));
    this.textEl.style.fontStyle = l.italic ? 'italic' : 'normal';
    this.textEl.style.color = l.italic ? '#8b8175' : '';
    this.textEl.textContent = '';
    this.hintEl.style.visibility = 'visible';
  }

  afterLines() {
    if (this.pendingChoices && this.pendingChoices.length) {
      if (this.choicesEl.children.length === 0) this.showChoices();
      return;
    }
    this.close();
  }

  showChoices() {
    this.typing = false;
    this.choicesEl.innerHTML = '';
    this.hintEl.style.visibility = 'hidden';

    this.pendingChoices.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'dchoice';
      b.innerHTML = `<span class="n">${i + 1}</span><span>${c.text}</span>`;
      b.addEventListener('click', () => this.choose(i));
      this.choicesEl.appendChild(b);
    });

    this.beginTimer();
  }

  choose(i, opts = {}) {
    if (!this.pendingChoices || !this.pendingChoices[i]) return;
    const c = this.pendingChoices[i];
    this.pendingChoices = null;
    this.choicesEl.innerHTML = '';
    this.timed = false;
    this.hideTimer();
    if (c.set) c.set.forEach(f => { this.state.flags[f] = true; });
    if (c.fx) this.state.onFx?.(c.fx, 'choice');
    if (c.action) this.state.pendingActions.push(c.action);
    if (opts.timedOut && c.timeoutSet) c.timeoutSet.forEach(f => { this.state.flags[f] = true; });

    if (c.reply && c.reply.length) {
      this.queue = c.reply.slice();
      this.nextLine();
    } else {
      this.close();
    }
  }

  advance() {
    if (!this.active) return;
    if (this.typing) {
      this.typing = false;
      this.textEl.textContent = this.line.text;
      return;
    }
    if (this.queue.length > 0) {
      this.nextLine();
      return;
    }
    this.afterLines();
  }

  update(dt) {
    if (!this.active) return;

    // 限时选择：只有选项已经摆出来才计时
    if (this.timed && this.pendingChoices && this.choicesEl.children.length > 0) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.paintTimer();
        this.expire();
        return;
      }
      this.paintTimer();
    }

    if (!this.typing || !this.line) return;
    this.shown += dt * CHARS_PER_SEC;
    const t = this.line.text;
    if (this.shown >= t.length) {
      this.textEl.textContent = t;
      this.typing = false;
    } else {
      this.textEl.textContent = t.slice(0, Math.floor(this.shown));
    }
  }

  close() {
    this.active = false;
    this.line = null;
    this.typing = false;
    this.pendingChoices = null;
    this.timed = false;
    this.hideTimer();
    this.root.classList.add('hidden');
    const cb = this.onClose;
    this.onClose = null;
    if (cb) cb();
  }
}
