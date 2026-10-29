import puppeteer from 'puppeteer-core';

/** 测试跑构建产物（preview 服务器），避免 dev 的 HMR 在测试中途刷新页面 */
const BASE = process.env.BASE || 'http://127.0.0.1:5180/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: false,
  args: ['--no-sandbox', '--mute-audio', '--window-size=1200,800', '--window-position=40,40']
});
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 720 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

await page.goto(BASE, { waitUntil: 'networkidle2' });
await page.waitForFunction('window.__game && window.__game.ready');
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForFunction('window.__game && window.__game.ready');
await page.click('#route-dylan');
await page.waitForFunction('window.__game.running === true', { timeout: 120000 });
await sleep(1800);

const shot = async (name) => {
  await page.screenshot({ path: `shots/${name}.png` });
  console.log('shot', name);
};

const who = process.argv[2] || 'npc';
const npc = await page.evaluate(() => window.__game.npcPos);
// 站到 NPC 正前方，让他转身面向镜头
await page.evaluate((p) => window.__game.teleport(p.x, p.z - 1.7), npc);
await sleep(900);

const head = await page.evaluate((w) => window.__game.headOf(w), who);
console.log('head', JSON.stringify(head.map((n) => +n.toFixed(2))));

// 正前方 0.62m，略低于眼睛高度仰看，避免被刘海挡住
await page.evaluate(({ head, npc }) => {
  window.__game.setDebugCam([npc.x, head[1] - 0.02, npc.z - 0.62], [npc.x, head[1], npc.z]);
  document.getElementById('prompt').classList.add('hidden');
  document.getElementById('lockHint').style.display = 'none';
  document.getElementById('statPanel').classList.add('hidden');
  document.getElementById('questPanel').style.opacity = '0.25';
}, { head, npc });
await sleep(900);
await shot('c6-face-front');

// 侧 45°
await page.evaluate(({ head, npc }) => {
  window.__game.setDebugCam([npc.x + 0.42, head[1] + 0.02, npc.z - 0.5], [npc.x, head[1] - 0.02, npc.z]);
}, { head, npc });
await sleep(700);
await shot('c7-face-side');

await browser.close();
