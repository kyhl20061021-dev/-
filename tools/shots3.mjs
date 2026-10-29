import puppeteer from 'puppeteer-core';

/** 测试跑构建产物（preview 服务器），避免 dev 的 HMR 在测试中途刷新页面 */
const BASE = process.env.BASE || 'http://127.0.0.1:5180/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = 'shots';

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: false,
  args: ['--no-sandbox', '--mute-audio', '--window-size=1400,880', '--window-position=20,20']
});
const page = await browser.newPage();
await page.setViewport({ width: 1360, height: 760 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)); });

await page.goto(BASE, { waitUntil: 'networkidle2' });
await page.waitForFunction('window.__game && window.__game.ready');
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForFunction('window.__game && window.__game.ready');

const t0 = Date.now();
await page.click('#route-dylan');
await page.waitForFunction('window.__game.running === true', { timeout: 180000 });
console.log('load', ((Date.now() - t0) / 1000).toFixed(1), 's');
await sleep(2200);
await page.mouse.click(680, 400);
await sleep(600);
await page.screenshot({ path: `${OUT}/c1-stats.png` });
console.log('stats', JSON.stringify(await page.evaluate(() => window.__game.stats)));

/* 1. 近景看崔斯坦的钴蓝色眼睛（第一人称贴近） */
const npc = await page.evaluate(() => window.__game.npcPos);
await page.evaluate((p) => {
  window.__game.teleport(p.x + 0.15, p.z - 1.35);
  const q = window.__game.pos;
  window.__game.setYaw(Math.atan2(-(p.x - q.x), -(p.z - q.z)));
}, npc);
await sleep(500);
await page.keyboard.press('KeyV');
await sleep(1200);
await page.screenshot({ path: `${OUT}/c2-eyes-closeup.png` });
console.log('eyeCloseup ok');
await page.keyboard.press('KeyV');
await sleep(300);

/* 2. 数值：扣完整度看 HUD 变化与心像投射 */
const before = await page.evaluate(() => ({ fog: window.__game.fogDensity, s: window.__game.stats }));
await page.evaluate(() => window.__game.applyFx({ integrity: -35, trust: 8 }));
await sleep(1400);
const after = await page.evaluate(() => ({ fog: window.__game.fogDensity, s: window.__game.stats, tension: window.__game.tension }));
console.log('before', JSON.stringify(before));
console.log('after ', JSON.stringify(after));
await page.screenshot({ path: `${OUT}/c3-damaged.png` });

/* 3. 羁绊升高：雾色偏暖一点点 */
await page.evaluate(() => window.__game.applyFx({ trust: 55 }));
await sleep(1600);
await page.screenshot({ path: `${OUT}/c4-bond.png` });

/* 4. 安全屋：进入后投影回落 */
await page.evaluate(() => {
  window.__game.teleport(-9, -60);
  window.__game.setYaw(0.15);
});
await sleep(2500);
console.log('atHouse', JSON.stringify(await page.evaluate(() => ({
  safe: window.__game.safeHouse,
  fog: window.__game.fogDensity,
  integrity: window.__game.stats.integrity
}))));
await page.screenshot({ path: `${OUT}/c5-safehouse.png` });

await browser.close();
