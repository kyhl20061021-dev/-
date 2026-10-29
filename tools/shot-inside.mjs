import puppeteer from 'puppeteer-core';

/** 测试跑构建产物（preview 服务器），避免 dev 的 HMR 在测试中途刷新页面 */
const BASE = process.env.BASE || 'http://127.0.0.1:5180/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: false, protocolTimeout: 120000,
  args: ['--no-sandbox','--mute-audio','--window-size=1400,880','--window-position=30,30']
});
const page = await browser.newPage();
await page.setViewport({ width: 1360, height: 760 });
await page.bringToFront();
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto(BASE, { waitUntil: 'networkidle2' });
await page.waitForFunction('window.__game && window.__game.ready', { polling: 100, timeout: 90000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForFunction('window.__game && window.__game.ready', { polling: 100, timeout: 90000 });
await page.evaluate(() => document.getElementById('route-dylan').click());
await page.waitForFunction('window.__game.running === true', { polling: 100, timeout: 240000 });
await sleep(1500);
await page.evaluate(() => {
  const s = window.__game.state;
  s.flags.met_tristan = true; s.flags.in_house = true; s.flags.reached_house = true;
  s.done['house'] = true; s.done['midway'] = true; s.done['leave-tunnel'] = true;
  window.__game.teleport(-9.3, -64.4);
});
await sleep(900);
await page.evaluate(() => window.__game.setYaw(Math.PI));
await sleep(1200);
await page.screenshot({ path: 'shots/i1-door.png' });

await page.evaluate(() => { window.__game.teleport(-9.2, -65.6); window.__game.setYaw(0.35); });
await sleep(1000);
await page.screenshot({ path: 'shots/i2-fire.png' });

await page.evaluate(() => { window.__game.teleport(-9.0, -66.6); window.__game.setYaw(-1.15); });
await sleep(1000);
await page.screenshot({ path: 'shots/i3-table.png' });

await page.evaluate(() => { window.__game.teleport(-8.6, -65.2); window.__game.setYaw(-1.5); });
await sleep(1000);
await page.screenshot({ path: 'shots/i4-window.png' });

console.log(JSON.stringify(await page.evaluate(() => ({
  cam: window.__game.camera.position.toArray().map(n => +n.toFixed(2)),
  head: window.__game.headOf('player'),
  safe: window.__game.safeHouse
}))));
await browser.close();
