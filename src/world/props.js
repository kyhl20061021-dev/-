import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { nearestPathInfo, pathPointAt, TUNNEL_POS, HOUSE_POS, HOUSE_Y, TUNNEL_Y } from './layout.js';
import { makeRng } from '../core/noise.js';

const rng = makeRng(90210);

function lam(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
}

/* ------------------------------------------------------------------ */
/* 天空、雾与远景                                                       */
/* ------------------------------------------------------------------ */
export function buildSky(scene) {
  /**
   * 荒原没有昼夜（story-bible「荒原」），基调走「阴天的苍白天光」而不是深夜：
   * 之前天空 0x0c1215 / 雾 0x111a1e 太压，玩家在开阔地上几乎看不清路。
   * 现在雾色比天空亮一档，远处泛白，既有纵深又不至于把画面闷死。
   */
  scene.background = new THREE.Color(0x64747c);
  scene.fog = new THREE.FogExp2(0x7b8990, 0.0066);

  // 星（白天只剩极淡的几粒，压低存在感）
  const starGeo = new THREE.BufferGeometry();
  const pts = [];
  for (let i = 0; i < 520; i++) {
    const a = rng() * Math.PI * 2;
    const p = Math.acos(rng() * 0.92 + 0.02);
    const r = 190;
    pts.push(
      Math.sin(p) * Math.cos(a) * r,
      Math.cos(p) * r * 0.9 + 8,
      Math.sin(p) * Math.sin(a) * r
    );
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xb6c6d4, size: 1.5, sizeAttenuation: false,
    transparent: true, opacity: 0.06, fog: false, depthWrite: false
  }));
  scene.add(stars);

  // 月（淡成一片高空的冷白，不再是唯一的亮源）
  const moonDir = new THREE.Vector3(-0.52, 0.4, -0.76).normalize();
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(7.5, 32),
    new THREE.MeshBasicMaterial({ color: 0xeef3f6, fog: false, transparent: true, opacity: 0.22 })
  );
  moon.position.copy(moonDir).multiplyScalar(190);
  moon.lookAt(0, 6, 0);
  scene.add(moon);

  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(19, 32),
    new THREE.MeshBasicMaterial({ color: 0xb9c8d2, fog: false, transparent: true, opacity: 0.05, depthWrite: false })
  );
  halo.position.copy(moonDir).multiplyScalar(189);
  halo.lookAt(0, 6, 0);
  scene.add(halo);

  // 远山剪影
  const hillMat = lam(0x17201f);
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + rng() * 0.3;
    const r = 104 + rng() * 26;
    const h = 20 + rng() * 22;
    const hill = new THREE.Mesh(new THREE.ConeGeometry(26 + rng() * 20, h, 5 + Math.floor(rng() * 3)), hillMat);
    hill.position.set(Math.cos(a) * r, h * 0.42, Math.sin(a) * r);
    hill.rotation.y = rng() * Math.PI;
    scene.add(hill);
  }
}

export function buildLights(scene) {
  // 天光为主：冷白，像阴天下午。以前靠 2.05 的半球光 + 1.7 的方向光撑，整体压到近黑。
  scene.add(new THREE.HemisphereLight(0xa8bac4, 0x4a524d, 2.75));
  scene.add(new THREE.AmbientLight(0x7d8c96, 1.2));

  const moon = new THREE.DirectionalLight(0xdde6ea, 2.25);
  moon.position.set(-46, 62, 26);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -60;
  moon.shadow.camera.right = 60;
  moon.shadow.camera.top = 60;
  moon.shadow.camera.bottom = -60;
  moon.shadow.camera.near = 1;
  moon.shadow.camera.far = 220;
  moon.shadow.bias = -0.0009;
  moon.shadow.normalBias = 0.02;
  scene.add(moon);

  // 补一盏从玩家背后打来的冷光，避免走近时人物只剩剪影
  const rim = new THREE.DirectionalLight(0xb9c9d2, 0.75);
  rim.position.set(36, 28, 40);
  scene.add(rim);
}

