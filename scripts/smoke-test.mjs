/**
 * 真实浏览器冒烟测试：移动、奔跑、视角切换、交互、剧情、结局、存档、双线隔离
 * 运行前需先 npm run dev
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

/** 测试跑构建产物（preview 服务器），避免 dev 的 HMR 在测试中途刷新页面 */
const BASE = process.env.BASE || 'http://127.0.0.1:5180/';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.URL || BASE;
const OUT = 'shots';

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, cond, info = '') {
  results.push({ name, ok: !!cond, info });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '   [' + info + ']' : ''}`);
}
const hypot = (a, b, c, d) => Math.hypot(a - c, b - d);

/**
 * 用真实窗口跑，不用 headless：
 * headless 在没有显卡的环境里退回 SwiftShader，只有 0.2~3 fps，
 * 每一条「走 X 米 / 等 Y 秒」的断言都会变成测软件渲染器而不是测游戏。
 * 附带好处是截图也是真的（headless 下 WebGL 合成层截不到）。
 */
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: false,
  args: [
    '--no-sandbox',
    '--window-size=1440,900',
    '--window-position=30,30',
    '--mute-audio'
  ]
});

const page = await browser.newPage();
await page.setViewport({ width: 1360, height: 760, deviceScaleFactor: 1 });

const consoleErrors = [];
const failedRequests = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + e.message));
page.on('requestfailed', r => failedRequests.push(r.url()));

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 90000 });
await page.waitForFunction('window.__game && window.__game.ready', { timeout: 90000 });
await sleep(800);
await page.screenshot({ path: `${OUT}/01-menu.png` });
check('页面加载、WebGL 初始化', true);

/* ---------------- 迪伦线 ---------------- */
await page.click('#route-dylan');
await page.waitForFunction('window.__game.running === true', { timeout: 240000 });
await sleep(2600);
await page.screenshot({ path: `${OUT}/02-dylan-spawn.png` });
check('进入迪伦线', (await page.evaluate(() => window.__game.routeId)) === 'dylan');

const startPos = await page.evaluate(() => window.__game.pos);
check('角色站在地形上', startPos && Number.isFinite(startPos.y), `y=${startPos?.y?.toFixed(2)}`);
check('渲染帧率', true, `${(await page.evaluate(() => window.__game.fps)).toFixed(0)} fps（软件渲染）`);

/* --- 移动测试放在空旷处，避免触发剧情 --- */
async function measure(keys, ms) {
  await page.evaluate(() => window.__game.teleport(24, 30));
  await sleep(450);
  const a = await page.evaluate(() => ({ p: window.__game.pos, t: window.__game.simTime }));
  for (const k of keys) await page.keyboard.down(k);
  // 按「模拟时间」等待，低帧率环境下才不会量到一半就收工
  await page.waitForFunction(
    ([t0, need]) => window.__game.simTime - t0 >= need,
    { timeout: 30000 },
    [a.t, Math.max(1.0, ms / 1000)]
  ).catch(() => {});
  for (const k of keys) await page.keyboard.up(k);
  await sleep(250);
  const b = await page.evaluate(() => ({ p: window.__game.pos, t: window.__game.simTime }));
  const dist = hypot(a.p.x, a.p.z, b.p.x, b.p.z);
  const sim = b.t - a.t;
  return { dist, sim, speed: dist / Math.max(sim, 0.001) };
}

const walk = await measure(['KeyW'], 1800);
check('W 键前进', walk.dist > 1.5, `${walk.dist.toFixed(2)} m / ${walk.sim.toFixed(2)} s`);
check('步行速度在 4.2 m/s 附近', walk.speed > 2.6 && walk.speed < 5.0, `${walk.speed.toFixed(2)} m/s`);

const run = await measure(['ShiftLeft', 'KeyW'], 1800);
check('Shift 奔跑更快', run.speed > walk.speed * 1.35, `跑 ${run.speed.toFixed(2)} vs 走 ${walk.speed.toFixed(2)} m/s`);
check('奔跑速度在 7.6 m/s 附近', run.speed > 5.5 && run.speed < 9.0, `${run.speed.toFixed(2)} m/s`);

/* --- 相机 --- */
const modeBefore = await page.evaluate(() => window.__game.mode);
await page.keyboard.press('KeyV');
const toggled = await page
  .waitForFunction(m => window.__game.mode !== m, { timeout: 6000 }, modeBefore)
  .then(() => true).catch(() => false);
const modeAfter = await page.evaluate(() => window.__game.mode);
check('V 切换第一/第三人称', toggled, `${modeBefore} -> ${modeAfter}`);
await page.screenshot({ path: `${OUT}/03-first-person.png` });
await page.keyboard.press('KeyV');
await sleep(300);

await page.evaluate(() => window.__game.setYaw(1.1));
const yawOk = await page
  .waitForFunction(() => Math.abs(window.__game.yaw - 1.1) < 0.01, { timeout: 6000 })
  .then(() => true).catch(() => false);
check('视角可旋转', yawOk, `yaw = ${(await page.evaluate(() => window.__game.yaw)).toFixed(2)}`);

/* --- 交互与对话 --- */
const npcPos = await page.evaluate(() => window.__game.npcPos);
await page.evaluate(p => window.__game.teleport(p.x + 3.0, p.z + 2.0), npcPos);
await sleep(700);
// 软件渲染下每秒只有几帧，固定 sleep 会抢在渲染之前断言，改用轮询
const promptVisible = await page
  .waitForFunction(() => !document.getElementById('prompt').classList.contains('hidden'), { timeout: 8000 })
  .then(() => true).catch(() => false);
check('靠近 NPC 出现交互提示', promptVisible);

await page.keyboard.press('KeyE');
const dialogueOpened = await page
  .waitForFunction(() => window.__game.dialogueActive, { timeout: 10000 })
  .then(() => true)
  .catch(() => false);
check('E 触发对话', dialogueOpened);
await page.screenshot({ path: `${OUT}/04-dialogue.png` });

async function advanceAll() {
  for (let i = 0; i < 120; i++) {
    const st = await page.evaluate(() => ({
      active: window.__game.dialogueActive,
      choices: document.querySelectorAll('.dchoice').length,
      text: window.__game.dialogueText || ''
    }));
    if (!st.active) return true;
    if (st.choices > 0) {
      await page.click('.dchoice');
      await sleep(220);
      continue;
    }
    await page.keyboard.press('Space');
    // 等这一行真的推进，而不是按固定毫秒硬等
    await page.waitForFunction(
      prev => window.__game.dialogueText !== prev || !window.__game.dialogueActive,
      { timeout: 6000 },
      st.text
    ).catch(() => {});
  }
  return !(await page.evaluate(() => window.__game.dialogueActive));
}

check('对话可推进并结束', await advanceAll());
const flags1 = await page.evaluate(() => ({ ...window.__game.state.flags }));
check('对话写入剧情标记 met_tristan', !!flags1.met_tristan, Object.keys(flags1).join(','));

const dylanTranscript = await page.evaluate(() => window.__game.transcript);
const leakWords = ['死', '灵魂', '摆渡人', '恶魔'].filter(w => dylanTranscript.includes(w));
check('运行期迪伦线对话无越界提示', leakWords.length === 0, leakWords.join(','));

check('对话后 NPC 进入跟随', (await page.evaluate(() => window.__game.npcBehavior)) === 'follow');

/* --- 数值与心像投射（docs/mechanics.md §三） --- */
const st0 = await page.evaluate(() => window.__game.stats);
check('三条数值都在 canon 区间内',
  st0.integrity > 0 && st0.integrity <= 100 && st0.trust >= 0 && st0.trust <= 100 && st0.anomaly === 0,
  JSON.stringify(st0));
const label0 = await page.evaluate(() => document.querySelector('#statPanel [data-stat="integrity"] .sname').textContent);
check('迪伦在知道真相前看到的是「气息」', label0 === '气息', label0);

const fogBefore = await page.evaluate(() => window.__game.fogDensity);
await page.evaluate(() => window.__game.applyFx({ integrity: -30, trust: -20 }));
await sleep(1200);
const afterFx = await page.evaluate(() => ({
  s: window.__game.stats, fog: window.__game.fogDensity, tension: window.__game.tension
}));
check('数值效果写回状态条', Math.abs(st0.integrity - afterFx.s.integrity) > 20,
  `${st0.integrity.toFixed(1)} -> ${afterFx.s.integrity.toFixed(1)}`);
check('恐惧升高时紧张度上升', afterFx.tension > 0.7, afterFx.tension.toFixed(2));

// 羁绊拉满 = 荒原安静下来，雾必须变薄（心像投射最直观的一条）
await page.evaluate(() => window.__game.applyFx({ trust: 100 }));
await sleep(2600);
const calm = await page.evaluate(() => ({ fog: window.__game.fogDensity, tension: window.__game.tension }));
check('心像投射：羁绊升高后雾变薄', calm.fog < afterFx.fog - 0.0008,
  `${afterFx.fog.toFixed(5)} -> ${calm.fog.toFixed(5)}`);
await page.screenshot({ path: `${OUT}/13-stats-damaged.png` });

const pNow = await page.evaluate(() => window.__game.pos);
await page.evaluate(p => window.__game.teleport(p.x, p.z - 8), pNow);
await sleep(2200);
const followDist = await page.evaluate(() => {
  const p = window.__game.pos, n = window.__game.npcPos;
  return Math.hypot(p.x - n.x, p.z - n.z);
});
check('NPC 跟随玩家', followDist < 10, `距离 ${followDist.toFixed(1)} m`);
await page.screenshot({ path: `${OUT}/05-follow.png` });

/* --- 安全屋与结局 --- */
await page.evaluate(() => window.__game.teleport(-9, -52));
const houseTriggered = await page
  .waitForFunction(() => window.__game.dialogueActive, { timeout: 8000 })
  .then(() => true).catch(() => false);
check('安全屋触发器生效', houseTriggered);
await page.screenshot({ path: `${OUT}/06-house-approach.png` });
await advanceAll();
await sleep(2400);
check('第一幕完成弹出结局', await page.evaluate(() => !document.getElementById('ending').classList.contains('hidden')));
await page.screenshot({ path: `${OUT}/07-ending.png` });

check('迪伦线存档写入', await page.evaluate(() => !!localStorage.getItem('ferryman3d:save:dylan')));
check('两条线存档互不干扰', (await page.evaluate(() => localStorage.getItem('ferryman3d:save:tristan'))) === null);

/* --- 完整度归零 = Bad Ending（放在最后，因为它会终止本局） --- */
await page.evaluate(() => window.__game.resetEnding());
await sleep(400);
await page.evaluate(() => window.__game.applyFx({ integrity: -200 }));
await sleep(900);
const death = await page.evaluate(() => ({
  title: document.getElementById('endTitle').textContent,
  shown: !document.getElementById('ending').classList.contains('hidden'),
  stayHidden: document.getElementById('endStay').style.display === 'none',
  running: window.__game.running
}));
check('完整度归零触发「灵魂消散」Bad Ending', death.shown && death.title === '灵魂消散', JSON.stringify(death));
check('Bad Ending 不可继续（隐藏"留在这里"）', death.stayHidden && death.running === false);
await page.screenshot({ path: `${OUT}/14-bad-ending.png` });

/* ---------------- 崔斯坦线 ---------------- */
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction('window.__game && window.__game.ready', { timeout: 90000 });
await sleep(700);
await page.screenshot({ path: `${OUT}/08-menu-with-save.png` });

await page.click('#route-tristan');
await page.waitForFunction('window.__game.running === true', { timeout: 240000 });
await sleep(2600);
await page.screenshot({ path: `${OUT}/09-tristan-spawn.png` });
check('进入崔斯坦线', (await page.evaluate(() => window.__game.routeId)) === 'tristan');
check('崔斯坦线开场独白自动触发', await page.evaluate(() => window.__game.dialogueActive));
await page.screenshot({ path: `${OUT}/10-tristan-intro.png` });
await advanceAll();

const dylanNpc = await page.evaluate(() => window.__game.npcPos);
await page.evaluate(p => window.__game.teleport(p.x + 2.4, p.z - 2.4), dylanNpc);
await sleep(800);
await page.keyboard.press('KeyE');
await sleep(700);
check('崔斯坦线可与迪伦对话', await page.evaluate(() => window.__game.dialogueActive));
await page.screenshot({ path: `${OUT}/11-tristan-talk.png` });
await advanceAll();
const flags2 = await page.evaluate(() => ({ ...window.__game.state.flags }));
check('崔斯坦线写入 met_dylan', !!flags2.met_dylan, Object.keys(flags2).join(','));
check('迪伦在对话后开始跟随', (await page.evaluate(() => window.__game.npcBehavior)) === 'follow');

await page.keyboard.press('KeyE');
await sleep(700);
check('二次交互触发"确认状态"对话', await page.evaluate(() => window.__game.dialogueActive));
await page.screenshot({ path: `${OUT}/12-check.png` });
await advanceAll();
const flags3 = await page.evaluate(() => ({ ...window.__game.state.flags }));
check('写入 checked_dylan', !!flags3.checked_dylan);
const tTranscript = await page.evaluate(() => window.__game.transcript);
check('崔斯坦线对话含知情描写（完整/裂痕）', /完整|裂痕/.test(tTranscript));

/* ---------------- 汇总 ---------------- */
const shots = fs.readdirSync(OUT).filter(f => f.endsWith('.png'));
check('截图产出', shots.length >= 10, `${shots.length} 张`);
const realErrors = consoleErrors.filter(e => !/favicon/i.test(e));
check('无 JS 运行错误', realErrors.length === 0, realErrors.slice(0, 2).join(' | '));
check('无资源加载失败', failedRequests.length === 0, failedRequests.slice(0, 2).join(' | '));

console.log('\n================ 结果 ================');
const passed = results.filter(r => r.ok).length;
console.log(`${passed}/${results.length} 通过`);

await browser.close();
process.exit(passed === results.length ? 0 : 1);
