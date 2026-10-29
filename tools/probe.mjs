import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, args: ['--no-sandbox','--mute-audio']
});
const page = await browser.newPage();
page.on('pageerror', e=>console.log('ERR', e.message));
await page.goto('http://127.0.0.1:5178/tools/fbx2glb.html', {waitUntil:'networkidle2'});
await page.waitForFunction('window.__ready===true');
const names = process.argv.slice(2);
const out = await page.evaluate(async (list) => {
  const THREE = await import('/node_modules/.vite/deps/three.js').catch(()=>import('three'));
  const { FBXLoader } = await import('/node_modules/.vite/deps/three_examples_jsm_loaders_FBXLoader__js.js').catch(()=>import('three/examples/jsm/loaders/FBXLoader.js'));
  const res = {};
  for (const n of list) {
    const root = await new FBXLoader().loadAsync(`/tools/fbx/${n}.fbx`);
    const meshes = [];
    root.traverse(o => {
      if (o.isMesh) meshes.push({
        name: o.name,
        mat: Array.isArray(o.material) ? o.material.map(m=>m&&m.name) : (o.material && o.material.name),
        mats: Array.isArray(o.material) ? o.material.length : 1,
        groups: o.geometry.groups ? o.geometry.groups.length : 0,
        verts: o.geometry.attributes.position.count,
        hasUv: !!o.geometry.attributes.uv
      });
    });
    res[n] = meshes.slice(0, 12);
  }
  return res;
}, names);
console.log(JSON.stringify(out, null, 1));
await browser.close();
