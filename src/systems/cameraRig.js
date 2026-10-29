import * as THREE from 'three';
import { clamp } from '../core/noise.js';
import { rayRect, rayCircle } from './collision.js';

/**
 * 鼠标灵敏度。之前是 0.0022 / 0.0017，转起来太滑、太快——
 * 3D 眩晕主要来自「小幅高频的连续位移」，降下来比什么都管用。
 */
const SENS_X = 0.00145;
const SENS_Y = 0.00115;

/**
 * 视角吸附网格（弧度）。鼠标不再是连续丝滑地扫，而是一格一格地跳：
 * 0.0035 rad ≈ 0.2°，在 1360px 宽、62° FOV 下约 4.4px。
 * 这是「颗粒感」的来源，也顺手压掉了高频抖动带来的眩晕。
 */
const STEP_YAW = 0.0035;
const STEP_PITCH = 0.005;

/** 镜头避障时与障碍面之间保持的距离 */
const OBSTACLE_PAD = 0.3;

/**
 * 俯仰角（pitch）统一表示「视线仰角」：正数 = 抬头，负数 = 低头。
 * 第一人称直接用 rotation.x；第三人称把它换算成镜头绕头的球坐标（镜头在视线反方向）。
 *
 * 上下不做 360° 是结构性的：左右是绕竖轴转，转多少圈都不会出问题；
 * 上下越过 ±90° 就到了球坐标的极点，镜头会瞬间翻个面（画面倒过来），
 * `lookAt` 的 up 向量也失效。所以两头顶在极点前面一点收住。
 * 第一人称可以一直抬到接近直视天顶；第三人称抬头受地面限制（镜头不能钻到地下），
 * 想看头顶的雾就按 V 切第一人称。
 */
const PITCH_LIMITS = {
  first: [-1.50, 1.50],   // ≈ ±86°：仰头能看到雾，低头能看到自己的脚
  third: [-1.35, 1.35]    // 视线同样能到 ±77°；镜头本体的绕行角度另有限制，见 ORBIT_LIMITS
};

/**
 * 第三人称的「镜头绕行角度」单独夹一层。
 * 原因是物理的：镜头在头后 4.6m，想抬头看天就得降到比头更低——
 * 再低就钻到地下了，于是以前一抬头就被地面卡住，感觉「上下转不动」。
 * 现在镜头只在安全区间里绕，视线另算（lookAt 一个沿真实俯仰角延伸的点），
 * 抬头时镜头留在原地、视点往上走，天就进画面了。
 */
const ORBIT_LIMITS = [-1.25, 0.12];

/** 第三人称镜头与地面的最小距离。留太大会把「低头」提前卡死，留太小会穿草。 */
const GROUND_MARGIN = 0.4;

