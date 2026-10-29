import { WORLD_RADIUS } from '../world/layout.js';

export const BODY_RADIUS = 0.42;

/** 圆形与矩形障碍的推挤式碰撞，够用且稳定 */
export function resolveCollisions(pos, colliders, radius = BODY_RADIUS) {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];

    if (c.r !== undefined) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const min = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const push = (min - d) / d;
        pos.x += dx * push;
        pos.z += dz * push;
      }
      continue;
    }

    if (c.hx !== undefined) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const ox = c.hx + radius - Math.abs(dx);
      const oz = c.hz + radius - Math.abs(dz);
      if (ox > 0 && oz > 0) {
        if (ox < oz) pos.x += dx > 0 ? ox : -ox;
        else pos.z += dz > 0 ? oz : -oz;
      }
    }
  }
}

/**
 * 分步推进 + 逐段碰撞。
 *
 * 单帧位移一旦超过障碍物厚度，推挤式碰撞就会「从前面直接跳到背后」——
 * 表现为穿墙。跑速 7.6 m/s 时只要掉到 20 fps 以下（或切标签页卡一下，
 * rawDt 冲到 200ms 再被 clamp 前已经在别处算过），一步就能到 1.5 m，
 * 而墙的有效排斥带只有 0.22 + 2×0.42 ≈ 1.06 m。所以按 0.12 m 切段推进，
 * 每段都解一次碰撞，段数上限 16（防御性，正常一帧只要 2–4 段）。
 *
 * @param {Vector3} pos      会被就地修改
 * @param {Vector3} delta    本帧位移
 */
export function moveWithCollisions(pos, delta, colliders, radius = BODY_RADIUS) {
  const dist = Math.hypot(delta.x, delta.z);
  const steps = Math.min(16, Math.max(1, Math.ceil(dist / 0.12)));
  const sx = delta.x / steps;
  const sz = delta.z / steps;
  for (let i = 0; i < steps; i++) {
    pos.x += sx;
    pos.z += sz;
    resolveCollisions(pos, colliders, radius);
  }
}

/**
 * 二维线段 vs 矩形（slab 法）。返回进入参数 t∈[0,1]，不相交返回 1。
 * 起点已经在矩形内部时返回 1（不处理），避免镜头贴墙时把自身判成碰撞、
 * 一路收缩到零距离。
 */
export function rayRect(ox, oz, dx, dz, c, pad = 0) {
  const minX = c.x - c.hx - pad, maxX = c.x + c.hx + pad;
  const minZ = c.z - c.hz - pad, maxZ = c.z + c.hz + pad;
  const inside = ox > minX && ox < maxX && oz > minZ && oz < maxZ;
  if (inside) return 1;

  let t0 = 0, t1 = 1;
  const axis = (o, d, lo, hi) => {
    if (Math.abs(d) < 1e-6) return o >= lo && o <= hi;
    let ta = (lo - o) / d, tb = (hi - o) / d;
    if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    return t0 <= t1;
  };
  if (!axis(ox, dx, minX, maxX)) return 1;
  if (!axis(oz, dz, minZ, maxZ)) return 1;
  return t0 > 0 && t0 <= 1 ? t0 : 1;
}

/** 二维线段 vs 圆。返回进入参数 t∈[0,1]，不相交（或起点在内）返回 1。 */
export function rayCircle(ox, oz, dx, dz, c, pad = 0) {
  const r = c.r + pad;
  const fx = ox - c.x, fz = oz - c.z;
  if (fx * fx + fz * fz <= r * r) return 1;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return 1;
  const b = 2 * (fx * dx + fz * dz);
  const cc = fx * fx + fz * fz - r * r;
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return 1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t > 0 && t <= 1 ? t : 1;
}

export function clampToWorld(pos, margin = 2) {
  const d = Math.hypot(pos.x, pos.z);
  const max = WORLD_RADIUS - margin;
  if (d > max) {
    const k = max / d;
    pos.x *= k;
    pos.z *= k;
  }
}

/** 最短角度插值 */
export function lerpAngle(a, b, t) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
