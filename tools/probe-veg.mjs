import puppeteer from 'puppeteer-core';
const BASE = 'http://127.0.0.1:5180/';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: false, protocolTimeout: 60000,
  args: ['--no-sandbox', '--mute-audio', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion']
});
const page = await browser.newPage();
await page.goto(BASE, { waitUntil: 'networkidle2' });
await page.waitForFunction('window.__game && window.__game.ready', { polling: 100, timeout: 60000 });
console.log('vegStats', JSON.stringify(await page.evaluate(() => window.__game.vegStats), null, 1));
await browser.close();
