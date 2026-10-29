/** 室内亮度验收：进屋 → 朝里 / 朝门 / 朝壁炉 各拍一张 */
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE || 'http://127.0.0.1:5180/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: false, protocolTimeout: 180000,
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
await sleep(1000);

const h = await page.evaluate(() => window.__game.housePos);
await page.evaluate((h) => window.__game.teleport(h.x - 0.6, h.z + 0.4), h);
await page.evaluate(() => window.__game.look(0, -0.12));
await sleep(900);
await page.screenshot({ path: 'shots/in-a-back.png' });
await page.evaluate(() => window.__game.look(Math.PI, -0.12));
await sleep(900);
await page.screenshot({ path: 'shots/in-b-door.png' });
await page.evaluate(() => window.__game.look(-1.45, -0.1));
await sleep(900);
await page.screenshot({ path: 'shots/in-c-fire.png' });
console.log('safeHouse', await page.evaluate(() => window.__game.safeHouse));
await browser.close();
