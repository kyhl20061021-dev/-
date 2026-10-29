import * as THREE from 'three';
import './styles.css';

import { createWorld } from './world/index.js';
import { Player } from './systems/player.js';
import { NPC } from './systems/npc.js';
import { CameraRig } from './systems/cameraRig.js';
import { Input } from './systems/input.js';
import { DialogueSystem } from './systems/dialogue.js';
import { HUD } from './ui/hud.js';
import { PovPanel, cn } from './ui/pov.js';
import { readSave, writeSave, clearSave, summarizeSave } from './core/save.js';
import { dylanRoute, clueCount } from './data/route-dylan.js';
import { tristanRoute } from './data/route-tristan.js';
import {
  startAmbient, toggleAmbient, startHeartbeat, setHeartRate,
  heartStop, isHeartDead, reviveHeart, killHeartSilently
} from './systems/audio.js';
import { Stats } from './systems/stats.js';
import { Mood } from './systems/mood.js';
import { CANON } from './core/canon.js';
import { HOUSE_POS } from './world/layout.js';

const ROUTES = { dylan: dylanRoute, tristan: tristanRoute };

/* ------------------------------------------------------------------ */
/* 基础渲染环境                                                         */
/* ------------------------------------------------------------------ */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.74;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 420);

// 画面暗角
const vig = document.createElement('div');
vig.id = 'vignette';
document.getElementById('ui').appendChild(vig);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ------------------------------------------------------------------ */
/* 全局状态                                                            */
/* ------------------------------------------------------------------ */
const state = {
  flags: {},
  done: {},            // 已触发过的 trigger id
  pendingActions: [],
  routeId: null,
  phase: 0,
  /** 当前章号：1–8 第一幕，9 起进入荒原同行。只增不减（回溯时整体覆盖） */
  chapter: 1,
  /** 限时选择失败后回到的那一刻 */
  checkpoint: null,
  /** 数值效果出口，由 setupRoute 注入（dialogue 只管读数据，不碰 stats） */
  onFx: null,
  /** 演出效果出口（心跳停止等），同样由 setupRoute 注入 */
  onEffect: null
};

const bootTime = performance.now();

const hud = new HUD();
const dialogue = new DialogueSystem(state);
const input = new Input();
const pov = new PovPanel();

let world = null;
let player = null;
let npc = null;
let rig = null;
let route = null;
let stats = null;
let mood = null;
let running = false;
let lastFlagSig = '';
let endingShown = false;
let lastStatSig = '';
/** 调试相机：设置后主循环不再接管镜头，用于自动化近景截图 */
let debugCam = null;
let wasSafe = false;

/* ------------------------------------------------------------------ */
/* 世界构建（两条线共用）                                                */
/* ------------------------------------------------------------------ */
function buildWorldOnce() {
  if (world) return;
  world = createWorld(scene);
  // 心像投射需要拿到建好之后的雾与光
  mood = new Mood(scene, { vigEl: vig });
}

/**
 * 安全屋判定：真的在屋里才算。
 * 屋子现在有墙有门，站在门外不算「安全」——这一条直接决定第 9 章要不要伸手。
 */
function inSafeHouse() {
  if (!player) return false;
  const dx = Math.abs(player.pos.x - HOUSE_POS.x);
  const dz = Math.abs(player.pos.z - HOUSE_POS.z);
  return dx < 2.6 && dz < 2.1;
}

/** 安全屋内部的镜头包围盒：进屋子之后镜头不许出墙 */
const INDOOR_BOUNDS = {
  minX: HOUSE_POS.x - 2.34,
  maxX: HOUSE_POS.x + 2.34,
  minZ: HOUSE_POS.z - 1.84,
  maxZ: HOUSE_POS.z + 1.84,
  minY: HOUSE_POS.y + 0.8,
  maxY: HOUSE_POS.y + 2.5
};

