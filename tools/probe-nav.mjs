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
page.on('framenavigated', f => { if (f === page.mainFrame()) console.log('NAV', new Date().toISOString().slice(11,23), f.url().slice(0,80)); });
page.on('error', e => console.log('PAGE CRASH', e.message));
page.on('pageerror', e => console.log('PAGEERROR', e.message));
page.on('console', m => { if (m.type()==='error') console.log('CONSOLE', m.text().slice(0,200)); });
await page.goto(BASE, { waitUntil: 'networkidle2' });
await page.waitForFunction('window.__game && window.__game.ready', { polling: 100, timeout: 60000 });
console.log('-- clear + reload --');
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForFunction('window.__game && window.__game.ready', { polling: 100, timeout: 60000 });
await page.bringToFront();
await new Promise(r=>setTimeout(r,400));
await page.evaluate(() => document.getElementById('route-dylan').click());
await page.waitForFunction('window.__game.running === true', { polling: 100, timeout: 60000 });
console.log('running');
await page.evaluate(() => {
  const s = window.__game.state; s.flags.met_tristan = true; s.flags.mid_talked = true; s.chapter = 4;
  window.__game.teleport(-9, -56);
});
await new Promise(r=>setTimeout(r,1200));
console.log('dlg', await page.evaluate(() => window.__game.dialogueActive), 'ch', await page.evaluate(()=>window.__game.state.chapter));
await new Promise(r=>setTimeout(r,3000));
console.log('after 3s: ch', await page.evaluate(()=>window.__game.state.chapter).catch(e=>'ERR '+e.message));
await browser.close();