export class CameraRig {
  constructor(camera, canvas, heightAt) {
    this.camera = camera;
    this.canvas = canvas;
    this.heightAt = heightAt;

    this.mode = 'third';
    this.yaw = 0;
    this.pitch = -0.14;   // 负 = 略微低头，第三人称默认就是「从斜上方看下来」
    this.distance = 4.6;
    this.locked = false;

    /** 未经吸附的原始角度：吸附要在累加值上做，否则每格都会被 round 吃掉、转不动 */
    this._yawRaw = 0;
    this._pitchRaw = -0.14;

    /** 障碍物（来自 world.colliders），第三人称镜头撞上就拉近，不许穿墙 */
    this.colliders = [];

    this._pos = new THREE.Vector3();
    this._smooth = null;
    this._head = new THREE.Vector3();
    this._offset = new THREE.Vector3();
    this._look = new THREE.Vector3();

    /** 室内包围盒：进屋之后镜头必须留在屋里，否则会贴到墙里变成一整块墙皮 */
    this.bounds = null;

    canvas.addEventListener('click', () => {
      if (!this.locked && canvas.requestPointerLock) {
        const p = canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // 先累加到原始值，再吸附成格子 —— 直接对 yaw 吸附会被 round 吞掉位移，转不动
      this._yawRaw -= e.movementX * SENS_X;
      const [lo, hi] = this.pitchLimit();
      this._pitchRaw = clamp(this._pitchRaw - e.movementY * SENS_Y, lo, hi);
      this.yaw = Math.round(this._yawRaw / STEP_YAW) * STEP_YAW;
      this.pitch = Math.round(this._pitchRaw / STEP_PITCH) * STEP_PITCH;
    });
  }

  pitchLimit() {
    return PITCH_LIMITS[this.mode] || PITCH_LIMITS.third;
  }

  toggleMode() {
    this.mode = this.mode === 'third' ? 'first' : 'third';
    if (this.mode === 'third') this._smooth = null;
    // 切回来时可能超出新模式的上下限，立刻夹回合法区间，避免一进第三人称就是极端角度
    const [lo, hi] = this.pitchLimit();
    this.pitch = clamp(this.pitch, lo, hi);
    this._pitchRaw = clamp(this._pitchRaw, lo, hi);
    return this.mode;
  }

  /** 供测试与外部脚本使用 */
  setLook(yaw, pitch = this.pitch) {
    const [lo, hi] = this.pitchLimit();
    this.yaw = yaw;
    this.pitch = clamp(pitch, lo, hi);
    // 原始值必须一起写，否则下一次鼠标移动会把视角拽回旧位置
    this._yawRaw = this.yaw;
    this._pitchRaw = this.pitch;
  }

  update(dt, footPos, visibleCharacter) {
    // 切换模式或读档后可能残留在旧区间，先夹一次（原始值一起夹，不然会被吸附拉回去）
    const [lo, hi] = this.pitchLimit();
    this._pitchRaw = clamp(this._pitchRaw, lo, hi);
    if (this.pitch < lo) this.pitch = lo;
    else if (this.pitch > hi) this.pitch = hi;

    const head = this._head.set(footPos.x, footPos.y + 1.5, footPos.z);

    if (this.mode === 'first') {
      visibleCharacter.visible = false;
      this.camera.position.set(footPos.x, footPos.y + 1.62, footPos.z);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.set(this.pitch, this.yaw, 0);
      return;
    }

    visibleCharacter.visible = true;

    const cosP = Math.cos(this.pitch);
    const sinP = Math.sin(this.pitch);

    // 镜头位置用「绕行角度」算（安全区间内，不能钻地）；
    // 视线方向用真实 pitch 算（想抬头就抬头）。两者解耦，见 ORBIT_LIMITS 的注释。
    const orbit = clamp(this.pitch, ORBIT_LIMITS[0], ORBIT_LIMITS[1]);
    const cosO = Math.cos(orbit);
    const sinO = Math.sin(orbit);
    this._offset.set(
      Math.sin(this.yaw) * cosO,
      -sinO + 0.09,
      Math.cos(this.yaw) * cosO
    ).multiplyScalar(this.distance);

    this._pos.copy(head).add(this._offset);

    // 不让镜头穿进地面
    const minY = this.heightAt(this._pos.x, this._pos.z) + GROUND_MARGIN;
    if (this._pos.y < minY) this._pos.y = minY;

    // 撞上房子/大石就把镜头拉到障碍前面 —— 否则镜头会「透」进墙里，
    // 从屋里看出去是一整块墙皮，从屋外看是穿模
    if (this.colliders.length) this._avoidObstacles(head, this._pos);

    // 室内：沿着「头 → 镜头」这条射线往后收，收到墙就停。
    // 直接夹坐标会把镜头压成俯视，沿射线收才会留出走位感。
    if (this.bounds) this._pullIn(head, this._pos);

    if (!this._smooth) {
      this._smooth = this._pos.clone();
    } else {
      // 跟随收紧到 20/s：以前 14/s 的滞后会让人觉得画面在「漂」，也是晕的来源之一
      const k = 1 - Math.exp(-20 * Math.min(dt, 0.04));
      this._smooth.lerp(this._pos, k);
    }

    this.camera.position.copy(this._smooth);
    this.camera.up.set(0, 1, 0);
    // 屋里空间太小，镜头一收近就会满屏后脑勺——室内直接不画自己
    const d = this._smooth.distanceTo(head);
    visibleCharacter.visible = !this.bounds && d > 1.15;

    // 视线：从镜头出发，沿真实俯仰角延伸 10m 取一个点。
    // 抬头时这个点在头顶上方，画面就真的朝上；低头时在脚下。
    this._look
      .set(-Math.sin(this.yaw) * cosP, sinP, -Math.cos(this.yaw) * cosP)
      .multiplyScalar(10)
      .add(this._smooth);
    this.camera.lookAt(this._look);
  }

  /**
   * 第三人称镜头避障：从头沿「头 → 镜头」这条线做二维扫掠，
   * 撞到墙（矩形）或大石（大半径圆）就把镜头收到交点内侧。
   * 树干（r≈0.55）不参与 —— 树太密，每棵都收一次会让画面不停伸缩，比穿模更晕。
   */
  _avoidObstacles(head, pos) {
    const dx = pos.x - head.x;
    const dz = pos.z - head.z;
    if (dx * dx + dz * dz < 1e-4) return;

    let t = 1;
    for (let i = 0; i < this.colliders.length; i++) {
      const c = this.colliders[i];
      if (c.hx !== undefined) {
        const hit = rayRect(head.x, head.z, dx, dz, c, OBSTACLE_PAD);
        if (hit < t) t = hit;
      } else if (c.r !== undefined && c.r >= 1.0) {
        const hit = rayCircle(head.x, head.z, dx, dz, c, OBSTACLE_PAD);
        if (hit < t) t = hit;
      }
    }

    if (t >= 1) return;
    const k = Math.max(0.16, t - 0.02);
    pos.set(head.x + dx * k, head.y + (pos.y - head.y) * k, head.z + dz * k);
  }

  /** 把镜头沿视线拉回包围盒内（而不是横向夹死） */
  _pullIn(head, pos) {
    const b = this.bounds;
    const m = 0.22;
    const dx = pos.x - head.x, dy = pos.y - head.y, dz = pos.z - head.z;
    let t = 1;
    const hit = (h, d, lo, hi) => {
      if (d > 1e-5) t = Math.min(t, (hi - m - h) / d);
      else if (d < -1e-5) t = Math.min(t, (lo + m - h) / d);
    };
    hit(head.x, dx, b.minX, b.maxX);
    hit(head.y, dy, b.minY, b.maxY);
    hit(head.z, dz, b.minZ, b.maxZ);
    t = Math.max(0.12, Math.min(1, t));
    pos.set(head.x + dx * t, head.y + dy * t, head.z + dz * t);
  }
}