/* ------------------------------------------------------------------ */
/* 启动 / 恢复一条路线                                                   */
/* ------------------------------------------------------------------ */
function startRoute(routeId, { resume = true } = {}) {
  const def = ROUTES[routeId];
  if (!def) return;

  document.getElementById('menu').classList.add('hide');
  document.getElementById('loading').classList.remove('hidden');
  endingShown = false;
  document.getElementById('ending').classList.add('hidden');
  document.getElementById('endStay').style.display = '';

  // 让浏览器先画出加载层
  requestAnimationFrame(() => {
    setTimeout(async () => {
      buildWorldOnce();

      // 植被是异步铺的（要读几十个模型文件），这期间加载层保持可见
      if (world && !world.decorated && !world.decorating) {
        world.decorating = true;
        const lt = document.querySelector('#loading .lt');
        if (lt) lt.textContent = '正在铺开荒原…';
        await world.decorate((done, total) => {
          if (lt) lt.textContent = `正在铺开荒原… ${done}/${total}`;
        });
      }

      setupRoute(def, routeId, resume);
      document.getElementById('loading').classList.add('hidden');
      running = true;
      startAmbient();
    }, 30);
  });
}

function setupRoute(def, routeId, resume) {
  // 清掉上一条线的实体
  if (player) scene.remove(player.char.root);
  if (npc) scene.remove(npc.char.root);

  route = def;
  state.routeId = routeId;
  state.flags = {};
  state.done = {};
  state.pendingActions = [];
  state.phase = 0;
  state.chapter = 1;
  state.checkpoint = null;
  lastFlagSig = '';

  const save = resume ? readSave(routeId) : null;
  if (save) {
    state.flags = save.flags || {};
    state.done = save.done || {};
    state.phase = save.phase || 0;
    if (save.chapter) state.chapter = save.chapter;
  } else {
    clearSave(routeId);
  }

  player = new Player(scene, world.heightAt, world.colliders, { model: def.playerModel });
  const sp = def.spawn;
  player.spawn(sp.x, sp.z, sp.yaw);
  if (save && save.pos) player.teleport(save.pos.x, save.pos.z);

  npc = new NPC(scene, {
    name: def.npc.name,
    x: def.npc.x,
    z: def.npc.z,
    yaw: def.npc.yaw,
    behavior: def.npc.behavior,
    model: def.npc.model,
    heightAt: world.heightAt,
    colliders: world.colliders
  });

  if (!rig) {
    rig = new CameraRig(camera, canvas, world.heightAt);
  }
  // 镜头避障需要知道墙和大石在哪
  rig.colliders = world.colliders;
  if (save && save.mode) rig.mode = save.mode;
  // 用 setLook 而不是直接改字段：内部有吸附用的原始角度，得一起写
  rig.setLook((save && save.yaw !== undefined) ? save.yaw : sp.yaw, -0.14);
  rig._smooth = null;

  hud.setRoute(def.label, state.chapter);
  hud.setMode(rig.mode);
  hud.setObjectives(def.objectives);
  hud.renderQuests(state);
  hud.hidePrompt();
  hud.setLocked(rig.locked);

  // 数值：迪伦看完整度，崔斯坦看报废度，两人都看信任
  stats = new Stats(def.role || 'dylan');
  if (save && save.stats) stats.load(save.stats);
  stats.onDeath = onIntegrityZero;
  state.onFx = handleFx;
  state.onEffect = handleEffect;
  lastStatSig = '';
  hud.setStatsRole(stats.role);
  hud.updateStats(stats.snapshot());
  refreshStatLabels();
  if (mood) mood.eff = 0;

  // 心跳：只有在「还不知道」的时候才响
  if (povUnlocked()) { killHeartSilently(); } else { reviveHeart(); startHeartbeat(); }
  document.body.classList.toggle('reveal', !!state.flags.knows_truth);

  // 已完成的对话不再重播
  if (state.flags.met_tristan || state.flags.met_dylan) syncBehavior();

  input.clear();
}

/** 「另一视角」是否已解锁（第 8 章读完） */
function povUnlocked() {
  return !!(state.flags.knows_truth || state.flags.told_truth);
}

