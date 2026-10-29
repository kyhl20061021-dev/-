import puppeteer from 'puppeteer-core';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: false, protocolTimeout: 20000,
  args: ['--no-sandbox','--mute-audio','--window-size=1200,800']
});
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 700 });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
page.on('console', m => console.log('CONSOLE[' + m.type() + ']', m.text().slice(0, 180)));
page.on('requestfailed', r => console.log('REQFAIL', r.url().slice(-40), r.failure()?.errorText));
await page.goto('http://127.0.0.1:5178/', { waitUntil: 'networkidle2' });
await page.waitForFunction('window.__game && window.__game.ready', { timeout: 60000 });
console.log('ready');
await page.evaluate(() => document.getElementById('route-dylan').click());
for (let i = 0; i < 6; i++) {
  await sleep(2000);
  try {
    const st = await page.evaluate(() => ({
      running: window.__game.running,
      load: document.querySelector('#loading .lt')?.textContent || '',
      hidden: document.getElementById('loading').classList.contains('hidden'),
      decorated: !!(window.__game.vegStats)
    }));
    console.log(i, JSON.stringify(st));
  } catch (e) {
    console.log(i, 'EVAL FAIL', e.message.slice(0, 60));
  }
}
await page.screenshot({ path: 'shots/probe2.png' });
await browser.close();
