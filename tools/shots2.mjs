import puppeteer from 'puppeteer-core';

/** 测试跑构建产物（preview 服务器），避免 dev 的 HMR 在测试中途刷新页面 */
const BASE = process.env.BASE || 'http://127.0.0.1:5180/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = 'shots';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: false,
  args: ['--no-sandbox','--mute-audio','--window-size=1400,880','--window-position=20,20']
});
const page = await browser.newPage();
await page.setViewport({ width: 1360, height: 760 });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
page.on('console', m => { const t = m.text(); if (m.type()==='error' || t.includes('vegetation')) console.log('LOG', t.slice(0,300)); });

await page.goto(BASE, { waitUntil: 'networkidle2' });
await page.waitForFunction('window.__game && window.__game.ready');
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForFunction('window.__game && window.__game.ready');
await page.mouse.click(680, 400);
await page.click('#route-dylan');
await page.waitForFunction('window.__game.running === true', { timeout: 120000 });
await sleep(2500);
await page.mouse.click(680, 400);
await sleep(900);

console.log('stats', JSON.stringify(await page.evaluate(() => window.__game.vegStats)));
await page.screenshot({ path: `${OUT}/p1-spawn.png` });

async function view(name, x, z, yaw) {
  await page.evaluate(({x,z,yaw}) => { window.__game.teleport(x,z); window.__game.setYaw(yaw); }, {x,z,yaw});
  await sleep(1100);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name);
}

await view('p2-path', -6, 66, 2.6);
await view('p3-trees', 8, 18, 3.6);
await view('p4-house', -9, -50, 0.1);
await view('p5-wide', 20, -10, 2.2);

// 靠近一丛真实草，检查贴图与裁剪
const g = await page.evaluate(() => {
  let target = null;
  window.__game.scene.traverse(o => {
    if (target) return;
    if (o.isInstancedMesh && o.name.startsWith('veg:SM_Grass') && o.count > 0) {
      const arr = o.instanceMatrix.array;
      // 挑一个离玩家出生点最近的实例
      let best = Infinity, bi = -1;
      for (let i = 0; i < o.count; i++) {
        const x = arr[i*16+12], z = arr[i*16+14];
        const d = Math.hypot(x - (-2), z - 40);
        if (d < best) { best = d; bi = i; }
      }
      target = { x: arr[bi*16+12], z: arr[bi*16+14], name: o.name };
    }
  });
  return target;
});
console.log('grass', JSON.stringify(g));
if (g) {
  await page.evaluate(({x,z}) => { window.__game.teleport(x, z + 2.4); window.__game.setYaw(0); }, g);
  await sleep(1200);
  await page.screenshot({ path: `${OUT}/p6-grass.png` });
  console.log('shot p6-grass');
}

await browser.close();