/* ------------------------------------------------------------------ */
/* 剧情：对话 / 触发 / 交互                                              */
/* ------------------------------------------------------------------ */
function openDialogue(key) {
  const def = route && route.dialogues[key];
  if (!def) return;
  // 限时选择之前留一个检查点：失败后要能回到「还没选」的那一刻
  if (def.checkpoint) snapshotCheckpoint(key);
  player.frozen = true;
  hud.hidePrompt();
  dialogue.start(def, () => {
    player.frozen = false;
    syncBehavior();
    refreshStatLabels();
    hud.setRoute(route.label, state.chapter);
    hud.renderQuests(state);
    persist();
    afterDialogue();
  });
}

/* ------------------------------------------------------------------ */
/* 对话结束之后：疑点、真相、失败，都在这里汇合                          */
/* ------------------------------------------------------------------ */
function afterDialogue() {
  // 三处疑点凑齐：给他一次机会把话说完
  if (route.id === 'dylan' && clueCount(state) >= 3 && !state.flags.clues_all) {
    state.flags.clues_all = true;
    hud.toast('三处说不通的地方。你在心里把它们排成了一行。');
  }

  // 第 8 章读完：荒原的天气由她的反应决定（心像投射的第一次结算）
  const revealed = povUnlocked();
  if (revealed && !state.flags.weather_set) {
    state.flags.weather_set = true;
    applyTruthWeather();
    unlockPov();
    showInterlude();
  }

  flushActions();
  persist();
}

/** 真相之后的初始天气：她没有选天气，天气是她选的 */
function applyTruthWeather() {
  if (!mood) return;
  if (state.flags.broke_down) {
    mood.setBias({ fog: 0.30, warm: -0.30 });   // 塌下去：雾更厚，暖光更远
  } else if (state.flags.accepted) {
    mood.setBias({ fog: -0.16, warm: 0.22 });   // 接受了：路稍微开一点
  } else {
    mood.setBias({ fog: 0.10, warm: -0.12 });   // 说不出话：悬着
  }
}

function unlockPov() {
  if (!route.otherPov) return;
  pov.mount(route.otherPov);
  const hint = document.getElementById('povHint');
  if (hint) hint.classList.remove('hidden');
  hud.toast('第 8 章已读完 · 按 Tab 回看「另一视角」', 4200);
}

/* ------------------------------------------------------------------ */
/* 面板：幕间 / 失败 / 终局                                              */
/* ------------------------------------------------------------------ */
function showPanel({ kicker, title, text, mode = 'interlude', rewindLabel }) {
  document.getElementById('endKicker').textContent = kicker;
  document.getElementById('endTitle').textContent = title;
  document.getElementById('endText').textContent = text;

  const rw = document.getElementById('endRewind');
  const stay = document.getElementById('endStay');

  if (mode === 'fail') {
    rw.style.display = '';
    rw.textContent = rewindLabel || '回到选择之前';
    stay.style.display = 'none';
  } else if (mode === 'end') {
    rw.style.display = 'none';
    stay.style.display = 'none';
  } else {
    rw.style.display = 'none';
    stay.style.display = '';
    stay.textContent = '继续';
  }

  document.getElementById('ending').classList.remove('hidden');
  running = false;
  pov.hide();
}

function showInterlude() {
  const it = route.interlude || route.ending;
  if (!it) return;
  showPanel({
    kicker: it.kicker || '第 一 幕 · 完',
    title: it.title,
    text: it.text,
    mode: 'interlude'
  });
}

function showFailure(key) {
  const f = route.failures && route.failures[key];
  if (!f) return;
  if (player) player.frozen = true;
  showPanel({
    kicker: f.kicker || '失 败',
    title: f.title,
    text: f.text,
    mode: 'fail',
    rewindLabel: f.rewind || '回到选择之前'
  });
}

