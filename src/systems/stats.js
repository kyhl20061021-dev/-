import { CANON } from '../core/canon.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * 三条状态数值（docs/mechanics.md §三）。
 *
 * 迪伦：灵魂完整度（生命值） + 信任
 * 崔斯坦：报废度（他这侧的「生命值」） + 信任
 *
 * 两条线共用「信任与羁绊」这一个数值，但存档各自独立。
 */
export class Stats {
  constructor(role = 'dylan') {
    this.role = role;
    this.integrity = CANON.integrity.start;
    this.trust = CANON.trust.start;
    this.anomaly = CANON.anomaly.start;
    this.dead = false;
    this.onDeath = null;
  }

  /** 迪伦没有报废度，崔斯坦没有完整度——对外统一成一个「生命条」 */
  get hp() {
    return this.role === 'dylan'
      ? this.integrity
      : CANON.integrity.max - this.anomaly;
  }

  /**
   * 应用一次性效果。fx 形如 { integrity: -10, trust: +6, anomaly: +3 }
   * 全部按 canon.js 的上下限裁剪，返回实际变化量（浮点误差取整）。
   */
  apply(fx = {}) {
    const before = this.snapshot();
    if (typeof fx.integrity === 'number') {
      this.integrity = clamp(this.integrity + fx.integrity, CANON.integrity.min, CANON.integrity.max);
    }
    if (typeof fx.trust === 'number') {
      this.trust = clamp(this.trust + fx.trust, CANON.trust.min, CANON.trust.max);
    }
    if (typeof fx.anomaly === 'number') {
      this.anomaly = clamp(this.anomaly + fx.anomaly, CANON.anomaly.min, CANON.anomaly.max);
    }
    this._checkDeath();
    const after = this.snapshot();
    return {
      integrity: +(after.integrity - before.integrity).toFixed(2),
      trust: +(after.trust - before.trust).toFixed(2),
      anomaly: +(after.anomaly - before.anomaly).toFixed(2)
    };
  }

  /**
   * 每秒调用的自然演变。
   * - 安全屋里：完整度缓回（迪伦）；崔斯坦没有完整度，改为不累积报废
   * - 荒原上且紧张：天气按恐惧扣完整度（-1%/分钟）
   * - 报废度：随剧情被动累积（崔斯坦）
   */
  update(dt, { safe = false, tension = 0 } = {}) {
    if (this.role === 'dylan') {
      if (this.dead) return;
      if (safe) {
        this.integrity = clamp(
          this.integrity + (CANON.integrity.safeRoomPerMin / 60) * dt,
          CANON.integrity.min, CANON.integrity.max
        );
      } else if (tension > 0.01) {
        // tension 越高，天气越坏，扣得越接近 -1%/分钟
        this.integrity = clamp(
          this.integrity + (CANON.integrity.weatherPerMin / 60) * dt * tension,
          CANON.integrity.min, CANON.integrity.max
        );
        this._checkDeath();
      }
    } else {
      if (!safe) {
        this.anomaly = clamp(
          this.anomaly + (CANON.anomaly.passivePerMin / 60) * dt,
          CANON.anomaly.min, CANON.anomaly.max
        );
      }
    }
  }

  /** 信任影响「恐惧」：越不信他，荒原越难走（心像投射） */
  get tension() {
    const t = this.trust / CANON.trust.max;
    const wound = this.role === 'dylan'
      ? 1 - this.integrity / CANON.integrity.max
      : this.anomaly / CANON.anomaly.max;
    return clamp(0.75 * (1 - t) + 0.45 * wound, 0, 1);
  }

  /** 羁绊等级：high / mid / low，用于决定崔斯坦的台词温度 */
  get bondLevel() {
    if (this.trust >= CANON.trust.high) return 'high';
    if (this.trust <= CANON.trust.low) return 'low';
    return 'mid';
  }

  snapshot() {
    return { integrity: this.integrity, trust: this.trust, anomaly: this.anomaly };
  }

  load(obj) {
    if (!obj) return;
    if (typeof obj.integrity === 'number') this.integrity = clamp(obj.integrity, 0, 100);
    if (typeof obj.trust === 'number') this.trust = clamp(obj.trust, 0, 100);
    if (typeof obj.anomaly === 'number') this.anomaly = clamp(obj.anomaly, 0, 100);
  }

  _checkDeath() {
    if (this.role !== 'dylan') return;
    if (!this.dead && this.integrity <= CANON.integrity.min) {
      this.dead = true;
      if (this.onDeath) this.onDeath();
    }
  }
}
