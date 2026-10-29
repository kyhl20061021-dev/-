/**
 * 第 8 章流程实测：进屋 → 三个疑点 → 逼问 → 真相 → 幕间 → 另一视角 → 第 9 章限时选择
 * 用真实窗口跑（无头下 WebGL 只有几帧，测不出东西）。
 */
import puppeteer from 'puppeteer-core';

/**
 * 测试跑构建产物（preview 服务器），避免 dev 的 HMR 在测试中途刷新页面。
 * 端口按顺序探测：preview 5180 / 5179、dev 5178，都探测不到就报错退出（而不是伪装成 PASS）。
 */
async function pickBase() {
  if (process.env.BASE) return process.env.BASE;
  for (const port of [5180, 5179, 5178]) {
    const url = `http://127.0.0.1:${port}/`;
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 1500);
      const r = await fetch(url, { signal: c.signal });
      clearTimeout(t);
      if (r.ok) { console.log('服务在 ' + port); return url; }
    } catch { /* 换下一个端口 */ }
  }
  console.error('找不到本地服务：先 `npm run build`，再 `npm run preview`（或 `npm run dev`）');
  process.exit(1);
}
const BASE = await pickBase();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = 'shots';
let pass = 0, fail = 0;
const step = (t) => console.log('   .. ' + t);
const check = (ok, label, detail = '') => {
  if (ok) { pass++; console.log(`  PASS ${label}${detail ? '  ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? '  ' + detail : ''}`); }
};

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: false,
  protocolTimeout: 180000,
  args: ['--no-sandbox', '--mute-audio', '--window-size=1400,880', '--window-position=30,30',
    // 窗口被别的窗口挡住时 Chrome 会停掉合成与 rAF，测试就会卡在「等不到下一帧」
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling', '--disable-features=CalculateNativeWinOcclusion']
});
const page = await browser.newPage();
await page.setViewport({ width: 1360, height: 760 });
await page.bringToFront();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)); });
page.on('framenavigated', (f) => {
  if (f === page.mainFrame()) console.log('NAV', new Date().toISOString().slice(11, 23), f.url().slice(0, 90));
});
page.on('error', (e) => console.log('PAGE CRASH', e.message));

console.log('A goto');
await page.goto(BASE, { waitUntil: 'networkidle2' });
await page.waitForFunction('window.__game && window.__game.ready', { polling: 100, timeout: 90000 });
console.log('B ready');
await page.evaluate(() => localStorage.clear());
console.log('C cleared, reload');
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForFunction('window.__game && window.__game.ready', { polling: 100, timeout: 90000 });
console.log('D reloaded');
// reload 之后窗口可能被别的窗口盖住，重新置前，rAF 才会继续跑
await page.bringToFront();
await sleep(400);
await page.evaluate(() => document.getElementById('route-dylan').click());
await page.waitForFunction('window.__game.running === true', { polling: 100, timeout: 90000 })
  .catch(() => { console.log('  !! 游戏没有进入 running —— 多半是窗口被挡住导致 rAF 停摆'); });
await sleep(1500);
await page.mouse.click(680, 400);
await sleep(600);

/** 把对话推到底；遇到选项就点第 idx 个 */
async function advance(choiceIdx = 0, max = 60) {
  for (let i = 0; i < max; i++) {
    const st = await page.evaluate(() => ({
      active: window.__game.dialogueActive,
      choices: document.querySelectorAll('.dchoice').length,
      text: window.__game.dialogueText || ''
    }));
    if (!st.active) return true;
    if (st.choices > 0) {
      await page.evaluate((i) => {
        const b = document.querySelectorAll('.dchoice')[i];
        if (b) b.click();
      }, Math.min(choiceIdx, st.choices - 1));
      await sleep(180);
      continue;
    }
    await page.keyboard.press('Space');
    await page.waitForFunction(
      (prev) => window.__game.dialogueText !== prev || !window.__game.dialogueActive,
      { polling: 100, timeout: 6000 }, st.text
    ).catch(() => {});
  }
  return !(await page.evaluate(() => window.__game.dialogueActive));
}

step('省掉前面 1–4 章的赶路');
/** 只推进到选项出现为止，不做选择 */
async function advanceToChoice(max = 60) {
  for (let i = 0; i < max; i++) {
    const st = await page.evaluate(() => ({
      active: window.__game.dialogueActive,
      choices: document.querySelectorAll('.dchoice').length,
      text: window.__game.dialogueText || ''
    }));
    if (!st.active) return false;
    if (st.choices > 0) return true;
    await page.keyboard.press('Space');
    await page.waitForFunction(
      (prev) => window.__game.dialogueText !== prev || !window.__game.dialogueActive,
      { polling: 100, timeout: 6000 }, st.text
    ).catch(() => {});
  }
  return false;
}

// 省掉前面 1–4 章的赶路，直接到屋前（这一段已有冒烟测试覆盖）
await page.evaluate(() => {
  const s = window.__game.state;
  s.flags.met_tristan = true;
  s.flags.mid_talked = true;
  s.chapter = 4;
  window.__game.teleport(-9, -56);
});
await sleep(600);