/** 失败后不惩罚读者：把状态整体退回到选择之前，然后重新问一次 */
function rewindToCheckpoint() {
  const cp = state.checkpoint;
  if (!cp) return;
  state.flags = JSON.parse(JSON.stringify(cp.flags));
  state.done = JSON.parse(JSON.stringify(cp.done));
  state.chapter = cp.chapter;
  if (stats) {
    stats.load(cp.stats);
    stats.dead = false;
  }
  player.teleport(cp.pos.x, cp.pos.z);
  rig.yaw = cp.yaw;
  if (cp.mode) rig.mode = cp.mode;

  document.getElementById('ending').classList.add('hidden');
  endingShown = false;
  running = true;
  player.frozen = false;
  lastFlagSig = '';
  lastStatSig = '';

  hud.setRoute(route.label, state.chapter);
  hud.renderQuests(state);
  hud.updateStats(stats.snapshot());
  refreshStatLabels();
  if (mood) mood.eff = 0;

  // 回到真相之前，心跳也要跟着回来
  if (!povUnlocked()) {
    document.body.classList.remove('reveal');
    if (isHeartDead()) {
      reviveHeart();
      startHeartbeat();
    }
  }

  setTimeout(() => openDialogue(cp.key), 240);
}

function flushActions() {
  while (state.pendingActions.length) {
    const a = state.pendingActions.shift();
    if (typeof a === 'string' && a.startsWith('fail:')) showFailure(a.slice(5));
  }
}

/** 限时选择之前的一次快照 */
function snapshotCheckpoint(key) {
  if (!player) return;
  state.checkpoint = {
    key,
    flags: JSON.parse(JSON.stringify(state.flags)),
    done: JSON.parse(JSON.stringify(state.done)),
    chapter: state.chapter,
    stats: stats ? stats.snapshot() : null,
    pos: { x: player.pos.x, z: player.pos.z },
    yaw: rig ? rig.yaw : 0,
    mode: rig ? rig.mode : 'third'
  };
}

/**
 * 同行时的站位。
 * 屋外：lead —— 他走在斜前方带路，台词里「我一直在你前面三步」「你连头都不回」才成立
 * 屋里：follow —— 5.6×4.6 的空间放不下「前方三步」，他会直接卡在墙上
 *
 * 判定用比屋子大一圈的「房子附近」，不是精确的屋内：站在门口来回时
 * 行为会每帧切换，目标点也跟着跳，人物就会原地抽动。
 */
function wantedBehavior() {
  if (!(state.flags.met_tristan || state.flags.met_dylan)) return 'wait';
  const nearHouse = player &&
    Math.abs(player.pos.x - HOUSE_POS.x) < 4.6 &&
    Math.abs(player.pos.z - HOUSE_POS.z) < 4.2;
  return nearHouse ? 'follow' : 'lead';
}

function syncBehavior() {
  if (!npc) return;
  const want = wantedBehavior();
  if (npc.behavior !== want) npc.setBehavior(want);
}

function checkTriggers() {
  if (!route || dialogue.active) return;
  for (const tr of route.triggers) {
    if (state.done[tr.id]) continue;
    if (tr.requires && !state.flags[tr.requires]) continue;
    const d = Math.hypot(player.pos.x - tr.x, player.pos.z - tr.z);
    if (d <= tr.r) {
      state.done[tr.id] = true;
      openDialogue(tr.dialogue);
      return;
    }
  }
}

function nearestInteract() {
  if (!route || !npc || dialogue.active) return null;
  const d = npc.distanceTo(player.pos);
  if (d > route.interact.radius) return null;
  const key = route.interact.dialogue(state);
  if (!key) return null;
  const label = typeof route.interact.prompt === 'function'
    ? route.interact.prompt(state)
    : route.interact.prompt;
  return { key, distance: d, prompt: label };
}

