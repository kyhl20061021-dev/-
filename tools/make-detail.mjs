/**
 * 生成地形细节贴图：把干草贴图压成一张低对比灰度，
 * 乘在顶点色上只增加颗粒感，不改变整体色调。
 */
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs';

const SRC = 'E:/_wb_assets/Textures/T_Terrain_DryGrass_01_A.tif';
const OUT = path.resolve('public/tex/_ground_detail.png');

fs.mkdirSync(path.dirname(OUT), { recursive: true });

// 灰度 → 压缩到 [204, 255]，即乘算系数 0.80~1.0
await sharp(SRC, { failOn: 'none' })
  .resize(512, 512, { fit: 'inside' })
  .grayscale()
  .linear(0.2, 204)
  .png({ compressionLevel: 9 })
  .toFile(OUT);

const st = fs.statSync(OUT);
console.log(`细节贴图 ${OUT}  ${(st.size / 1024).toFixed(0)}KB`);