/* ------------------------------------------------------------------ */
/* 岩石                                                                */
/* ------------------------------------------------------------------ */
export function buildRocks(scene, colliders) {
  const COUNT = 130;
  const geo = new THREE.IcosahedronGeometry(1, 0);
  // 用白色底材质 + 实例色，避免材质色与实例色相乘导致整体发黑
  const mesh = new THREE.InstancedMesh(geo, lam(0xffffff), COUNT);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  const ROCK_TONES = [0x565b60, 0x4c5156, 0x606468, 0x44494e];

  let placed = 0, guard = 0;
  while (placed < COUNT && guard++ < 4000) {
    const x = (rng() - 0.5) * 176;
    const z = (rng() - 0.5) * 176;
    if (Math.hypot(x, z) > 86) continue;
    const info = nearestPathInfo(x, z);
    if (info.dist < 3.4) continue;
    if (Math.hypot(x - HOUSE_POS.x, z - HOUSE_POS.z) < 9) continue;
    if (Math.hypot(x - TUNNEL_POS.x, z - TUNNEL_POS.z) < 8) continue;

    const sc = 0.42 + Math.pow(rng(), 2.1) * 2.1;
    const y = heightAt(x, z) - sc * 0.42;
    e.set(rng() * 0.5, rng() * Math.PI, rng() * 0.5);
    q.setFromEuler(e);
    v.set(x, y, z);
    s.set(sc, sc * (0.8 + rng() * 0.35), sc);
    m.compose(v, q, s);
    mesh.setMatrixAt(placed, m);

    col.setHex(ROCK_TONES[Math.floor(rng() * ROCK_TONES.length)]);
    mesh.setColorAt(placed, col);

    if (sc > 1.25) colliders.push({ x, z, r: sc * 0.72 });
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);
}

/* ------------------------------------------------------------------ */
/* 草                                                                  */
/* ------------------------------------------------------------------ */
export function buildGrass(scene) {
  const COUNT = 2400;
  const geo = new THREE.ConeGeometry(0.075, 0.38, 3);
  geo.translate(0, 0.19, 0);
  const mesh = new THREE.InstancedMesh(geo, lam(0xffffff, { emissive: 0x141a12 }), COUNT);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  const TONES = [0x5a684a, 0x4e5c42, 0x616e4e, 0x46543d];

  let placed = 0, guard = 0;
  while (placed < COUNT && guard++ < 20000) {
    let x, z;
    if (rng() < 0.55) {
      const p = pathPointAt(rng());
      x = p.x + (rng() - 0.5) * 22;
      z = p.z + (rng() - 0.5) * 22;
    } else {
      x = (rng() - 0.5) * 168;
      z = (rng() - 0.5) * 168;
    }
    if (Math.hypot(x, z) > 84) continue;
    const info = nearestPathInfo(x, z);
    if (info.dist < 1.7) continue;

    const y = heightAt(x, z);
    const sc = 0.7 + rng() * 0.8;
    e.set((rng() - 0.5) * 0.3, rng() * Math.PI, (rng() - 0.5) * 0.3);
    q.setFromEuler(e);
    v.set(x, y, z);
    s.set(sc, sc * (0.75 + rng() * 0.8), sc);
    m.compose(v, q, s);
    mesh.setMatrixAt(placed, m);

    col.setHex(TONES[Math.floor(rng() * TONES.length)]);
    mesh.setColorAt(placed, col);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);
}

/* ------------------------------------------------------------------ */
/* 枯树                                                                */
/* ------------------------------------------------------------------ */
export function buildTrees(scene, colliders) {
  const TREES = 26;
  const BRANCHES = 3;

  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.3, 4.2, 5);
  trunkGeo.translate(0, 2.1, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, lam(0x2f2b26), TREES);
  trunks.castShadow = true;

  const brGeo = new THREE.CylinderGeometry(0.045, 0.1, 2.0, 4);
  brGeo.translate(0, 1.0, 0);
  const branches = new THREE.InstancedMesh(brGeo, lam(0x2a2723), TREES * BRANCHES);
  branches.castShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();

  let ti = 0, bi = 0, guard = 0;
  while (ti < TREES && guard++ < 3000) {
    const x = (rng() - 0.5) * 168;
    const z = (rng() - 0.5) * 168;
    if (Math.hypot(x, z) > 82) continue;
    const info = nearestPathInfo(x, z);
    if (info.dist < 5.5) continue;
    if (Math.hypot(x - HOUSE_POS.x, z - HOUSE_POS.z) < 10) continue;

    const y = heightAt(x, z);
    const yaw = rng() * Math.PI * 2;
    const sc = 0.8 + rng() * 0.6;
    e.set(0, yaw, 0);
    q.setFromEuler(e);
    v.set(x, y, z);
    s.set(sc, sc * (0.85 + rng() * 0.5), sc);
    m.compose(v, q, s);
    trunks.setMatrixAt(ti, m);

    for (let b = 0; b < BRANCHES; b++) {
      const a = yaw + (b / BRANCHES) * Math.PI * 2 + rng() * 0.8;
      const tilt = 0.7 + rng() * 0.45;
      e.set(tilt * Math.cos(a), a, tilt * Math.sin(a));
      q.setFromEuler(e);
      v.set(x, y + 2.6 + rng() * 1.1, z);
      const bs = sc * (0.7 + rng() * 0.5);
      s.set(bs, bs, bs);
      m.compose(v, q, s);
      branches.setMatrixAt(bi++, m);
    }

    colliders.push({ x, z, r: 0.55 });
    ti++;
  }
  trunks.count = ti;
  branches.count = bi;
  trunks.instanceMatrix.needsUpdate = true;
  branches.instanceMatrix.needsUpdate = true;
  scene.add(trunks, branches);
}