/** 屋里的疑点、门外的窗：和 NPC 一样是「按 E」的对象 */
function nearestHotspot() {
  if (!route || !route.hotspots || dialogue.active) return null;
  let best = null;
  for (const h of route.hotspots) {
    if (h.requires && !state.flags[h.requires]) continue;
    if (state.done['hs:' + h.id]) continue;
    const d = Math.hypot(player.pos.x - h.x, player.pos.z - h.z);
    if (d <= h.r && (!best || d < best.distance)) best = { hotspot: h, distance: d, prompt: h.prompt };
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* 数值效果与结局判定                                                    */
/* ------------------------------------------------------------------ */
/**
 * 数值出口。台词/选项里写 fx: { integrity:-10 } 就会走到这里。
 * 不做 toast 提示：这个游戏的反馈交给条、雾和心跳，不交给文字。
 */
function handleFx(fx) {
  if (!stats) return;
  stats.apply(fx);
  hud.updateStats(stats.snapshot());
  lastStatSig = '';
  if (mood) mood.update(0.016, { tension: stats.tension, warmth: stats.trust / CANON.trust.max });
  setHeartRate(stats.tension);
  persist();
}

/**
 * 演出效果出口。
 * heartstop：第 8 章坦白那一句——心跳停、画面褪色、UI 变透明，
 * 然后再也没有心跳声回来（她已经知道了）。
 */
function handleEffect(name, line) {
  if (name === 'heartstop') {
    heartStop();
    document.body.classList.add('reveal');
    const flash = document.createElement('div');
    flash.className = 'reveal-flash';
    document.getElementById('ui').appendChild(flash);
    setTimeout(() => flash.remove(), 1600);
    hud.toast('……', 1200);
    void line;
  }
}

/** 完整度归零 = 灵魂被吞噬（docs/mechanics.md §三.1） */
function onIntegrityZero() {
  if (endingShown) return;
  endingShown = true;
  if (player) player.frozen = true;
  showPanel({
    kicker: '灵 魂 完 整 度 · 归 零',
    title: '灵魂消散',
    text: '她的声音停在一半。\n荒原把剩下的话收走了。',
    mode: 'end'
  });
}

/** 迪伦在知道真相之前，UI 不能出现「灵魂」二字（docs/glossary.md） */
function refreshStatLabels() {
  const revealed = !!state.flags.knows_truth;
  hud.setStatLabel('integrity', revealed ? '灵魂完整度' : '气息');
}

/* ------------------------------------------------------------------ */
/* 存档                                                                */
/* ------------------------------------------------------------------ */
function persist() {
  if (!state.routeId) return;
  writeSave(state.routeId, {
    flags: state.flags,
    done: state.done,
    phase: state.phase,
    chapter: state.chapter,
    pos: { x: player.pos.x, z: player.pos.z },
    yaw: rig.yaw,
    mode: rig.mode,
    stats: stats ? stats.snapshot() : null
  });
}

/* ------------------------------------------------------------------ */
/* 交互输入                                                            */
/* ------------------------------------------------------------------ */
function handleKeys() {
  if (!player) return;

  // 另一视角：只读，随时可开可关，不推进任何剧情
  if (input.pressed('Tab') && povUnlocked() && !dialogue.active) {
    pov.toggle();
    if (pov.open) hud.hidePrompt();
    return;
  }
  if (input.pressed('Escape') && pov.open) {
    pov.hide();
    return;
  }
  if (pov.open) return;

  if (input.pressed('KeyV') && !dialogue.active) {
    const m = rig.toggleMode();
    hud.setMode(m);
    persist();
  }

  if (input.pressed('KeyM')) {
    toggleAmbient();
  }

  if (dialogue.active) {
    if (input.pressed('Space') || input.pressed('Enter') || input.pressed('KeyE')) {
      dialogue.advance();
    }
    for (let i = 1; i <= 3; i++) {
      if (input.pressed('Digit' + i) && dialogue.pendingChoices) dialogue.choose(i - 1);
    }
    return;
  }

  if (input.pressed('KeyE')) {
    const hs = nearestHotspot();
    if (hs) {
      state.done['hs:' + hs.hotspot.id] = true;
      openDialogue(hs.hotspot.dialogue);
      return;
    }
    const it = nearestInteract();
    if (it) openDialogue(it.key);
  }
}

/* ------------------------------------------------------------------ */
/* 主循环                                                              */
/* ------------------------------------------------------------------ */
const clock = new THREE.Clock();
let simTime = 0;
let frameCount = 0;

/* ------------------------------------------------------------------ */
/* 自适应画质                                                          */
/* 植被铺满之后，软件渲染或低端显卡可能撑不住。这里按实际帧耗时降级：   */
/* 先降阴影分辨率与像素比，再关掉植被投影。只降不升，避免来回抖动。     */
/* ------------------------------------------------------------------ */
const quality = { level: 0, acc: 0, n: 0 };
let shadowLight = null;
for (const o of scene.children) {
  if (o.isDirectionalLight && o.castShadow) { shadowLight = o; break; }
}

function applyQuality(level) {
  if (level <= quality.level) return;
  quality.level = level;

  if (level >= 1) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
    if (shadowLight) {
      shadowLight.shadow.mapSize.set(1024, 1024);
      if (shadowLight.shadow.map) {
        shadowLight.shadow.map.dispose();
        shadowLight.shadow.map = null;
      }
    }
  }
  if (level >= 2) {
    scene.traverse(o => {
      if (o.isInstancedMesh && o.name.startsWith('veg:')) o.castShadow = false;
    });
  }
  if (level >= 3) {
    renderer.setPixelRatio(0.75);
  }
}

function autoQuality(dt) {
  if (quality.level >= 3) return;
  quality.acc += dt;
  quality.n++;
  if (quality.n < 40) return;
  const avg = quality.acc / quality.n;
  quality.acc = 0;
  quality.n = 0;
  if (avg > 0.11) applyQuality(quality.level + 1);
  else if (avg > 0.055) applyQuality(Math.max(1, quality.level));
}

function loop() {
  requestAnimationFrame(loop);
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.05);
  frameCount++;

  if (running) autoQuality(rawDt);

  if (running && player && rig) {
    simTime += dt;
    handleKeys();

    player.update(dt, dialogue.active ? EMPTY_INPUT : input, rig.yaw);
    // 进出屋子会切换他「带路 / 贴身跟」的站位
    syncBehavior();
    // 带路时要拿玩家的速度做参考，否则他会忽快忽慢
    npc.update(dt, player.pos, player.facing, player.vel);
    if (debugCam) {
      camera.position.set(debugCam.pos[0], debugCam.pos[1], debugCam.pos[2]);
      camera.lookAt(debugCam.look[0], debugCam.look[1], debugCam.look[2]);
    } else {
      // 屋内收镜头，屋外放开
      rig.bounds = inSafeHouse() ? INDOOR_BOUNDS : null;
      rig.update(dt, player.pos, player.char.root);
    }

    dialogue.update(dt);

    // 心像投射 + 数值自然演变：荒原随迪伦的情绪变化（安全屋内停止扣减）
    if (stats && running) {
      const safe = inSafeHouse();
      stats.update(dt, { safe, tension: stats.tension });
      const ssig = stats.integrity.toFixed(1) + '|' + stats.trust.toFixed(1) + '|' + stats.anomaly.toFixed(1);
      if (ssig !== lastStatSig) {
        lastStatSig = ssig;
        hud.updateStats(stats.snapshot());
      }
      if (mood) {
        mood.update(dt, { tension: stats.tension, warmth: stats.trust / CANON.trust.max });
        if (safe && !wasSafe) mood.calm();
      }
      wasSafe = safe;
      setHeartRate(stats.tension);
    }

    if (!dialogue.active && !debugCam && !pov.open) {
      checkTriggers();
      const hs = nearestHotspot();
      const it = hs ? null : nearestInteract();
      const target = hs || it;
      if (target) {
        hud.showPrompt(target.prompt);
      } else {
        hud.hidePrompt();
      }
    } else {
      hud.hidePrompt();
    }

    const sig = Object.keys(state.flags).join(',') + '|' + state.phase + '|' + state.chapter;
    if (sig !== lastFlagSig) {
      lastFlagSig = sig;
      hud.renderQuests(state);
      hud.setRoute(route.label, state.chapter);
      refreshStatLabels();
      persist();
    }

    if (!debugCam) hud.setLocked(rig.locked);
    if (world.updateParticles) world.updateParticles(dt);

    // 失败动作（限时选择里选了「留下」之类）在这里统一收口
    if (state.pendingActions.length && !dialogue.active) flushActions();
  }

  renderer.render(scene, camera);
  input.endFrame();
}

