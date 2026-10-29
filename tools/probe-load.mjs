import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now()-t0)/1000).toFixed(1)}s]`, ...a);
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: false, protocolTimeout: 30000,
  args: ['--no-sandbox','--mute-audio','--window-size=1200,800']
});
const page = await browser.newPage();
await page.setViewport({width:1100,height:700});
page.on('pageerror', e => log('PAGEERROR', e.message));
page.on('console', m => { if (m.type()==='error') log('CONSOLE', m.text().slice(0,160)); });
log('goto');
await page.goto('http://127.0.0.1:5178/', {waitUntil:'domcontentloaded', timeout: 60000});
log('dom ready');
await page.waitForFunction('window.__game && window.__game.ready', {timeout: 60000});
log('game ready');
await page.evaluate(() => { const b = document.getElementById('route-dylan'); b.click(); });
log('clicked (js)');
await page.waitForFunction('window.__game.running === true', {timeout: 120000});
log('running');
await sleep(2000);
log('stats', JSON.stringify(await page.evaluate(() => ({ fps: window.__game.fps, q: window.__game.qualityLevel }))));
await browser.close();
log('closed');
