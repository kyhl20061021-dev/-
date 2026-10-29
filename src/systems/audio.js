let ctx = null;
let master = null;
let enabled = true;
let started = false;

function build() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();

  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  // 风：噪 → 低通 → 缓慢起伏
  const len = ctx.sampleRate * 3;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.018 * white) / 1.018;
    d[i] = last * 2.6;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  noise.loop = true;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 430;
  lp.Q.value = 0.6;

  const windGain = ctx.createGain();
  windGain.gain.value = 0.55;

  noise.connect(lp);
  lp.connect(windGain);
  windGain.connect(master);
  noise.start();

  // 阵风：让滤波频率缓慢摆动
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 190;
  lfo.connect(lfoGain);
  lfoGain.connect(lp.frequency);
  lfo.start();

  // 低频持续音：荒原的"底噪"
  const drone = ctx.createOscillator();
  drone.type = 'sine';
  drone.frequency.value = 48;
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.16;
  drone.connect(droneGain);
  droneGain.connect(master);
  drone.start();

  return true;
}

export function startAmbient() {
  if (started) {
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return;
  }
  if (!build()) return;
  started = true;
  if (ctx.state === 'suspended') ctx.resume();
  master.gain.linearRampToValueAtTime(enabled ? 0.16 : 0, ctx.currentTime + 2.5);
}

export function toggleAmbient() {
  enabled = !enabled;
  if (ctx && master) {
    master.gain.linearRampToValueAtTime(enabled ? 0.16 : 0, ctx.currentTime + 0.4);
  }
  return enabled;
}

export function isAmbientOn() {
  return enabled;
}

/* ------------------------------------------------------------------ */
/* 心跳                                                                */
/* 第 8 章之前，它是这段路上唯一「活着的证据」。                        */
/* 真相说出口的那一刻，它停 —— 而且不再回来。                           */
/* ------------------------------------------------------------------ */
let hbOn = false;
let hbGain = null;
let hbTimer = null;
let hbInterval = 1.05;
let hbDead = false;

function thump(t, peak) {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(64, t);
  o.frequency.exponentialRampToValueAtTime(36, t + 0.17);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.23);
  o.connect(g);
  g.connect(hbGain);
  o.start(t);
  o.stop(t + 0.3);
}

function beat() {
  if (!hbOn || hbDead || !ctx) return;
  const t = ctx.currentTime + 0.01;
  thump(t, 0.5);
  thump(t + 0.27, 0.32);   // 第二下略轻，才是心跳而不是鼓点
  hbTimer = setTimeout(beat, hbInterval * 1000);
}

export function startHeartbeat() {
  if (hbDead || hbOn) return;
  if (!ctx) startAmbient();
  if (!ctx) return;
  if (!hbGain) {
    hbGain = ctx.createGain();
    hbGain.gain.value = 0.9;
    hbGain.connect(master);
  }
  hbOn = true;
  beat();
}

/** 紧张度越高，跳得越快（0..1） */
export function setHeartRate(tension = 0) {
  hbInterval = 1.12 - 0.4 * Math.max(0, Math.min(1, tension));
}

export function stopHeartbeat() {
  hbOn = false;
  if (hbTimer) { clearTimeout(hbTimer); hbTimer = null; }
}

/**
 * 心跳停止：先停拍，再把环境音一起抽空 2.4 秒，然后只让风回来。
 * 抽空之后再回来的是风，不是心跳 —— 这个差别玩家听得出来。
 */
export function heartStop() {
  stopHeartbeat();
  hbDead = true;
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setValueAtTime(master.gain.value, t);
  master.gain.linearRampToValueAtTime(0.0001, t + 0.22);
  master.gain.linearRampToValueAtTime(enabled ? 0.16 : 0, t + 2.6);
}

export function isHeartDead() {
  return hbDead;
}

/** 读档回到真相之前时，把心跳还给她 */
export function reviveHeart() {
  hbDead = false;
  stopHeartbeat();
}

/** 读档回到真相之后：直接判定为「已经没有了」，不做一次多余的静音演出 */
export function killHeartSilently() {
  stopHeartbeat();
  hbDead = true;
}