/* ------------------------------------------------------------------ */
/* 安全屋                                                              */
/* ------------------------------------------------------------------ */
export function buildSafeHouse(scene, colliders) {
  const g = new THREE.Group();
  const baseY = HOUSE_Y;

  const wallMat = lam(0x574c3f);
  const woodMat = lam(0x342d27);
  const roofMat = lam(0x39322b, { side: THREE.DoubleSide });

  const W = 5.62;      // 墙体总宽
  const D = 4.6;       // 墙体总深
  const T = 0.22;      // 墙厚
  const H = 2.9;       // 墙高
  const FLOOR = 0.06;  // 地面高度（略高于地形，避免 z-fighting）

  // 地基：顶面就是屋里的地面。做薄一点，玩家站在地形上时脚不会陷进去。
  const found = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.5, D + 0.6), lam(0x39332b));
  found.position.y = FLOOR - 0.25;
  found.receiveShadow = true;
  g.add(found);

  /** 一堵墙：实心盒子，所以从屋里看得到内表面，不会漏出外面的荒原 */
  const wall = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };

  const wallY = FLOOR + H / 2;
  wall(W, H, T, 0, wallY, -D / 2 + T / 2);          // 后墙
  wall(T, H, D, -W / 2 + T / 2, wallY, 0);          // 左墙
  wall(T, H, D, W / 2 - T / 2, wallY, 0);           // 右墙

  // 前墙留门洞：缺口 x ∈ [-1.30, 0.05]，宽 1.35，够一个人侧身通过
  const DOOR_L = -1.30, DOOR_R = 0.05;
  const leftW = DOOR_L - (-W / 2);
  wall(leftW, H, T, -W / 2 + leftW / 2, wallY, D / 2 - T / 2);
  const rightW = W / 2 - DOOR_R;
  wall(rightW, H, T, DOOR_R + rightW / 2, wallY, D / 2 - T / 2);

  // 门楣
  const lintelH = H - 2.05;
  wall(DOOR_R - DOOR_L, lintelH, T, (DOOR_L + DOOR_R) / 2, FLOOR + 2.05 + lintelH / 2, D / 2 - T / 2);

  // 屋顶：双面，从屋里抬头能看到天花板
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.7, 2.4, 4), roofMat);
  roof.position.y = FLOOR + H + 1.2;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  g.add(roof);

  // 门：开着，靠在门洞内侧，暗示有人先进去了
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.32, 2.02, 0.1), woodMat);
  door.position.set(DOOR_L + 0.66, FLOOR + 1.01, D / 2 - T / 2);
  door.rotation.y = -1.15;
  door.castShadow = true;
  g.add(door);

  /* ---------------- 室内 ---------------- */
  // 壁炉（后墙）
  const hearth = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.15, 0.42), lam(0x3a332c));
  hearth.position.set(-1.05, FLOOR + 0.58, -D / 2 + T + 0.21);
  hearth.castShadow = true;
  g.add(hearth);

  const emberMat = new THREE.MeshBasicMaterial({ color: 0xd2591c, side: THREE.DoubleSide });
  const ember = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.34), emberMat);
  ember.position.set(-1.05, FLOOR + 0.30, -D / 2 + T + 0.44);
  g.add(ember);

  // 火苗：三个低多边形锥体，便宜但比一块发光矩形像火
  const flame = new THREE.Group();
  flame.position.set(-1.05, FLOOR + 0.22, -D / 2 + T + 0.46);
  const flameSpec = [
    [0.19, 0.52, 0xffb347, 0],
    [0.13, 0.40, 0xffd98a, 0.08],
    [0.09, 0.28, 0xfff0c9, 0.15]
  ];
  for (const [r, h, c, dy] of flameSpec) {
    const m = new THREE.Mesh(
      new THREE.ConeGeometry(r, h, 5),
      new THREE.MeshBasicMaterial({ color: c })
    );
    m.position.set(0, h / 2 + dy, 0);
    flame.add(m);
  }
  g.add(flame);

  const fireLight = new THREE.PointLight(0xff9a4d, 9.5, 9, 2);
  fireLight.position.set(-1.05, FLOOR + 0.62, -D / 2 + T + 0.7);
  g.add(fireLight);

  // 桌子和碗（那碗没人动过的汤）
  const tableTop = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 1.1), woodMat);
  tableTop.position.set(1.15, FLOOR + 0.74, -0.5);
  tableTop.castShadow = true;
  g.add(tableTop);
  for (const [lx, lz] of [[-0.65, -0.42], [0.65, -0.42], [-0.65, 0.42], [0.65, 0.42]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.74, 0.08), woodMat);
    leg.position.set(1.15 + lx, FLOOR + 0.37, -0.5 + lz);
    g.add(leg);
  }
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.11, 0.11, 8), lam(0x6b6153));
  bowl.position.set(1.05, FLOOR + 0.84, -0.5);
  g.add(bowl);
  const soup = new THREE.Mesh(new THREE.CircleGeometry(0.14, 8), lam(0x4a4436));
  soup.rotation.x = -Math.PI / 2;
  soup.position.set(1.05, FLOOR + 0.895, -0.5);
  g.add(soup);

  // 窗：右墙。双面，所以从屋里也能看见那块亮
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffc98a, side: THREE.DoubleSide });
  const winGroup = new THREE.Group();
  winGroup.position.set(W / 2 - T - 0.01, FLOOR + 1.55, 0.55);
  winGroup.rotation.y = -Math.PI / 2;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.76), winMat);
  winGroup.add(glass);
  {
    // 窗框：四边 + 一根竖挺，让它读起来是窗而不是一块发光的板
    const barMat = lam(0x241f1a);
    const bar = (w, h, x, y) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.07), barMat);
      b.position.set(x, y, 0.03);
      winGroup.add(b);
    };
    bar(1.06, 0.08, 0, 0.42);
    bar(1.06, 0.08, 0, -0.42);
    bar(0.08, 0.92, -0.5, 0);
    bar(0.08, 0.92, 0.5, 0);
    bar(0.045, 0.86, 0, 0);
  }
  g.add(winGroup);

  // 窗外那块亮（从外面走近时看到的灯）
  const winOut = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.7), winMat);
  winOut.position.set(W / 2 + 0.005, FLOOR + 1.55, 0.55);
  winOut.rotation.y = Math.PI / 2;
  g.add(winOut);

  // 屋外暖光：给走近的人一个方向
  const porch = new THREE.PointLight(0xffa659, 16, 22, 2);
  porch.position.set(-0.4, FLOOR + 1.7, D / 2 + 1.4);
  g.add(porch);

  /**
   * 屋里补一盏很弱的冷光。屋顶是实心的，平行光进不来，只有壁炉照得到
   * 炉子正前方那一小块——真相那场戏玩家背对壁炉，整间屋子会黑到看不清人。
   * 当作「屋顶缝隙漏下来的天光」，强度压到远低于壁炉，不抢火光。
   */
  const indoorFill = new THREE.PointLight(0x9fb0b8, 3.4, 13, 2);
  indoorFill.position.set(0, FLOOR + 2.45, 0);
  g.add(indoorFill);

  g.position.set(HOUSE_POS.x, baseY, HOUSE_POS.z);
  scene.add(g);

  /* ---------------- 碰撞：四面墙，留门洞 ---------------- */
  const cx = HOUSE_POS.x, cz = HOUSE_POS.z;
  const half = (v) => v / 2;
  colliders.push({ x: cx, z: cz - D / 2 + T / 2, hx: half(W), hz: half(T) });          // 后
  colliders.push({ x: cx - W / 2 + T / 2, z: cz, hx: half(T), hz: half(D) });          // 左
  colliders.push({ x: cx + W / 2 - T / 2, z: cz, hx: half(T), hz: half(D) });          // 右
  colliders.push({                                                                    // 前（左段）
    x: cx + (-W / 2 + (leftW / 2)), z: cz + D / 2 - T / 2, hx: half(leftW), hz: half(T)
  });
  colliders.push({                                                                    // 前（右段）
    x: cx + (DOOR_R + rightW / 2), z: cz + D / 2 - T / 2, hx: half(rightW), hz: half(T)
  });

  return {
    x: HOUSE_POS.x, z: HOUSE_POS.z, y: baseY, group: g,
    flame, fireLight, baseFireIntensity: 9.5
  };
}

