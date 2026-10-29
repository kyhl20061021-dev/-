/**
 * 把 Unity 资源包里的 4K TIF 贴图降采样成网页可用的 PNG。
 * 只处理荒原场景真正会用到的那些，避免把 1.6G 原图搬进项目。
 *
 * 用法：node tools/convert-textures.mjs
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'E:/_wb_assets/Textures';
const OUT = path.resolve('public/tex');

// name -> 目标边长。草地/树叶需要保留 alpha，用于裁剪。
const WANT = {
  T_Grass_01_A: 512,
  T_Grass_02_A: 512,
  T_Grass_03_A: 512,
  T_Flowers_01_A: 512,
  T_Flowers_02_A: 384,
  T_Flowers_03_A: 384,
  T_CoverPlants_01_A: 384,
  T_Plants_01_A: 384,
  T_BirchTree_Bark_01_A: 512,
  T_BirchTree_Bark_02_A: 512,
  T_BirchTree_Leaf_01_A: 512,
  T_OakTree_Bark_01_A: 512,
  T_OakTree_Bark_02_A: 512,
  T_OakTree_Leaf_01_A: 512,
  T_Leaves_01_A: 512,
  T_Ivy_01_A: 384,
  T_Rock_01_A: 512,
  T_Rock_02_A: 512,
  T_Rock_03_A: 512,
  T_Rock_04_A: 512,
  T_Rock_05_A: 512,
  T_Rock_06_A: 512,
  T_Mushroom_Red_01_A: 256,
  T_Mushroom_Brown_01_A: 256,
  T_Log_01_A: 512,
  T_Log_02_A: 512,
  T_Plank_01_A: 512,
  T_Stump_01_A: 256,
  T_Terrain_DryGrass_01_A: 512,
  T_Terrain_Mud_01_A: 512,
  T_RoadDecal_ME_Mud_01_A: 512
};

fs.mkdirSync(OUT, { recursive: true });

const rows = [];
for (const [name, size] of Object.entries(WANT)) {
  const src = path.join(SRC, `${name}.tif`);
  if (!fs.existsSync(src)) {
    rows.push([name, 'MISSING', '-', '-']);
    continue;
  }
  const meta = await sharp(src, { failOn: 'none' }).metadata();
  const img = sharp(src)
    .resize(size, size, { fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: false });

  const outPath = path.join(OUT, `${name}.png`);

  // Windows 上偶发文件占用导致 libvips 写入失败，重试一次即可
  let info = null;
  for (let attempt = 0; attempt < 3 && !info; attempt++) {
    try {
      info = await sharp(src, { failOn: 'none' })
        .resize(size, size, { fit: 'inside', withoutEnlargement: true })
        .png({ compressionLevel: 9 })
        .toFile(outPath);
    } catch (e) {
      if (attempt === 2) {
        rows.push([name, `${meta.width}x${meta.height}`, 'FAIL', e.message.slice(0, 40)]);
        info = null;
      }
      await new Promise(r => setTimeout(r, 250));
    }
  }
  if (!info) continue;
  const kb = (info.size / 1024).toFixed(0);
  rows.push([name, `${meta.width}x${meta.height}`, `${meta.channels}ch${meta.hasAlpha ? '+A' : ''}`, `${info.width}px ${kb}KB`]);
}

const w = [28, 12, 8, 14];
console.log('贴图转换结果');
for (const r of rows) {
  console.log(r.map((c, i) => String(c).padEnd(w[i])).join(''));
}
const total = fs.readdirSync(OUT).reduce((a, f) => a + fs.statSync(path.join(OUT, f)).size, 0);
console.log(`\n共 ${fs.readdirSync(OUT).length} 个文件，合计 ${(total / 1024 / 1024).toFixed(1)} MB`);
