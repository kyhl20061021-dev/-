import * as THREE from 'three';
import { baseHeight } from './heightfield.js';
import {
  nearestPathInfo, pathElevation, PATH_HALF_WIDTH,
  TUNNEL_POS, HOUSE_POS, TUNNEL_Y, HOUSE_Y
} from './layout.js';
import { smoothstep, clamp } from '../core/noise.js';

const SIZE = 244;
const SEG = 172;

/** 未整平的地形高度 */
function rawHeight(x, z) {
  const info = nearestPathInfo(x, z);
  const w = 1 - smoothstep(PATH_HALF_WIDTH, PATH_HALF_WIDTH + 6.5, info.dist);
  return baseHeight(x, z) * (1 - w) + info.y * w;
}

function pad(h, x, z, cx, cz, y, r, fade) {
  const d = Math.hypot(x - cx, z - cz);
  const w = 1 - smoothstep(r, r + fade, d);
  return h * (1 - w) + y * w;
}

/** 游戏内唯一的地形高度来源：角色、道具、相机都用它 */
export function heightAt(x, z) {
  let h = rawHeight(x, z);
  h = pad(h, x, z, TUNNEL_POS.x, TUNNEL_POS.z, TUNNEL_Y, 7, 7);
  h = pad(h, x, z, HOUSE_POS.x, HOUSE_POS.z, HOUSE_Y, 9, 8);
  return h;
}

const C_GRASS = new THREE.Color(0x4f5f4c);
const C_GRASS_DARK = new THREE.Color(0x38453a);
const C_DIRT = new THREE.Color(0x7a6a52);
const C_ROCK = new THREE.Color(0x5f666c);

export function buildTerrain(scene) {
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const count = pos.count;

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  const nrm = geo.attributes.normal;
  const colors = new Float32Array(count * 3);
  const tmp = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = pos.getY(i);

    const info = nearestPathInfo(x, z);
    const m = 1 - smoothstep(1.55, 4.8, info.dist);
    const slope = 1 - nrm.getY(i);

    const patch = 0.5 + 0.5 * Math.sin(x * 0.31 + z * 0.17) * Math.cos(z * 0.23 - x * 0.11);
    tmp.copy(C_GRASS).lerp(C_GRASS_DARK, clamp(patch * 0.85, 0, 1));
    tmp.lerp(C_DIRT, m * 0.9);
    tmp.lerp(C_ROCK, smoothstep(0.28, 0.6, slope));

    const shade = 0.78 + 0.22 * smoothstep(-4, 14, y);
    colors[i * 3] = tmp.r * shade;
    colors[i * 3 + 1] = tmp.g * shade;
    colors[i * 3 + 2] = tmp.b * shade;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

  // 叠一层低对比灰度细节：只加颗粒，不改色调。没加载完时退化为纯顶点色。
  const detail = new THREE.TextureLoader().load('/tex/_ground_detail.png');
  detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
  detail.repeat.set(23, 23);
  detail.colorSpace = THREE.SRGBColorSpace;
  detail.anisotropy = 4;
  mat.map = detail;

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  scene.add(mesh);

  return mesh;
}

export { pathElevation };
