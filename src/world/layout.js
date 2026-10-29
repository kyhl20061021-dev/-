import * as THREE from 'three';
import { baseHeight } from './heightfield.js';

export const WORLD_RADIUS = 92;
export const PATH_HALF_WIDTH = 1.85;

/** 小路控制点：隧道口 → 荒原 → 安全屋 */
const CTRL = [
  [2, 98], [1, 88], [-1, 78], [-6, 66], [-13, 54], [-15, 42],
  [-8, 30], [3, 18], [9, 4], [7, -12], [-1, -26], [-8, -40],
  [-11, -54], [-9, -66]
].map(([x, z]) => new THREE.Vector3(x, 0, z));

export const pathCurve = new THREE.CatmullRomCurve3(CTRL, false, 'catmullrom', 0.5);

const SAMPLES = 160;
export const PATH_POINTS = pathCurve.getSpacedPoints(SAMPLES);

/** 沿路高程：先取地形高度，再做多轮平滑，形成一条自然下坡的土路 */
const ELEV = new Float32Array(PATH_POINTS.length);
for (let i = 0; i < PATH_POINTS.length; i++) {
  ELEV[i] = baseHeight(PATH_POINTS[i].x, PATH_POINTS[i].z);
}
for (let pass = 0; pass < 4; pass++) {
  const copy = ELEV.slice();
  for (let i = 0; i < ELEV.length; i++) {
    let sum = 0, cnt = 0;
    for (let k = -5; k <= 5; k++) {
      const j = i + k;
      if (j >= 0 && j < copy.length) { sum += copy[j]; cnt++; }
    }
    ELEV[i] = sum / cnt;
  }
}

export function pathElevation(t) {
  const f = Math.min(0.9999, Math.max(0, t)) * (ELEV.length - 1);
  const i = Math.floor(f), a = f - i;
  return ELEV[i] * (1 - a) + ELEV[i + 1] * a;
}

export const TUNNEL_POS = { x: 2, z: 96, y: ELEV[0] };
export const HOUSE_POS = { x: -9, z: -66, y: ELEV[ELEV.length - 1] };
export const TUNNEL_Y = ELEV[0];
export const HOUSE_Y = ELEV[ELEV.length - 1];

/** 靠近路径的最近点信息，返回距离与沿路参数 t */
export function nearestPathInfo(x, z) {
  let best = Infinity, bi = 0;
  for (let i = 0; i < PATH_POINTS.length; i++) {
    const p = PATH_POINTS[i];
    const dx = x - p.x, dz = z - p.z;
    const d = dx * dx + dz * dz;
    if (d < best) { best = d; bi = i; }
  }
  return {
    dist: Math.sqrt(best),
    t: bi / (PATH_POINTS.length - 1),
    y: ELEV[bi]
  };
}

/** 沿路取一点，用于摆放物件与触发器 */
export function pathPointAt(t, offsetX = 0) {
  const p = pathCurve.getPointAt(Math.min(0.9999, Math.max(0, t)));
  return { x: p.x + offsetX, z: p.z, y: pathElevation(t) };
}
