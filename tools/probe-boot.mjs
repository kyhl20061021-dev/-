import puppeteer from 'puppeteer-core';
const BASE = 'http://127.0.0.1:5180/';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: false, protocolTimeout: 60000,
  args: ['--no-sandbox', '--mute-audio', '--window-size=1400,880', '--window-position=30,30',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling', '--disable-features=CalculateNativeWinOcclusion']
});
const page = await browser.newPage();
await page.setViewport({ width: 1360, height: 760 });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto(BASE, { waitUntil: 'networkidle2' });
await page.waitForFunction('window.__game && window.__game.ready', { polling: 100, timeout: 60000 });
await page.evaluate(() => document.getElementById('route-dylan').click());
await page.waitForFunction('window.__game.running === true', { polling: 100, timeout: 60000 }).catch(()=>console.log('!! not running'));
for (let i = 0; i < 6; i++) {
  await new Promise(r => setTimeout(r, 1000));
  const s = await page.evaluate(() => ({
    vis: document.visibilityState, hidden: document.hidden,
    fps: Math.round(window.__game.fps ?? -1), sim: +((window.__game.simTime ?? -1).toFixed(2)),
    ch: window.__game.state.chapter
  }));
  console.log(i, JSON.stringify(s));
}
const t0 = Date.now();
const ok = await page.screenshot({ path: 'shots/_probe.png' }).then(()=>true).catch(e=>e.message);
console.log('shot', ok, Date.now() - t0, 'ms');
await browser.close();