/** 对话时冻结移动，但仍然读取按键用于推进 */
const EMPTY_INPUT = {
  down: () => false,
  pressed: () => false
};

/* ------------------------------------------------------------------ */
/* 菜单                                                                */
/* ------------------------------------------------------------------ */
document.getElementById('lockHint').addEventListener('click', () => {});
canvas.addEventListener('click', () => {
  document.getElementById('lockHint').classList.add('hide');
}, { once: true });

// 8 秒后即使没点也淡出，避免长期挡住画面
setTimeout(() => document.getElementById('lockHint').classList.add('hide'), 8000);

function refreshMenuNotes() {
  for (const id of Object.keys(ROUTES)) {
    const el = document.querySelector(`[data-save="${id}"]`);
    if (el) el.textContent = summarizeSave(id);
  }

  const foot = document.querySelector('.menu-foot');
  const hasSave = Object.keys(ROUTES).some(id => readSave(id));
  let btn = document.getElementById('clearAll');
  if (hasSave && !btn) {
    btn = document.createElement('button');
    btn.id = 'clearAll';
    btn.textContent = '清除全部进度';
    btn.style.cssText = 'margin-top:16px;background:none;border:none;color:#5c554b;font-family:var(--sans);font-size:11px;letter-spacing:.1em;cursor:pointer;padding:0;text-decoration:underline;';
    btn.onclick = () => {
      Object.keys(ROUTES).forEach(id => clearSave(id));
      btn.remove();
      refreshMenuNotes();
    };
    foot.appendChild(btn);
  }
}

