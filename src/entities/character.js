import * as THREE from 'three';

function mat(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
}

/**
 * 低多边形人物：全部由基础几何体拼装，约 12 个部件，1 个骨架层级。
 * 朝向约定：模型正面朝 -Z。
 */
export function createCharacter(cfg = {}) {
  const {
    coat = 0x46505c,
    pants = 0x3a4048,
    skin = 0xdcb99c,
    hair = 0x2a2320,
    scale = 1,
    skirt = false,
    /** 瞳孔颜色。钴蓝色是崔斯坦的专属标识（docs/glossary.md），
     *  传 null 则不画眼睛（远景 LOD 用） */
    eyes = null
  } = cfg;

  const root = new THREE.Group();
  const bob = new THREE.Group();
  root.add(bob);

  const coatMat = mat(coat);
  const pantsMat = mat(pants);
  const skinMat = mat(skin);
  const hairMat = mat(hair);

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.28), pantsMat);
  hips.position.y = 0.82;
  bob.add(hips);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.60, 0.30), coatMat);
  torso.position.y = 1.16;
  bob.add(torso);

  if (skirt) {
    const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.36, 0.56, 6), coatMat);
    sk.position.y = 0.78;
    bob.add(sk);
  }

  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.14), skinMat);
  neck.position.y = 1.50;
  bob.add(neck);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.28), skinMat);
  head.position.y = 1.66;
  bob.add(head);

  const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.14, 0.31), hairMat);
  hairTop.position.y = 1.80;
  bob.add(hairTop);
  const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.26, 0.10), hairMat);
  hairBack.position.set(0, 1.66, 0.15);
  bob.add(hairBack);

  // 眼睛：唯一能跨幕识别「他有没有被规则重置」的细节，所以单独建材质，
  // 用不受光照影响的 Basic 材质——夜里也能看见那一点钴蓝。
  let eyeMat = null;
  if (eyes !== null) {
    eyeMat = new THREE.MeshBasicMaterial({ color: eyes, toneMapped: false });
    const eyeGeo = new THREE.BoxGeometry(0.043, 0.021, 0.012);
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(eyeGeo, eyeMat);
      e.position.set(sx * 0.066, 1.678, -0.143);
      e.castShadow = false;
      bob.add(e);
    }
  }

  // 手臂：以肩为轴
  const armGeo = new THREE.BoxGeometry(0.135, 0.54, 0.135);
  armGeo.translate(0, -0.27, 0);
  const armL = new THREE.Group();
  armL.position.set(-0.32, 1.40, 0);
  const armLMesh = new THREE.Mesh(armGeo, coatMat);
  armL.add(armLMesh);
  bob.add(armL);

  const armR = new THREE.Group();
  armR.position.set(0.32, 1.40, 0);
  const armRMesh = new THREE.Mesh(armGeo, coatMat);
  armR.add(armRMesh);
  bob.add(armR);

  // 腿：以髋为轴
  const legGeo = new THREE.BoxGeometry(0.16, 0.70, 0.17);
  legGeo.translate(0, -0.35, 0);
  const legL = new THREE.Group();
  legL.position.set(-0.12, 0.72, 0);
  legL.add(new THREE.Mesh(legGeo, pantsMat));
  bob.add(legL);

  const legR = new THREE.Group();
  legR.position.set(0.12, 0.72, 0);
  legR.add(new THREE.Mesh(legGeo, pantsMat));
  bob.add(legR);

  root.scale.setScalar(scale);
  root.traverse(o => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; }
  });

  let phase = 0;

  /**
   * @param {number} dt 秒
   * @param {number} moving 0..1 移动强度（用于动画混合）
   */
  function animate(dt, moving) {
    const speed = 9.2;
    phase += dt * speed * moving;
    const s = Math.sin(phase);
    const amp = 0.62 * moving;

    armL.rotation.x = s * amp;
    armR.rotation.x = -s * amp;
    legL.rotation.x = -s * amp * 0.95;
    legR.rotation.x = s * amp * 0.95;

    // 走路上下起伏
    bob.position.y = Math.abs(Math.sin(phase)) * 0.05 * moving;
    // 静止时轻微呼吸
    if (moving < 0.05) {
      bob.position.y = Math.sin(performance.now() * 0.0016) * 0.012;
      bob.rotation.z = Math.sin(performance.now() * 0.0011) * 0.012;
    } else {
      bob.rotation.z = s * 0.02 * moving;
    }
  }

  return { root, bob, animate, head, eyeMat };
}