/* ------------------------------------------------------------------ */
/* 隧道口                                                              */
/* ------------------------------------------------------------------ */
export function buildTunnel(scene, colliders) {
  const g = new THREE.Group();
  const stone = lam(0x565a5b);

  const pillarGeo = new THREE.BoxGeometry(1.7, 4.6, 2.4);
  for (const sx of [-2.9, 2.9]) {
    const p = new THREE.Mesh(pillarGeo, stone);
    p.position.set(sx, 2.3, 0);
    p.rotation.y = sx > 0 ? 0.08 : -0.08;
    p.castShadow = true;
    p.receiveShadow = true;
    g.add(p);
  }

  const lintel = new THREE.Mesh(new THREE.BoxGeometry(7.6, 1.5, 2.6), stone);
  lintel.position.set(0, 5.0, 0);
  lintel.rotation.z = 0.03;
  lintel.castShadow = true;
  g.add(lintel);

  // 隧道内部的黑
  const inner = new THREE.Mesh(
    new THREE.BoxGeometry(4.6, 4.3, 7.0),
    new THREE.MeshBasicMaterial({ color: 0x040607, side: THREE.BackSide })
  );
  inner.position.set(0, 2.1, 3.6);
  g.add(inner);

  // 门口碎石（在洞口外侧，即局部 -Z）
  for (let i = 0; i < 8; i++) {
    const r = 0.3 + rng() * 0.7;
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), lam(0x494d4e));
    const a = rng() * Math.PI * 2;
    rock.position.set(Math.cos(a) * (3 + rng() * 2.4), r * 0.5, -1 - rng() * 2.6);
    rock.rotation.set(rng(), rng(), rng());
    g.add(rock);
  }

  g.position.set(TUNNEL_POS.x, TUNNEL_Y, TUNNEL_POS.z);
  // 注意：不要旋转。洞口朝 -Z（玩家来向），隧道内部必须朝 +Z 延伸，
  // 否则那个 BackSide 的黑盒子会把出生点的镜头整个包住，画面全黑。
  scene.add(g);

  colliders.push({ x: TUNNEL_POS.x - 2.9, z: TUNNEL_POS.z, r: 1.3 });
  colliders.push({ x: TUNNEL_POS.x + 2.9, z: TUNNEL_POS.z, r: 1.3 });

  return { x: TUNNEL_POS.x, z: TUNNEL_POS.z, y: TUNNEL_Y };
}

/* ------------------------------------------------------------------ */
/* 浮尘                                                                */
/* ------------------------------------------------------------------ */
export function buildParticles(scene) {
  const COUNT = 420;
  const pos = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = (rng() - 0.5) * 90;
    pos[i * 3 + 1] = 0.4 + rng() * 7;
    pos[i * 3 + 2] = (rng() - 0.5) * 90;
    seed[i] = rng() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

  const mat = new THREE.PointsMaterial({
    color: 0x9fb2c4, size: 0.075, transparent: true, opacity: 0.34,
    depthWrite: false, sizeAttenuation: true
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);

  let t = 0;
  return (dt) => {
    t += dt;
    const arr = geo.attributes.position.array;
    for (let i = 0; i < COUNT; i++) {
      arr[i * 3] += Math.sin(t * 0.4 + seed[i]) * dt * 0.16;
      arr[i * 3 + 1] += Math.sin(t * 0.7 + seed[i] * 2) * dt * 0.09;
      arr[i * 3 + 2] += Math.cos(t * 0.33 + seed[i]) * dt * 0.14;
      if (arr[i * 3 + 1] < 0.2) arr[i * 3 + 1] = 7.4;
    }
    geo.attributes.position.needsUpdate = true;
  };
}
