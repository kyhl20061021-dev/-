import { makeNoise2D, smoothstep } from '../core/noise.js';

const n = makeNoise2D(20261028);

/**
 * 荒原的基础起伏（不含小路与建筑的整平）。
 * 中央是缓坡，越往外越是抬升的丘陵，边缘形成一圈"看得见但走不到"的山影。
 */
export function baseHeight(x, z) {
  let h = n(x * 0.010, z * 0.010) * 10.0;
  h += n(x * 0.035, z * 0.035) * 3.2;
  h += n(x * 0.091, z * 0.091) * 0.85;

  const d = Math.hypot(x, z * 0.86);
  h += smoothstep(52, 112, d) * 17;

  // 几处固定的土丘，让地形有可辨认的地标
  h += bump(x, z, -34, 26, 26, 7.5);
  h += bump(x, z, 30, -18, 30, 9.0);
  h += bump(x, z, -40, -40, 24, 6.0);
  return h;
}

function bump(x, z, cx, cz, r, amp) {
  const d = Math.hypot(x - cx, z - cz);
  if (d > r) return 0;
  const t = 1 - d / r;
  return t * t * amp;
}
