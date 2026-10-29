import puppeteer from 'puppeteer-core';
const BASE = 'http://127.0.0.1:5180/';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: false, protocolTimeout: 90000,
  args: ['--no-sandbox', '--mute-audio', '--window-size=1400,880', '--window-position=30,30',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling', '--disable-features=CalculateNativeWinOcclusion']
});
const page = await browser.newPage();
await page.setViewport({ width: 1360, height: 760 });
const failed = [];
page.on('requestfailed', r => failed.push(r.url().replace(BASE, '') + '  ' + (r.failure()?.errorText || '')));
page.on('response', r => { if (r.status() >= 400) failed.push(r.url().replace(BASE, '') + '  HTTP ' + r.status()); });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto(BASE, { waitUntil: 'networkidle2' });
await page.waitForFunction('window.__game && window.__game.ready', { polling: 100, timeout: 60000 });
await page.evaluate(() => document.getElementById('route-dylan').click());
await page.waitForFunction('window.__game.running === true', { polling: 100, timeout: 60000 });
await new Promise(r => setTimeout(r, 4000));
console.log('加载失败数：', failed.length);
failed.slice(0, 20).forEach(f => console.log('  X', f));
// 树皮贴图是否真的解码成功（width>0 说明拿到了像素）
const tex = await page.evaluate(() => {
  const out = [];
  window.__game.scene.traverse(o => {
    const m = o.material;
    if (!m || !m.map) return;
    const src = m.map.image?.src || '';
    if (src.includes('Bark')) out.push({ src: src.split('/').pop(), w: m.map.image.width || 0 });
  });
  return [...new Map(out.map(o => [o.src, o])).values()];
});
console.log('树皮贴图：', JSON.stringify(tex));
await page.screenshot({ path: 'shots/asset-check.png' });
await browser.close();
