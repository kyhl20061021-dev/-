/**
 * 荒原植被：把 Unity《Meadow Environment》资源包里的模型铺进场景。
 *
 * 设计要点——「荒芜」不是靠删东西，是靠「肥力岛」：
 * 用一层低频噪声当作土壤肥力，只有肥力高的地方才长草长树，其余保持裸露。
 * 于是画面自然形成大片空地 + 小片残余植被，比均匀撒满更像一片被消耗过的土地。
 *
 * 所有物件都用 InstancedMesh，一个物种一次绘制调用。
 * 模型顶点已按「最长边 = 1」归一化，因此实例的 size 就是该物体最长边的米数。
 */
import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { nearestPathInfo, TUNNEL_POS, HOUSE_POS } from './layout.js';
import { makeRng, makeNoise2D, smoothstep, clamp } from '../core/noise.js';

const MODEL_BASE = '/models/';
const TEX_BASE = '/tex/';

const rng = makeRng(20261029);
const nz = makeNoise2D(4242);

/** 这些材质是插片（草叶、花瓣、树叶），需要 alpha 裁切与双面 */
const FOLIAGE_MATS = new Set([
  'Leaf', 'Grass_01', 'Grass_02', 'Grass_03',
  'Flowers_01', 'Flowers_02', 'Cover Plants', 'Plants_01', 'Plants', 'Ivy'
]);

/** 低频肥力场：决定哪里还有生命力 */
function fbm(x, z) {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < 4; i++) {
    v += nz(x * f, z * f) * amp;
    amp *= 0.5;
    f *= 2.07;
  }
  return clamp(v * 0.95 + 0.5, 0, 1);
}

const fert = (x, z) => fbm(x * 0.028, z * 0.028);

/* ------------------------------------------------------------------ */
/* 贴图与材质                                                          */
/* ------------------------------------------------------------------ */

const texCache = new Map();
function texture(name) {
  if (texCache.has(name)) return texCache.get(name);
  const t = new THREE.TextureLoader().load(`${TEX_BASE}${name}.png`);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  texCache.set(name, t);
  return t;
}

const matCache = new Map();
function material(texName, { foliage = false, tint = 0xffffff } = {}) {
  const key = `${texName}|${foliage}|${tint}`;
  if (matCache.has(key)) return matCache.get(key);

  const mat = new THREE.MeshLambertMaterial({
    map: texture(texName),
    color: tint,
    side: foliage ? THREE.DoubleSide : THREE.FrontSide,
    // 插片必须靠 alpha 裁切；不用 transparent，避免透明排序问题
    alphaTest: foliage ? 0.42 : 0,
    transparent: false
  });
  matCache.set(key, mat);
  return mat;
}

/* ------------------------------------------------------------------ */
/* 几何体加载                                                          */
/* ------------------------------------------------------------------ */

/**
 * 二进制布局：pos(v*3 f32) + nor(v*3 f32) + uv(v*2 f32) + index(i u32)
 * 顶点按最长边归一化到 1，实例缩放即实际尺寸。
 */
async function loadGeometry(part, norm) {
  const buf = await (await fetch(MODEL_BASE + part.file)).arrayBuffer();
  const v = part.vertices;
  const posBytes = v * 3 * 4;
  const norBytes = v * 3 * 4;
  const uvBytes = v * 2 * 4;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf, 0, v * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(buf, posBytes, v * 3), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(buf, posBytes + norBytes, v * 2), 2));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, posBytes + norBytes + uvBytes, part.indices), 1));

  const s = 1 / norm;
  geo.scale(s, s, s);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/* ------------------------------------------------------------------ */
/* 摆放工具                                                            */
/* ------------------------------------------------------------------ */

const placed = [];
const occupied = (x, z, r, gap = 0) =>
  placed.some(p => (p.x - x) ** 2 + (p.z - z) ** 2 < (p.r + r + gap) ** 2);

