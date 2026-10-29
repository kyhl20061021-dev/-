import * as THREE from 'three';

/**
 * 心像投射（docs/story-bible.md「荒原」/ docs/glossary.md「心像投射」）
 *
 * 荒原不是客观场景，而是迪伦情绪的投影。这里只做最低成本、最能被感知的三件事：
 *   1. 雾的浓度      —— 越恐惧，看得越近；越安定，路越开
 *   2. 光的方向感    —— 紧张时月光压暗、雾色转冷；羁绊升高时掺一点暖
 *   3. 画面暗角      —— 等同于视野收窄，是「恐惧」在视觉上的直接翻译
 *
 * 全部做成阻尼插值，避免数值抖动导致画面闪。
 */
export class Mood {
  constructor(scene, { vigEl = null } = {}) {
    this.scene = scene;
    this.fog = scene.fog;
    this.baseDensity = this.fog ? this.fog.density : 0.0132;
    this.baseFogColor = this.fog ? this.fog.color.clone() : new THREE.Color(0x111a1e);

    this.hemi = scene.children.find((o) => o.isHemisphereLight) || null;
    this.moon = scene.children.find((o) => o.isDirectionalLight && o.castShadow) || null;
    this.baseMoon = this.moon ? this.moon.intensity : 1;

    this.vig = vigEl;
    this.eff = 0;      // 平滑后的「压迫强度」0..1
    this.warm = 0;     // 平滑后的「暖度」0..1
    this._vig = -1;    // 上一次写入的暗角不透明度，避免每帧触发样式重算

    /** 剧情结算下来的天气偏移：第 8 章她怎么反应，荒原就长成什么样 */
    this.biasFog = 0;
    this.biasWarm = 0;

    this._cold = new THREE.Color(0x3a444a);
    this._warmC = new THREE.Color(0x4a5142);
    this._tmp = new THREE.Color();
  }

  /**
   * 一次性写入天气偏移（-1..1 的倍数，不是绝对值）。
   * 只在下一次剧情结算时调用，不参与每帧插值，所以不会抖。
   */
  setBias({ fog = 0, warm = 0 } = {}) {
    this.biasFog = fog;
    this.biasWarm = warm;
  }

  /**
   * @param {number} dt 秒
   * @param {number} tension 0..1 恐惧 / 紧张（来自 Stats.tension）
   * @param {number} warmth  0..1 羁绊（来自 trust）
   */
  update(dt, { tension = 0, warmth = 0 } = {}) {
    // 只让「偏高」的部分生效，否则开局就一片糊
    const target = Math.max(0, tension - 0.35) / 0.65;
    const k = 1 - Math.exp(-dt * 0.9);
    this.eff += (target - this.eff) * k;
    this.warm += (warmth - this.warm) * k;

    if (this.fog) {
      const k2 = Math.max(-0.6, Math.min(0.9, this.biasFog));
      this.fog.density = Math.max(0.0035, this.baseDensity * (1 + 0.34 * this.eff + k2));
      this._tmp.copy(this._cold).lerp(this._warmC, Math.min(1, Math.max(0, this.warm * 0.85 + this.biasWarm * 0.4)));
      this.fog.color.copy(this.baseFogColor).lerp(this._tmp, 0.55 * Math.max(this.eff, this.warm));
    }

    if (this.moon) {
      this.moon.intensity = this.baseMoon * (1 - 0.12 * this.eff);
    }

    if (this.vig) {
      // 暗角基线从 0.92 收到 0.5：以前四角几乎是黑的，开阔地看久了很闷
      const o = +(0.38 + 0.34 * this.eff).toFixed(2);
      if (o !== this._vig) {
        this._vig = o;
        this.vig.style.opacity = String(o);
      }
    }
  }

  /** 进入安全屋后把投影重置到「平静」 */
  calm() {
    this.eff = 0;
    this.warm = Math.min(1, this.warm + 0.15);
  }
}