document.querySelectorAll('.route').forEach(btn => {
  btn.addEventListener('click', () => startRoute(btn.dataset.route));
});

document.getElementById('endMenu').addEventListener('click', () => {
  running = false;
  document.getElementById('ending').classList.add('hidden');
  document.getElementById('menu').classList.remove('hide');
  refreshMenuNotes();
});

document.getElementById('endStay').addEventListener('click', () => {
  document.getElementById('ending').classList.add('hidden');
  // 幕间卡关掉之后继续走，不要把玩家卡在面板里
  if (player) player.frozen = false;
  running = !!player;
});

document.getElementById('endRewind').addEventListener('click', () => {
  rewindToCheckpoint();
});

refreshMenuNotes();
loop();

/* ------------------------------------------------------------------ */
/* 调试接口（自动化测试用）                                              */
/* ------------------------------------------------------------------ */
window.__game = {
  ready: true,
  get state() { return state; },
  get routeId() { return state.routeId; },
  get pos() { return player ? { x: player.pos.x, y: player.pos.y, z: player.pos.z } : null; },
  get npcPos() { return npc ? { x: npc.pos.x, z: npc.pos.z } : null; },
  get npcBehavior() { return npc ? npc.behavior : null; },
  get mode() { return rig ? rig.mode : null; },
  get yaw() { return rig ? rig.yaw : null; },
  get pitch() { return rig ? rig.pitch : null; },
  get dialogueActive() { return dialogue.active; },
  get dialogueText() { return document.querySelector('.dtext').textContent; },
  get transcript() { return dialogue.transcript; },
  get simTime() { return simTime; },
  get fps() { return frameCount / ((performance.now() - bootTime) / 1000); },
  get running() { return running; },
  startRoute,
  teleport(x, z) { player.teleport(x, z); },
  setYaw(y) { if (rig) rig.setLook(y, rig.pitch); },
  /** 测试用：直接把视线摆到指定角度（会被当前模式的上下限夹住） */
  look(y, p) { if (rig) rig.setLook(y, p); },
  toggleMode() { return rig ? rig.toggleMode() : null; },
  npcTo(x, z) { if (npc) { npc.pos.x = x; npc.pos.z = z; npc.pos.y = world.heightAt(x, z); npc.char.root.position.copy(npc.pos); } },
  get vegStats() { return world ? world.vegStats : null; },
  get qualityLevel() { return quality.level; },
  get stats() { return stats ? stats.snapshot() : null; },
  get bondLevel() { return stats ? stats.bondLevel : null; },
  get tension() { return stats ? stats.tension : 0; },
  get fogDensity() { return scene.fog ? scene.fog.density : null; },
  get safeHouse() { return inSafeHouse(); },
  get housePos() { return { x: HOUSE_POS.x, z: HOUSE_POS.z }; },
  applyFx(fx) { handleFx(fx); },
  /** 测试用：清掉「已弹过结局」的状态，让同一局可以再验一次终局判定 */
  resetEnding() {
    endingShown = false;
    running = !!player;
    if (player) player.frozen = false;
    document.getElementById('ending').classList.add('hidden');
    document.getElementById('endStay').style.display = '';
  },
  setDebugCam(pos, look) { debugCam = { pos, look }; },
  clearDebugCam() { debugCam = null; },
  /** 角色头顶世界坐标，用于自动化近景对焦 */
  headOf(who = 'npc') {
    const c = who === 'player' ? player : npc;
    if (!c) return null;
    const v = new THREE.Vector3(0, 1.68, 0);
    c.char.root.localToWorld(v);
    return v.toArray();
  },
  get scene() { return scene; },
  get renderer() { return renderer; },
  get camera() { return camera; },
  debugSetBg(hex) { scene.background = new THREE.Color(hex); },
  /** 离屏渲染截图：绕过无头浏览器的合成层问题，用于自动化视觉验证 */
  capture(w = 1280, h = 720) {
    const rt = new THREE.WebGLRenderTarget(w, h, { antialias: false });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    const px = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
    renderer.setRenderTarget(null);
    rt.dispose();

    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const src = (h - 1 - y) * w * 4;
      img.data.set(px.subarray(src, src + w * 4), y * w * 4);
    }
    ctx.putImageData(img, 0, 0);
    let r = 0, g = 0, b = 0;
    const sampleColors = new Set();
    for (let i = 0; i < img.data.length; i += 4) {
      r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2];
      if (sampleColors.size < 64) sampleColors.add((img.data[i] >> 3) + ',' + (img.data[i + 1] >> 3) + ',' + (img.data[i + 2] >> 3));
    }
    const n = (img.data.length / 4);
    return {
      dataUrl: c.toDataURL('image/png'),
      avgLum: (r + g + b) / (n * 3),
      avgRGB: [Math.round(r / n), Math.round(g / n), Math.round(b / n)],
      distinctColors: sampleColors.size
    };
  },
  debugLights() {
    return scene.children.filter(o => o.isLight).map(l => ({ type: l.type, intensity: l.intensity, color: l.color.getHexString() }));
  },
  probe() {
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const w = 16, h = 16;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(
      Math.floor(gl.drawingBufferWidth / 2) - w / 2,
      Math.floor(gl.drawingBufferHeight / 2) - h / 2,
      w, h, gl.RGBA, gl.UNSIGNED_BYTE, px
    );
    let r = 0, g = 0, b = 0, maxL = 0;
    for (let i = 0; i < px.length; i += 4) {
      r += px[i]; g += px[i + 1]; b += px[i + 2];
      maxL = Math.max(maxL, px[i] + px[i + 1] + px[i + 2]);
    }
    const n = px.length / 4;
    return {
      avg: [Math.round(r / n), Math.round(g / n), Math.round(b / n)],
      maxLum: maxL,
      buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight]
    };
  },
  get _dbg() {
    const terr = scene.getObjectByName('terrain');
    const bs = terr?.geometry.boundingSphere;
    const posArr = terr?.geometry.attributes.position.array;
    return {
      tri: renderer.info.render.triangles,
      calls: renderer.info.render.calls,
      cam: camera.position.toArray().map(n => +n.toFixed(2)),
      camDir: camera.getWorldDirection(new THREE.Vector3()).toArray().map(n => +n.toFixed(2)),
      playerY: player ? +player.pos.y.toFixed(2) : null,
      children: scene.children.length,
      terrBS: bs ? { r: +bs.radius.toFixed(1), c: bs.center.toArray().map(n => +n.toFixed(1)) } : null,
      nanVertices: posArr ? Array.from(posArr).filter(v => !Number.isFinite(v)).length : null,
      bg: scene.background ? scene.background.getHexString() : null,
      fogDensity: scene.fog ? scene.fog.density : null,
      near: camera.near,
      mode: rig ? rig.mode : null
    };
  }
};
