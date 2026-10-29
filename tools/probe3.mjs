import puppeteer from 'puppeteer-core';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:false, args:['--no-sandbox','--mute-audio']});
const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:5178/', {waitUntil:'networkidle2'});
await page.waitForFunction('window.__game && window.__game.ready');
await page.click('#route-dylan');
await page.waitForFunction('window.__game.running===true', {timeout:120000});
await sleep(1500);
console.log(JSON.stringify(await page.evaluate(() => {
  const t = window.__game.scene.getObjectByName('terrain');
  const m = t.material;
  return {
    hasMap: !!m.map,
    imgLoaded: !!(m.map && m.map.image && m.map.image.width),
    repeat: m.map ? m.map.repeat.toArray() : null,
    program: !!m.program,
    needsUpdate: m.needsUpdate,
    vColors: m.vertexColors,
    size: m.map && m.map.image ? [m.map.image.width, m.map.image.height] : null
  };
})));
await browser.close();
