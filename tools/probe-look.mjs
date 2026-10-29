/** 俯仰角实测：同一位置分别抬头 / 低头 / 切第一人称抬头，各拍一张 */
import puppeteer from 'puppeteer-core';
const BASE = 'http://127.0.0.1:5180/';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: false, protocolTimeout: 90000,
  args: ['--no-sandbox', '--mute-audio', '--window-size=1400,880', '--window-position=30,30',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling', '--disable-features=CalculateNativeWinOcclusion']
});
const page = await browser.newPage();
await page.setViewport({ width: 1360, height: 760 });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto(BASE, { waitUntil: 'networkidle2' });
await page.waitForFunction('window.__game && window.__game.ready', { polling: 100, timeout: 60000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForFunction('window.__game && window.__game.ready', { polling: 100, timeout: 60000 });
await page.bringToFront();
await page.evaluate(() => document.getElementById('route-dylan').click());
await page.waitForFunction('window.__game.running === true', { polling: 100, timeout: 60000 });
await sleep(1500);
await page.evaluate(() => window.__game.teleport(-9, -40));
await sleep(800);

const look = async (name, yaw, pitch, mode) => {
  await page.evaluate(({ mode }) => {
    if (window.__game.mode !== mode) window.__game.toggleMode();
  }, { mode });
  await page.evaluate(({ yaw, pitch }) => window.__game.look(yaw, pitch), { yaw, pitch });
  await sleep(700);
  const s = await page.evaluate(() => ({
    pitch: +window.__game.pitch.toFixed(3),
    camY: +window.__game.camera.position.y.toFixed(2),
    camZ: +window.__game.camera.position.z.toFixed(2),
    camZ: +window.__game.camera.position.z.toFixed(2),
    headY: +(window.__game.pos.y + 1.5).toFixed(2),
    mode: window.__game.mode
  }));
  console.log(name, JSON.stringify(s));
  await page.screenshot({ path: `shots/look-${name}.png` });
};
await look('third-up', 0, 0.95, 'third');
await look('third-down', 0, -1.45, 'third');
await look('first-up', 0, 1.45, 'first');
await browser.close();