function slopeAt(x, z) {
  const d = 1.2;
  const hx = heightAt(x + d, z) - heightAt(x - d, z);
  const hz = heightAt(x, z + d) - heightAt(x, z - d);
  return Math.hypot(hx, hz) / (2 * d);
}

function samplePoint({ radius = 84, minPath = 2.2, maxPath = 999, maxSlope = 0.55, clear = 5 } = {}) {
  for (let i = 0; i < 60; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * radius;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;

    const info = nearestPathInfo(x, z);
    if (info.dist < minPath || info.dist > maxPath) continue;
    if (Math.hypot(x - HOUSE_POS.x, z - HOUSE_POS.z) < clear + 4) continue;
    if (Math.hypot(x - TUNNEL_POS.x, z - TUNNEL_POS.z) < clear) continue;
    if (slopeAt(x, z) > maxSlope) continue;

    return { x, z, y: heightAt(x, z), pathDist: info.dist, pathT: info.t };
  }
  return null;
}

function buildInstanced(geo, mat, transforms, { castShadow = false, receiveShadow = true, name = '' } = {}) {
  if (!transforms.length) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, transforms.length);
  mesh.name = name;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();

  transforms.forEach((t, i) => {
    e.set(t.tiltX || 0, t.yaw || 0, t.tiltZ || 0, 'YXZ');
    q.setFromEuler(e);
    p.set(t.x, t.y, t.z);
    const g = t.girth ?? 1;
    s.set(t.size * g, t.size, t.size * g);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);

    if (t.color) {
      col.setRGB(t.color[0], t.color[1], t.color[2]);
      mesh.setColorAt(i, col);
    }
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere?.();
  return mesh;
}

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

