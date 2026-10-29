import puppeteer from 'puppeteer-core';
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const OUT='shots';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: false,
  args: ['--no-sandbox','--mute-audio','--window-size=1400,880','--window-position=20,20']
});
const page = await browser.newPage();
await page.setViewport({width:1360,height:760});
page.on('pageerror', e=>console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:5178/', {waitUntil:'networkidle2'});
await page.waitForFunction('window.__game && window.__game.ready');
await page.evaluate(()=>localStorage.clear());
await page.reload({waitUntil:'networkidle2'});
await page.waitForFunction('window.__game && window.__game.ready');
await page.screenshot({path:`${OUT}/v0-menu.png`});
await page.click('#route-dylan');
await page.waitForFunction('window.__game.running===true');
await sleep(2200);
await page.mouse.click(680,400);
await sleep(700);
await page.screenshot({path:`${OUT}/v1-spawn.png`});

const npc = await page.evaluate(()=>window.__game.npcPos);
// 站到 NPC 侧前方，斜看，避免玩家身体完全挡住对方
await page.evaluate(p=>window.__game.teleport(p.x+4.6, p.z-4.4), npc);
await sleep(600);
await page.evaluate(()=>{
  const p = window.__game.pos, n = window.__game.npcPos;
  const yaw = Math.atan2(-(n.x-p.x), -(n.z-p.z));
  window.__game.setYaw(yaw + 0.42);
});
await sleep(900);
await page.screenshot({path:`${OUT}/v2-near-npc.png`});

await page.evaluate(p=>window.__game.teleport(p.x+2.2, p.z-3.2), npc);
await sleep(500);
await page.evaluate(()=>{
  const p = window.__game.pos, n = window.__game.npcPos;
  window.__game.setYaw(Math.atan2(-(n.x-p.x), -(n.z-p.z)) + 0.3);
});
await sleep(900);
await page.screenshot({path:`${OUT}/v3-npc-close.png`});

await page.keyboard.press('KeyE');
await sleep(1800);
await page.screenshot({path:`${OUT}/v4-dialogue.png`});
await page.keyboard.press('Space');
await sleep(1200);

await page.goto('http://127.0.0.1:5178/', {waitUntil:'networkidle2'});
await page.waitForFunction('window.__game && window.__game.ready');
await page.evaluate(()=>localStorage.clear());
await page.reload({waitUntil:'networkidle2'});
await page.waitForFunction('window.__game && window.__game.ready');
await page.click('#route-dylan');
await page.waitForFunction('window.__game.running===true');
await sleep(2000);
await page.evaluate(()=>window.__game.teleport(-9,-30));
await sleep(700);
await page.evaluate(()=>window.__game.setYaw(0));
await sleep(1000);
await page.screenshot({path:`${OUT}/v5-house-far.png`});

await page.evaluate(()=>window.__game.teleport(-9,-58));
await sleep(700);
await page.evaluate(()=>window.__game.setYaw(0.25));
await sleep(900);
await page.screenshot({path:`${OUT}/v6-house-near.png`});
await browser.close();
