/**
 * 手感与观感验收：
 *   1. 白天化之后的荒原 / 房子外观
 *   2. 撞墙不穿模（正面顶墙 4 秒，坐标不许进屋）
 *   3. 第三人称镜头贴墙时不许「透」进墙里
 *   4. 崔斯坦带路：行为是否 lead、是否真的在玩家斜前方
 *   5. 抬头 / 低头仍然正常
 */
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:5180/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [];
const ok = (name, pass, extra = '') => {
  out.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
};

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: false,
  protocolTimeout: 180000,
  args: ['--no-sandbox', '--mute-audio', '--window-size=1400,880', '--window-position=40,40',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling', '--disable-features=CalculateNativeWinOcclusion']
});
const page = await browser.newPage();
await page.setViewport({ width: 1360, height: 760 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

await page.goto(BASE, { waitUntil: 'networkidle2' });
await page.waitForFunction('window.__game && window.__game.ready', { polling: 100, timeout: 60000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForFunction('window.__game && window.__game.ready', { polling: 100, timeout: 60000 });
await page.bringToFront();
await page.evaluate(() => document.getElementById('route-dylan').click());
await page.waitForFunction('window.__game.running === true', { polling: 100, timeout: 90000 });
await sleep(1200);

const house = await page.evaluate(() => window.__game.housePos);
const pos = () => page.evaluate(() => window.__game.pos);

/* ---------------- 1. 白天化的荒原 ---------------- */
await page.evaluate(() => window.__game.teleport(-9, -40));
await page.evaluate(() => window.__game.look(0.15, -0.1));
await sleep(1200);
await page.screenshot({ path: 'shots/day-wide.png' });
ok('荒原基调截图', true);

/* ---------------- 2. 正面顶墙：不许穿过去 ---------------- */
// 站在后墙外侧，朝 +z（yaw = π）正对墙
await page.evaluate((h) => {
  window.__game.teleport(h.x, h.z - 7);
  window.__game.look(Math.PI, -0.05);
}, house);
await sleep(400);
const before = await pos();
await page.keyboard.down('KeyW');
await sleep(4000);
await page.keyboard.up('KeyW');
await sleep(300);
const after = await pos();
// 后墙在 z = cz - 2.19，玩家半径 0.42，墙半厚 0.11 → 应停在 cz - 2.72 之外
const wallZ = house.z - 2.19;
const stopZ = after.z;
const penetrated = stopZ > wallZ + 0.05;
ok('正面撞后墙不穿透', !penetrated,
  `起 z=${before.z.toFixed(2)} → 止 z=${stopZ.toFixed(2)}（墙心 z=${wallZ.toFixed(2)}）`);
await page.screenshot({ path: 'shots/day-wall.png' });

/* ---------------- 3. 镜头贴墙不许穿进墙里 ---------------- */
// 站在房子**后面**、面朝 -z（背离房子）：第三人称镜头正好落在房子内部，
// 没有避障时画面会变成「从墙里往外看」，这就是玩家说的「透过去」
await page.evaluate((h) => {
  window.__game.teleport(h.x, h.z - 5.2);   // 后墙外 3 米
  window.__game.look(0, -0.05);             // yaw=0 → 视线朝 -z，镜头在 +z 侧（房子那边）
}, house);
await sleep(1600);
const cam = await page.evaluate(() => {
  const c = window.__game.camera.position;
  return { x: c.x, y: c.y, z: c.z };
});
// 房子内部 z ∈ [cz-2.3, cz+2.3]、x ∈ [x-2.81, x+2.81]
const inside = Math.abs(cam.x - house.x) < 2.6 && Math.abs(cam.z - house.z) < 2.15;
ok('第三人称镜头不进屋', !inside,
  `camera x=${cam.x.toFixed(2)} z=${cam.z.toFixed(2)} 房心 x=${house.x} z=${house.z}`);
await page.screenshot({ path: 'shots/day-camera.png' });

/* ---------------- 4. 崔斯坦带路 ---------------- */
await page.evaluate((h) => {
  window.__game.state.flags.met_tristan = true;
  window.__game.teleport(h.x + 14, h.z + 12);   // 离房子远一点，避免屋里切 follow
  window.__game.npcTo(h.x + 12, h.z + 12);
  window.__game.look(0.9, -0.08);
}, house);
await sleep(300);
await page.keyboard.down('KeyW');
await sleep(2600);
await page.keyboard.up('KeyW');
await sleep(900);
const lead = await page.evaluate(() => {
  const p = window.__game.pos;
  const n = window.__game.npcPos;
  return {
    behavior: window.__game.npcBehavior,
    dist: Math.hypot(n.x - p.x, n.z - p.z),
    ahead: (n.x - p.x) * -Math.sin(window.__game.yaw) * 0 +
          0 // 下方单独算
  };
});
const spatial = await page.evaluate(() => {
  const p = window.__game.pos;
  const n = window.__game.npcPos;
  const dir = { x: -Math.sin(window.__game.yaw), z: -Math.cos(window.__game.yaw) };
  const rel = { x: n.x - p.x, z: n.z - p.z };
  const L = Math.hypot(rel.x, rel.z) || 1;
  // 点积 > 0 说明 NPC 在玩家前方（这里用玩家移动方向近似镜头朝向）
  return { dot: (rel.x * dir.x + rel.z * dir.z) / L, dist: L };
});
ok('崔斯坦是 lead 行为', lead.behavior === 'lead', `behavior=${lead.behavior}`);
ok('带路时走在前方', spatial.dot > 0.25,
  `前方投影=${spatial.dot.toFixed(2)} 距离=${spatial.dist.toFixed(2)}m`);
await page.screenshot({ path: 'shots/day-lead.png' });

/* ---------------- 5. 俯仰仍正常 ---------------- */
await page.evaluate(() => { window.__game.look(0.4, 0.9); });
await sleep(900);
const pitch = await page.evaluate(() => window.__game.pitch);
await page.screenshot({ path: 'shots/day-up.png' });
ok('抬头可用', Math.abs(pitch - 0.9) < 0.06, `pitch=${pitch.toFixed(3)}`);

await browser.close();
out.forEach((l) => console.log(l));
const fails = out.filter((l) => l.startsWith('FAIL')).length;
console.log(`\n${out.length - fails}/${out.length} 通过`);
process.exit(fails ? 1 : 0);
