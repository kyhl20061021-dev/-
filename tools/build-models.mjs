/**
 * 把 Unity 包里的 FBX 批量提取成项目内的紧凑几何文件。
 *
 * 产物：
 *   public/models/<Model>__<Mat>.bin   每个材质部件一份（pos/nor/uv/index）
 *   public/models/models.json          清单：尺寸、部件、顶点数
 *
 * 做法：用真实 Chrome 跑 three 的 FBXLoader（FBX 解析依赖浏览器环境），
 * 在页面里只取 LOD0、按材质拆部件并烘焙变换，再把二进制回传给 Node 落盘。
 *
 * 用法：node tools/build-models.mjs [名字过滤...]
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'E:/_wb_assets/Meshes';
const STAGE = path.resolve('tools/fbx');
const OUT = path.resolve('public/models');
const URL_BASE = 'http://127.0.0.1:5178';

// 只取荒原场景真正用得上的。数量刻意克制：荒原要空。
const MODELS = [
  // 树：白桦细高、橡树粗矮，两种轮廓就够撑起剪影
  'SM_BirchTree_01', 'SM_BirchTree_02', 'SM_BirchTree_03',
  'SM_OakTree_01', 'SM_OakTree_03',
  'SM_Leaves_BirchTree_01', 'SM_Leaves_OakTree_01',
  // 灌木
  'SM_BirchBush_01', 'SM_BirchBush_02', 'SM_BirchBush_03',
  // 草：三种高度
  'SM_Grass_01_01', 'SM_Grass_01_02', 'SM_Grass_02_01',
  'SM_Grass_02_02', 'SM_Grass_03_01', 'SM_Grass_03_02',
  // 花与地被
  'SM_Flower_01_01', 'SM_Flower_02_01', 'SM_Flower_03_01',
  'SM_Flower_05_01', 'SM_Flower_08_01',
  'SM_CoverPlant_01', 'SM_CoverPlant_02', 'SM_CoverPlant_03',
  'SM_Plant_01_01', 'SM_Plant_02_01',
  // 岩石
  'SM_Rock_01', 'SM_Rock_02', 'SM_Rock_03', 'SM_Rock_04',
  'SM_Rock_05', 'SM_Rock_06', 'SM_RockGroup_01', 'SM_RockGroup_02',
  // 蘑菇
  'SM_Mushroom_01', 'SM_Mushroom_02', 'SM_Mushroom_03', 'SM_Mushroom_04',
  // 人迹：原木、树桩、木板、栅栏
  'SM_Log_01', 'SM_Stump_01', 'SM_Plank_01', 'SM_Plank_Group_01', 'SM_Fence_01',
  // 远景
  'SM_Hill_01', 'SM_Mountain_01'
];

const only = process.argv.slice(2);
const list = only.length ? MODELS.filter(m => only.some(o => m.includes(o))) : MODELS;

fs.mkdirSync(STAGE, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const missing = [];
for (const name of list) {
  const from = path.join(SRC, `${name}.fbx`);
  if (!fs.existsSync(from)) { missing.push(name); continue; }
  fs.copyFileSync(from, path.join(STAGE, `${name}.fbx`));
}
if (missing.length) console.log('缺少模型：', missing.join(', '));

/** 顶点法线缺失时按面法线累加补算 */
function fillNormals(pos, idx) {
  const nor = new Float32Array(pos.length);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { nor[k] += nx; nor[k + 1] += ny; nor[k + 2] += nz; }
  }
  for (let i = 0; i < nor.length; i += 3) {
    const l = Math.hypot(nor[i], nor[i + 1], nor[i + 2]) || 1;
    nor[i] /= l; nor[i + 1] /= l; nor[i + 2] /= l;
  }
  return nor;
}

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--no-sandbox', '--mute-audio', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message));

await page.goto(`${URL_BASE}/tools/fbx2glb.html`, { waitUntil: 'networkidle2' });
await page.waitForFunction('window.__ready === true', { timeout: 30000 });

const manifest = {};
const rows = [];
let totalBytes = 0;

for (const name of list) {
  if (missing.includes(name)) continue;
  try {
    const r = await page.evaluate(n => window.convertFbx(`/tools/fbx/${n}.fbx`), name);
    const entry = { size: r.size, parts: [] };

    for (const p of r.parts) {
      const safeMat = String(p.mat).replace(/[^A-Za-z0-9_]/g, '');
      const file = `${name}__${safeMat}.bin`;
      const pos = Buffer.from(p.pos, 'base64');
      const nor = Buffer.from(p.nor, 'base64');
      const uv = Buffer.from(p.uv, 'base64');
      const idx = Buffer.from(p.idx, 'base64');

      let norBuf = nor;
      if (p.needNormal) {
        norBuf = Buffer.from(fillNormals(
          new Float32Array(pos.buffer, pos.byteOffset, pos.byteLength / 4),
          new Uint32Array(idx.buffer, idx.byteOffset, idx.byteLength / 4)
        ).buffer);
      }

      const bin = Buffer.concat([pos, norBuf, uv, idx]);
      fs.writeFileSync(path.join(OUT, file), bin);
      totalBytes += bin.length;

      entry.parts.push({
        mat: p.mat,
        file,
        vertices: p.vertices,
        indices: p.indices,
        bytes: bin.length
      });
    }

    manifest[name] = entry;
    rows.push([
      name,
      entry.parts.map(p => p.mat).join(','),
      entry.parts.reduce((a, p) => a + p.vertices, 0),
      `${r.size.x.toFixed(1)}×${r.size.y.toFixed(1)}×${r.size.z.toFixed(1)}`,
      `${(entry.parts.reduce((a, p) => a + p.bytes, 0) / 1024).toFixed(0)}KB`
    ]);
  } catch (e) {
    rows.push([name, 'FAIL', '-', '-', e.message.slice(0, 40)]);
  }
}

// 合并已有清单，支持只重转个别模型
const mfPath = path.join(OUT, 'models.json');
let merged = {};
if (fs.existsSync(mfPath)) {
  try { merged = JSON.parse(fs.readFileSync(mfPath, 'utf8')); } catch { merged = {}; }
}
Object.assign(merged, manifest);
fs.writeFileSync(mfPath, JSON.stringify(merged, null, 1));

await browser.close();

console.log('\n模型                          材质          顶点    尺寸(x×y×z)         体积');
for (const r of rows) {
  console.log(String(r[0]).padEnd(30) + String(r[1]).padEnd(14) + String(r[2]).padStart(6) + '  ' + String(r[3]).padEnd(21) + r[4]);
}
console.log(`\n成功 ${rows.filter(r => r[1] !== 'FAIL').length}/${rows.length}，本次写入 ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
