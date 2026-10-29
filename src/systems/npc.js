import * as THREE from 'three';
import { moveWithCollisions, clampToWorld, lerpAngle, BODY_RADIUS } from './collision.js';
import { createCharacter } from '../entities/character.js';

export class NPC {
  constructor(scene, cfg) {
    this.name = cfg.name || 'npc';
    this.char = createCharacter(cfg.model || {});
    this.char.root.name = 'npc:' + this.name;
    scene.add(this.char.root);

    this.pos = new THREE.Vector3(cfg.x, 0, cfg.z);
    this.heightAt = cfg.heightAt;
    this.colliders = cfg.colliders || [];
    this.home = { x: cfg.x, z: cfg.z };
    this.behavior = cfg.behavior || 'wait';
    this.followDistance = cfg.followDistance ?? 2.9;
    /** lead：走在玩家斜前方多远（前方 / 侧向，米） */
    this.leadAhead = cfg.leadAhead ?? 3.2;
    this.leadSide = cfg.leadSide ?? 1.25;
    this.stuckTimer = 0;
    this.vel = new THREE.Vector3();
    this._delta = new THREE.Vector3();

    this.pos.y = this.heightAt(this.pos.x, this.pos.z);
    this.char.root.position.copy(this.pos);
    this.char.root.rotation.y = cfg.yaw ?? 0;
    this.speed01 = 0;
  }

  setBehavior(b) {
    this.behavior = b;
    if (b === 'wait') {
      this.home.x = this.pos.x;
      this.home.z = this.pos.z;
    }
  }

  update(dt, playerPos, playerFacing, playerVel) {
    const toPlayer = new THREE.Vector3().subVectors(playerPos, this.pos);
    toPlayer.y = 0;
    const dist = toPlayer.length();

    /**
     * 带路：走在玩家斜前方三步。
     *
     * 剧情里崔斯坦反复说「我一直在你前面三步」「你连头都不回」，
     * 而原来的 `follow` 让他跟在玩家背后 —— 台词和画面正好相反。
     * 这里按「玩家朝向 + 侧向偏移」算一个目标点，他先走到那儿再同步前进，
     * 玩家就真的是在跟着他走。侧向偏移是必须的：正前方 3 米会挡死镜头。
     */
    if (this.behavior === 'lead' && playerFacing) {
      const rx = -playerFacing.z, rz = playerFacing.x;   // 玩家右手边
      const tx = playerPos.x + playerFacing.x * this.leadAhead + rx * this.leadSide;
      const tz = playerPos.z + playerFacing.z * this.leadAhead + rz * this.leadSide;
      const dx = tx - this.pos.x, dz = tz - this.pos.z;
      const d = Math.hypot(dx, dz);

      if (d > 0.45) {
        // 基础速度跟玩家同步，再按落后距离补一点，避免他忽快忽慢地一顿一顿
        const base = playerVel ? Math.hypot(playerVel.x, playerVel.z) : 0;
        const speed = Math.min(9.2, Math.max(2.4, base + (d - 0.45) * 1.9));
        this._delta.set((dx / d) * speed * dt, 0, (dz / d) * speed * dt);
        moveWithCollisions(this.pos, this._delta, this.colliders, BODY_RADIUS);
        clampToWorld(this.pos);
        this.pos.y = this.heightAt(this.pos.x, this.pos.z);
        this.char.root.position.copy(this.pos);

        const targetYaw = Math.atan2(-dx, -dz);
        this.char.root.rotation.y = lerpAngle(this.char.root.rotation.y, targetYaw, 1 - Math.exp(-9 * dt));
        this.speed01 = Math.min(1.2, speed / 4);
      } else {
        // 到位了：停下，微微转向她
        this.speed01 *= Math.max(0, 1 - dt * 8);
        if (dist < 16) {
          const targetYaw = Math.atan2(-toPlayer.x, -toPlayer.z);
          this.char.root.rotation.y = lerpAngle(this.char.root.rotation.y, targetYaw, 1 - Math.exp(-3 * dt));
        }
      }
    } else if (this.behavior === 'follow' && dist > this.followDistance) {
      const dir = toPlayer.clone().normalize();
      const speed = Math.min(8.6, 3.0 + (dist - this.followDistance) * 1.35);
      // 同样分步推进，否则他会在掉帧时穿墙/穿石头追上来
      this._delta.copy(dir).multiplyScalar(speed * dt);
      moveWithCollisions(this.pos, this._delta, this.colliders, BODY_RADIUS);
      clampToWorld(this.pos);
      this.pos.y = this.heightAt(this.pos.x, this.pos.z);
      this.char.root.position.copy(this.pos);

      const targetYaw = Math.atan2(-dir.x, -dir.z);
      this.char.root.rotation.y = lerpAngle(this.char.root.rotation.y, targetYaw, 1 - Math.exp(-10 * dt));
      this.speed01 = Math.min(1.2, speed / 4);
    } else {
      // 站定时面向玩家
      if (dist < 14) {
        const targetYaw = Math.atan2(-toPlayer.x, -toPlayer.z);
        this.char.root.rotation.y = lerpAngle(this.char.root.rotation.y, targetYaw, 1 - Math.exp(-4 * dt));
      }
      this.speed01 *= Math.max(0, 1 - dt * 8);
    }

    this.char.animate(dt, this.speed01);
  }

  distanceTo(p) {
    return Math.hypot(this.pos.x - p.x, this.pos.z - p.z);
  }
}