const houseOpened = await page.waitForFunction(() => window.__game.dialogueActive, { polling: 100, timeout: 15000 })
  .then(() => true).catch(() => false);
if (!houseOpened) {
  console.log('  !! 触发没发生，当前状态',
    await page.evaluate(() => ({ ch: window.__game.state.chapter, pos: window.__game.pos, sim: window.__game.simTime })).then(JSON.stringify));
}
check(houseOpened, '走到屋前触发进屋');
await page.screenshot({ path: `${OUT}/h1-enter.png` });
await advance();
await sleep(600);

check(await page.evaluate(() => window.__game.state.chapter >= 6),
  '进屋后章号推进到 6', String(await page.evaluate(() => window.__game.state.chapter)));

step('进屋：碰撞与安全区');
/* ---------------- 进屋：碰撞与安全区 ---------------- */
await page.evaluate(() => window.__game.teleport(-9.62, -65));
await sleep(1200);
const inside = await page.evaluate(() => ({ safe: window.__game.safeHouse, pos: window.__game.pos }));
check(inside.safe === true, '从门洞走进屋里（门是通的）', JSON.stringify(inside.pos));
await page.evaluate(() => window.__game.setYaw(0));
await sleep(700);
await page.screenshot({ path: `${OUT}/h2-inside.png` });

step('三个疑点');
/* ---------------- 三个疑点 ---------------- */
const SPOTS = [
  { id: 'fire', x: -10.05, z: -66.55, flag: 'clue_fire', stand: [-10.05, -66.5], yaw: 0 },
  { id: 'bowl', x: -7.95, z: -66.5, flag: 'clue_bowl', stand: [-8.35, -66.0], yaw: -1.4 },
  { id: 'window', x: -6.75, z: -65.45, flag: 'clue_window', stand: [-7.35, -65.45], yaw: -1.57 }
];

for (const s of SPOTS) {
  await page.evaluate((p) => { window.__game.teleport(p[0], p[1]); }, s.stand);
  await sleep(700);
  await page.evaluate((y) => window.__game.setYaw(y), s.yaw);
  await sleep(500);
  const prompt = await page.evaluate(() => {
    const el = document.getElementById('prompt');
    return el.classList.contains('hidden') ? '' : document.getElementById('promptText').textContent;
  });
  check(prompt.length > 0, `${s.id} 出现观察提示`, prompt);
  if (s.id === 'fire') await page.screenshot({ path: `${OUT}/h3-fire.png` });
  await page.keyboard.press('KeyE');
  const opened = await page.waitForFunction(() => window.__game.dialogueActive, { polling: 100, timeout: 6000 })
    .then(() => true).catch(() => false);
  check(opened, `${s.id} 可以观察`);
  if (s.id === 'fire') await page.screenshot({ path: `${OUT}/h4-clue.png` });
  await advance();
  await sleep(400);
  check(await page.evaluate((f) => !!window.__game.state.flags[f], s.flag), `${s.id} 写入疑点标记`);
}

const clues = await page.evaluate(() => ({
  all: !!window.__game.state.flags.clues_all,
  chapter: window.__game.state.chapter
}));
check(clues.all, '三处疑点凑齐');
check(clues.chapter === 7, '疑点阶段是第 7 章', String(clues.chapter));

step('逼问');
/* ---------------- 逼问 ---------------- */
await page.evaluate(() => { window.__game.npcTo(-9.62, -64.6); window.__game.teleport(-9.62, -65.4); });
await sleep(800);
const askPrompt = await page.evaluate(() => document.getElementById('promptText').textContent);
check(askPrompt === '问他', '交互提示变成「问他」', askPrompt);
await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__game.dialogueActive, { polling: 100, timeout: 8000 });
await sleep(600);
await page.screenshot({ path: `${OUT}/h5-confront.png` });

// 推到真相那一句为止（选项出现前）
for (let i = 0; i < 40; i++) {
  const st = await page.evaluate(() => ({
    active: window.__game.dialogueActive,
    choices: document.querySelectorAll('.dchoice').length,
    revealed: document.body.classList.contains('reveal'),
    truth: !!window.__game.state.flags.knows_truth
  }));
  if (st.choices > 0 || !st.active) break;
  await page.keyboard.press('Space');
  await sleep(140);
  if (st.revealed && !st.truth) await sleep(200);
}

const reveal = await page.evaluate(() => ({
  truth: !!window.__game.state.flags.knows_truth,
  reveal: document.body.classList.contains('reveal'),
  label: document.querySelector('[data-stat="integrity"] .sname').textContent,
  chapter: window.__game.state.chapter
}));
check(reveal.truth, '真相已置位');
check(reveal.reveal, '心跳停止 / 透明化特效已触发（body.reveal）');
check(reveal.label === '灵魂完整度', 'UI 措辞切到「灵魂完整度」', reveal.label);
check(reveal.chapter === 8, '真相发生在第 8 章', String(reveal.chapter));
await page.screenshot({ path: `${OUT}/h6-reveal.png` });