export async function decorate(scene, { colliders = [], onProgress = null } = {}) {
  const res = await fetch(`${MODEL_BASE}models.json`);
  if (!res.ok) throw new Error('models.json 读取失败');
  const manifest = await res.json();

  const names = Object.keys(manifest).filter(k => manifest[k]?.parts?.length);
  let loaded = 0;

  const geoCache = new Map();
  async function geo(name) {
    if (geoCache.has(name)) return geoCache.get(name);
    const entry = manifest[name];
    if (!entry) throw new Error(`缺少模型 ${name}`);

    // 按最长边归一化
    const s = entry.size;
    const norm = Math.max(s.x, s.y, s.z) || 1;

    const parts = new Map();
    for (const part of entry.parts) {
      parts.set(part.mat, await loadGeometry(part, norm));
    }
    geoCache.set(name, parts);
    loaded++;
    onProgress?.(loaded, names.length);
    return parts;
  }

  const group = new THREE.Group();
  group.name = 'vegetation';
  scene.add(group);

  const stats = {};

  /**
   * @param tex     材质名 → 贴图名
   * @param forceFoliage 用于整体都是插片的物种（草、花）
   */
  function add(name, parts, transforms, opts) {
    if (!transforms.length) return;
    for (const [matName, geometry] of parts) {
      const texName = opts.tex[matName] || opts.tex.default;
      if (!texName) continue;

      const isFoliage = opts.foliage || FOLIAGE_MATS.has(matName);
      const mat = material(texName, {
        foliage: isFoliage,
        tint: opts.tint?.[matName] ?? opts.tint?.default ?? 0xffffff
      });

      const cast = !!opts.castShadow;
      const mesh = buildInstanced(geometry, mat, transforms, {
        castShadow: cast,
        receiveShadow: !isFoliage,
        name: `veg:${name}:${matName}`
      });
      if (!mesh) continue;

      // 插片投影要带 alpha 裁切，否则阴影是整块方片
      if (cast && isFoliage) {
        mesh.customDepthMaterial = new THREE.MeshDepthMaterial({
          depthPacking: THREE.RGBADepthPacking,
          map: texture(texName),
          alphaTest: 0.45
        });
      }
      group.add(mesh);
    }
    stats[opts.key] = (stats[opts.key] || 0) + transforms.length;
  }

  /* ---------------- 乔木 ---------------- */
  const TREE_TEX = {
    SM_BirchTree_01: { Bark: 'T_BirchTree_Bark_01_A', Leaf: 'T_BirchTree_Leaf_01_A' },
    SM_BirchTree_02: { Bark: 'T_BirchTree_Bark_01_A', Leaf: 'T_BirchTree_Leaf_01_A' },
    SM_BirchTree_03: { Bark: 'T_BirchTree_Bark_02_A', Leaf: 'T_BirchTree_Leaf_01_A' },
    SM_OakTree_01: { Bark: 'T_OakTree_Bark_01_A', Leaf: 'T_OakTree_Leaf_01_A' },
    SM_OakTree_03: { Bark: 'T_OakTree_Bark_02_A', Leaf: 'T_OakTree_Leaf_01_A' }
  };

  const BARK_TINT = 0xd9d2c2;
  const LEAF_TINT = 0x9fb393;

  const treePlans = [
    { keys: ['SM_BirchTree_01', 'SM_BirchTree_02'], count: 11, size: [6.6, 9.6], thin: 0.94 },
    { keys: ['SM_BirchTree_03'], count: 6, size: [5.0, 7.2], thin: 0.92 },
    { keys: ['SM_OakTree_01', 'SM_OakTree_03'], count: 8, size: [5.8, 8.4], thin: 1.04 }
  ];

  const treeBuckets = new Map();
  let guard = 0;
  for (const plan of treePlans) {
    let made = 0;
    while (made < plan.count && guard++ < 12000) {
      const p = samplePoint({ radius: 82, minPath: 3.6, maxSlope: 0.42, clear: 6 });
      if (!p) continue;
      if (rng() > smoothstep(0.30, 0.66, fert(p.x, p.z))) continue;

      const name = plan.keys[Math.floor(rng() * plan.keys.length)];
      const size = plan.size[0] + rng() * (plan.size[1] - plan.size[0]);
      const trunkR = Math.max(0.26, size * 0.035);
      if (occupied(p.x, p.z, trunkR * 2.4, 1.4)) continue;

      placed.push({ x: p.x, z: p.z, r: trunkR * 2.4 });
      colliders.push({ x: p.x, z: p.z, r: trunkR });

      const t = {
        x: p.x,
        y: p.y - size * 0.015,
        z: p.z,
        yaw: rng() * Math.PI * 2,
        size,
        girth: plan.thin * (0.92 + rng() * 0.18),
        tiltX: (rng() - 0.5) * 0.05,
        tiltZ: (rng() - 0.5) * 0.05,
        color: [0.86 + rng() * 0.18, 0.86 + rng() * 0.18, 0.84 + rng() * 0.18]
      };
      if (!treeBuckets.has(name)) treeBuckets.set(name, []);
      treeBuckets.get(name).push(t);
      made++;
    }
  }

  for (const [name, list] of treeBuckets) {
    add(name, await geo(name), list, {
      key: 'trees',
      tex: TREE_TEX[name],
      tint: { Bark: BARK_TINT, Leaf: LEAF_TINT, default: LEAF_TINT },
      castShadow: true
    });
  }

  /* ---------------- 灌木 ---------------- */
  const bushBuckets = new Map();
  guard = 0;
  let bushes = 0;
  while (bushes < 16 && guard++ < 6000) {
    const p = samplePoint({ radius: 80, minPath: 2.8, maxSlope: 0.5, clear: 5 });
    if (!p) continue;
    if (rng() > smoothstep(0.26, 0.6, fert(p.x, p.z))) continue;

    const name = ['SM_BirchBush_01', 'SM_BirchBush_02', 'SM_BirchBush_03'][Math.floor(rng() * 3)];
    const size = 1.1 + rng() * 1.0;
    if (occupied(p.x, p.z, size * 0.4, 0.6)) continue;
    placed.push({ x: p.x, z: p.z, r: size * 0.4 });

    const t = {
      x: p.x, y: p.y - size * 0.03, z: p.z,
      yaw: rng() * Math.PI * 2,
      size,
      girth: 0.95 + rng() * 0.2,
      color: [0.8 + rng() * 0.2, 0.82 + rng() * 0.2, 0.78 + rng() * 0.18]
    };
    if (!bushBuckets.has(name)) bushBuckets.set(name, []);
    bushBuckets.get(name).push(t);
    bushes++;
  }

  for (const [name, list] of bushBuckets) {
    add(name, await geo(name), list, {
      key: 'bushes',
      tex: { Bark: 'T_BirchTree_Bark_01_A', Leaf: 'T_BirchTree_Leaf_01_A', default: 'T_BirchTree_Leaf_01_A' },
      tint: { Bark: BARK_TINT, Leaf: 0x9aa98f, default: 0x9aa98f },
      castShadow: true
    });
  }

  /* ---------------- 地被：草、杂苗、花 ---------------- */
  const groundPlans = [
    {
      key: 'grass', count: 2100,
      models: ['SM_Grass_01_01', 'SM_Grass_01_02', 'SM_Grass_02_01', 'SM_Grass_02_02', 'SM_Grass_03_01', 'SM_Grass_03_02'],
      tex: { Grass_01: 'T_Grass_01_A', Grass_02: 'T_Grass_02_A', Grass_03: 'T_Grass_03_A', default: 'T_Grass_01_A' },
      size: [0.44, 0.78], minPath: 2.4, fertileMin: 0.20, tint: 0xb6d489
    },
    {
      key: 'cover', count: 520,
      models: ['SM_CoverPlant_01', 'SM_CoverPlant_02', 'SM_CoverPlant_03'],
      tex: { 'Cover Plants': 'T_CoverPlants_01_A', default: 'T_CoverPlants_01_A' },
      size: [0.22, 0.4], minPath: 2.8, fertileMin: 0.32, tint: 0xc6d2b2
    },
    {
      key: 'weeds', count: 95,
      models: ['SM_Plant_01_01', 'SM_Plant_02_01'],
      tex: { Plants_01: 'T_Plants_01_A', default: 'T_Plants_01_A' },
      size: [0.6, 1.05], minPath: 2.2, fertileMin: 0.40, tint: 0xb2c29c
    },
    {
      key: 'flowers', count: 44,
      models: ['SM_Flower_01_01', 'SM_Flower_02_01', 'SM_Flower_03_01', 'SM_Flower_05_01', 'SM_Flower_08_01'],
      tex: { Flowers_01: 'T_Flowers_01_A', Flowers_02: 'T_Flowers_02_A', default: 'T_Flowers_01_A' },
      size: [0.26, 0.4], minPath: 2.8, fertileMin: 0.52, tint: 0xd8cdb4
    }
  ];

  for (const plan of groundPlans) {
    const buckets = new Map();
    guard = 0;
    let made = 0;
    while (made < plan.count && guard++ < plan.count * 26) {
      const p = samplePoint({ radius: 84, minPath: plan.minPath, maxSlope: 0.62, clear: 4 });
      if (!p) continue;

      // 肥力决定「密」还是「疏」，但任何地方都留极少量植株，
      // 否则整片区域会彻底空掉，看上去像地图没做完。
      const f = fert(p.x, p.z);
      const dense = smoothstep(plan.fertileMin, 0.85, f);
      const tuft = nz(p.x * 0.45, p.z * 0.45) * 0.5 + 0.5;   // 高频噪声让草成丛
      const weight = (0.06 + 0.94 * dense) * (0.16 + 0.84 * tuft * tuft);
      if (rng() > weight) continue;

      const name = plan.models[Math.floor(rng() * plan.models.length)];
      const size = plan.size[0] + rng() * (plan.size[1] - plan.size[0]);
      const t = {
        x: p.x, y: p.y - 0.02, z: p.z,
        yaw: rng() * Math.PI * 2,
        size,
        girth: 0.85 + rng() * 0.35,
        tiltX: (rng() - 0.5) * 0.12,
        tiltZ: (rng() - 0.5) * 0.12,
        color: [
          0.74 + rng() * 0.26,
          0.76 + rng() * 0.26,
          0.7 + rng() * 0.24
        ]
      };
      if (!buckets.has(name)) buckets.set(name, []);
      buckets.get(name).push(t);
      made++;
    }

    for (const [name, list] of buckets) {
      add(name, await geo(name), list, {
        key: plan.key,
        tex: plan.tex,
        tint: { default: plan.tint },
        foliage: true,
        castShadow: false
      });
    }
  }

  /* ---------------- 岩石 ---------------- */
  const ROCK_TONES = ['T_Rock_01_A', 'T_Rock_02_A', 'T_Rock_03_A', 'T_Rock_04_A', 'T_Rock_05_A', 'T_Rock_06_A'];
  const rockBuckets = new Map();
  guard = 0;
  let rocksMade = 0;
  while (rocksMade < 46 && guard++ < 8000) {
    const p = samplePoint({ radius: 84, minPath: 2.2, maxSlope: 0.9, clear: 5 });
    if (!p) continue;

    const useGroup = rng() < 0.22;
    const name = useGroup
      ? (rng() < 0.5 ? 'SM_RockGroup_01' : 'SM_RockGroup_02')
      : `SM_Rock_0${1 + Math.floor(rng() * 6)}`;
    const size = useGroup
      ? 1.2 + rng() * 1.5
      : 0.45 + Math.pow(rng(), 2.2) * 2.3;

    if (occupied(p.x, p.z, size * 0.32, 0.4)) continue;
    placed.push({ x: p.x, z: p.z, r: size * 0.32 });

    const t = {
      x: p.x,
      y: p.y - size * 0.12,
      z: p.z,
      yaw: rng() * Math.PI * 2,
      size,
      girth: 0.9 + rng() * 0.3,
      tiltX: (rng() - 0.5) * 0.35,
      tiltZ: (rng() - 0.5) * 0.35,
      color: [0.8 + rng() * 0.2, 0.82 + rng() * 0.2, 0.84 + rng() * 0.2]
    };
    if (size > 0.9) colliders.push({ x: p.x, z: p.z, r: size * 0.3 });

    if (!rockBuckets.has(name)) rockBuckets.set(name, []);
    rockBuckets.get(name).push(t);
    rocksMade++;
  }

  for (const [name, list] of rockBuckets) {
    const tone = ROCK_TONES[Math.floor(rng() * ROCK_TONES.length)];
    add(name, await geo(name), list, {
      key: 'rocks',
      tex: { Props: tone, default: tone },
      tint: { default: 0xc4ccd4 },
      castShadow: true
    });
  }

  /* ---------------- 人迹：倒木、树桩、木板、断栅栏 ---------------- */
  const props = [];

  // 安全屋外围一段断掉的栅栏：有人住过，又离开了
  for (let i = 0; i < 4; i++) {
    const a = 1.9 + i * 0.17;
    const r = 8.8;
    const x = HOUSE_POS.x + Math.cos(a) * r;
    const z = HOUSE_POS.z + Math.sin(a) * r;
    props.push({
      name: 'SM_Fence_01',
      t: {
        x, y: heightAt(x, z) - 0.06, z,
        yaw: a + Math.PI * 0.5 + (rng() - 0.5) * 0.3,
        size: 1.7 + rng() * 0.2,
        girth: 1,
        tiltX: (rng() - 0.5) * 0.12,
        tiltZ: (rng() - 0.5) * 0.2,
        color: [0.84, 0.82, 0.78]
      }
    });
  }

  const hosts = [];
  for (let i = 0; i < 3; i++) {
    const p = samplePoint({ radius: 78, minPath: 3.4, maxPath: 14, maxSlope: 0.4, clear: 6 });
    if (!p) continue;
    hosts.push(p);
    props.push({
      name: 'SM_Log_01',
      t: {
        x: p.x, y: p.y - 0.05, z: p.z,
        yaw: rng() * Math.PI * 2,
        size: 2.2 + rng() * 0.8,
        girth: 1,
        tiltX: (rng() - 0.5) * 0.18,
        tiltZ: (rng() - 0.5) * 0.18,
        color: [0.82, 0.8, 0.76]
      }
    });
    colliders.push({ x: p.x, z: p.z, r: 0.8 });
  }

  for (let i = 0; i < 3; i++) {
    const p = samplePoint({ radius: 74, minPath: 2.8, maxSlope: 0.4, clear: 6 });
    if (!p) continue;
    hosts.push(p);
    props.push({
      name: 'SM_Stump_01',
      t: {
        x: p.x, y: p.y - 0.06, z: p.z,
        yaw: rng() * Math.PI * 2,
        size: 0.85 + rng() * 0.4,
        girth: 1,
        color: [0.84, 0.81, 0.76]
      }
    });
    placed.push({ x: p.x, z: p.z, r: 0.6 });
  }

  for (let i = 0; i < 7; i++) {
    const nearHouse = i < 3;
    const p = nearHouse
      ? { x: HOUSE_POS.x + (rng() - 0.5) * 14, z: HOUSE_POS.z + (rng() - 0.5) * 14 }
      : samplePoint({ radius: 70, minPath: 1.6, maxPath: 7, maxSlope: 0.4, clear: 5 });
    if (!p) continue;
    props.push({
      name: rng() < 0.5 ? 'SM_Plank_01' : 'SM_Plank_Group_01',
      t: {
        x: p.x, y: heightAt(p.x, p.z) + 0.03, z: p.z,
        yaw: rng() * Math.PI * 2,
        size: (rng() < 0.5 ? 0.9 : 1.5) * (0.8 + rng() * 0.5),
        girth: 1,
        tiltX: (rng() - 0.5) * 0.06,
        tiltZ: (rng() - 0.5) * 0.06,
        color: [0.8, 0.78, 0.74]
      }
    });
  }

  for (const name of ['SM_Fence_01', 'SM_Log_01', 'SM_Stump_01', 'SM_Plank_01', 'SM_Plank_Group_01']) {
    const list = props.filter(p => p.name === name).map(p => p.t);
    if (!list.length) continue;
    add(name, await geo(name), list, {
      key: 'props',
      tex: name === 'SM_Fence_01'
        ? { Plank: 'T_Plank_01_A', Ivy: 'T_Ivy_01_A', default: 'T_Plank_01_A' }
        : { Props: 'T_Log_01_A', default: 'T_Log_01_A' },
      tint: { default: 0xc4bdb2 },
      castShadow: true
    });
  }

  /* ---------------- 蘑菇：长在倒木与树桩边上 ---------------- */
  const shroomBuckets = new Map();
  for (const h of hosts) {
    const n = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const r = 0.4 + rng() * 1.6;
      const x = h.x + Math.cos(a) * r;
      const z = h.z + Math.sin(a) * r;
      const name = `SM_Mushroom_0${1 + Math.floor(rng() * 4)}`;
      if (!shroomBuckets.has(name)) shroomBuckets.set(name, []);
      shroomBuckets.get(name).push({
        x, y: heightAt(x, z) - 0.01, z,
        yaw: rng() * Math.PI * 2,
        size: 0.18 + rng() * 0.16,
        girth: 0.9 + rng() * 0.3,
        tiltX: (rng() - 0.5) * 0.2,
        tiltZ: (rng() - 0.5) * 0.2,
        color: [0.88, 0.86, 0.84]
      });
    }
  }
  for (const [name, list] of shroomBuckets) {
    add(name, await geo(name), list, {
      key: 'mushrooms',
      tex: { Mushroom: 'T_Mushroom_Brown_01_A', default: 'T_Mushroom_Brown_01_A' },
      tint: { default: 0xd2c8b8 },
      castShadow: false
    });
  }

  return { group, stats };
}
