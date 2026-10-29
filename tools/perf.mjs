import puppeteer from 'puppeteer-core';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: false, args: ['--no-sandbox','--mute-audio','--window-size=1400,880']
});
const page = await browser.newPage();
await page.setViewport({ width: 1360, height: 760 });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:5178/', { waitUntil: 'networkidle2' });
await page.waitForFunction('window.__game && window.__game.ready');
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForFunction('window.__game && window.__game.ready');
await page.mouse.click(680, 400);
const t0 = Date.now();
await page.click('#route-dylan');
await page.waitForFunction('window.__game.running === true', { timeout: 120000 });
console.log('加载耗时', ((Date.now() - t0) / 1000).toFixed(2), 's');

await sleep(2000);
const fps = await page.evaluate(() => new Promise(res => {
  let n = 0; const t = performance.now();
  const tick = () => { n++; if (performance.now() - t < 3000) requestAnimationFrame(tick); else res(n / ((performance.now() - t) / 1000)); };
  requestAnimationFrame(tick);
}));
console.log('平均帧率', fps.toFixed(1));

const info = await page.evaluate(() => {
  const r = window.__game.renderer;
  let meshes = 0, inst = 0, tris = 0;
  window.__game.scene.traverse(o => {
    if (o.isInstancedMesh) { inst++; meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * o.count; }
    else if (o.isMesh) meshes++;
  });
  return { calls: r.info.render.calls, triangles: r.info.render.triangles, meshes, inst, instTris: Math.round(tris), textures: r.info.memory.textures, geometries: r.info.memory.geometries };
});
console.log(JSON.stringify(info));
await browser.close();