step('限时分支：崩溃');
/* ---------------- 限时分支：崩溃 ---------------- */
const hasTimer = await page.evaluate(() => {
  const t = document.querySelector('.dtimer');
  return !!t && !t.classList.contains('hidden');
});
check(hasTimer, '第 8 章选择带倒计时');
await page.screenshot({ path: `${OUT}/h7-choice.png` });
await advance(0);
await sleep(800);

const afterTruth = await page.evaluate(() => ({
  broke: !!window.__game.state.flags.broke_down,
  panel: !document.getElementById('ending').classList.contains('hidden'),
  kicker: document.getElementById('endKicker').textContent,
  fog: window.__game.fogDensity,
  hint: !document.getElementById('povHint').classList.contains('hidden')
}));
check(afterTruth.broke, '选择「哭出来」写入分支');
check(afterTruth.panel, '弹出第一幕幕间卡');
check(afterTruth.hint, '「另一视角」入口已出现');
await page.screenshot({ path: `${OUT}/h8-interlude.png` });

await page.evaluate(() => document.getElementById('endStay').click());
await sleep(900);
check(await page.evaluate(() => window.__game.running), '幕间卡关掉后继续可玩');

step('另一视角');
/* ---------------- 另一视角 ---------------- */
await page.keyboard.press('Tab');
await sleep(600);
const povOpen = await page.evaluate(() => !document.getElementById('povPanel').classList.contains('hidden'));
check(povOpen, 'Tab 打开「另一视角」');
await page.evaluate(() => document.querySelectorAll('.pov-item')[3].click());
await sleep(400);
const povText = await page.evaluate(() => document.getElementById('povRead').textContent);
check(povText.includes('第 四 章') || povText.includes('第 四章') || povText.length > 20, '可回看某一章',
  povText.slice(0, 24));
await page.screenshot({ path: `${OUT}/h9-pov.png` });
await page.keyboard.press('Escape');
await sleep(400);
check(await page.evaluate(() => document.getElementById('povPanel').classList.contains('hidden')),
  'ESC 关闭面板，且不推进剧情');

step('第 9 章');
/* ---------------- 第 9 章：限时选择 + 失败 + 回溯 ---------------- */
await page.evaluate(() => window.__game.teleport(-9, -74));
const gateOpened = await page.waitForFunction(() => window.__game.dialogueActive, { polling: 100, timeout: 8000 })
  .then(() => true).catch(() => false);
check(gateOpened, '第 9 章山谷口触发');
const atChoice = await advanceToChoice(40);
check(atChoice, '推进到山谷口的选择');
await sleep(300);
const gate = await page.evaluate(() => ({
  choices: document.querySelectorAll('.dchoice').length,
  timer: !document.querySelector('.dtimer').classList.contains('hidden'),
  chapter: window.__game.state.chapter
}));
check(gate.choices >= 2, '山谷口给出限时选择', String(gate.choices));
check(gate.timer, '倒计时条可见');
check(gate.chapter === 9, '进入第 9 章', String(gate.chapter));
await page.screenshot({ path: `${OUT}/h10-valley.png` });

// 什么都不点，等它自己超时 —— 这就是「不选也要付代价」
await page.waitForFunction(() => !!window.__game.state.flags.timed_out, { polling: 100, timeout: 20000 }).catch(() => {});
await sleep(1500);
console.log('   >> 超时后状态', JSON.stringify(await page.evaluate(() => ({
  active: window.__game.dialogueActive,
  text: (window.__game.dialogueText || '').slice(0, 20),
  actions: window.__game.state.pendingActions.length,
  weather: !!window.__game.state.flags.weather_set,
  panel: !document.getElementById('ending').classList.contains('hidden'),
  title: document.getElementById('endTitle').textContent
}))));
// 把超时分支的余下台词读完，对话才会真的关闭
await advance(0, 20);
const failed = await page.evaluate(() => ({
  timedOut: !!window.__game.state.flags.timed_out,
  panel: !document.getElementById('ending').classList.contains('hidden'),
  rewind: document.getElementById('endRewind').style.display !== 'none',
  title: document.getElementById('endTitle').textContent
}));
check(failed.timedOut, '限时结束由系统代选');
check(failed.panel, '弹出坏结局');
check(failed.rewind, '坏结局提供「回到选择之前」', failed.title);
await page.screenshot({ path: `${OUT}/h11-fail.png` });

await page.evaluate(() => document.getElementById('endRewind').click());
await page.waitForFunction(() => window.__game.dialogueActive, { polling: 100, timeout: 8000 }).catch(() => {});
await sleep(600);
const rewound = await page.evaluate(() => ({
  active: window.__game.dialogueActive,
  stayed: !!window.__game.state.flags.stayed,
  panel: !document.getElementById('ending').classList.contains('hidden')
}));
check(rewound.active, '回溯后重新回到那个选择');
check(!rewound.stayed, '回溯清掉了失败分支的标记');
check(!rewound.panel, '坏结局面板已关闭');

const finalStats = await page.evaluate(() => window.__game.stats);
check(finalStats.integrity > 0 && finalStats.integrity <= 100, '回溯后数值仍在合法区间',
  JSON.stringify(finalStats));

console.log(`\n结果 ${pass}/${pass + fail}`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
