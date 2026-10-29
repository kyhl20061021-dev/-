import * as THREE from 'three';
import { moveWithCollisions, clampToWorld, lerpAngle, BODY_RADIUS } from './collision.js';
import { createCharacter } from '../entities/character.js';

const WALK = 4.2;
const RUN = 7.6;

export class Player {
  constructor(scene, heightAt, colliders, cfg = {}) {
    this.heightAt = heightAt;
    this.colliders = colliders;

    this.char = createCharacter(cfg.model || {});
    this.char.root.name = 'player';
    scene.add(this.char.root);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this._delta = new THREE.Vector3();
    this.speed01 = 0;
    this.frozen = false;
    this.cfg = cfg;
  }

  spawn(x, z, yaw = 0) {
    this.pos.set(x, this.heightAt(x, z), z);
    this.vel.set(0, 0, 0);
    this.char.root.position.copy(this.pos);
    this.char.root.rotation.y = yaw;
  }

  teleport(x, z) {
    this.pos.set(x, this.heightAt(x, z), z);
    this.char.root.position.copy(this.pos);
  }

  get facing() {
    const ry = this.char.root.rotation.y;
    return new THREE.Vector3(-Math.sin(ry), 0, -Math.cos(ry));
  }

  update(dt, input, cameraYaw) {
    const wish = new THREE.Vector3();

    if (!this.frozen) {
      const f = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
      const r = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);

      const fwd = new THREE.Vector3(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
      const right = new THREE.Vector3(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));

      wish.copy(fwd).multiplyScalar(f).addScaledVector(right, r);
      if (wish.lengthSq() > 0) wish.normalize();
    }

    const running = input.down('ShiftLeft') || input.down('ShiftRight');
    const targetSpeed = running ? RUN : WALK;
    const target = wish.multiplyScalar(targetSpeed);

    const k = 1 - Math.exp(-12 * dt);
    this.vel.lerp(target, k);
    if (this.vel.lengthSq() < 0.0004) this.vel.set(0, 0, 0);

    // 分步推进：单帧位移可能超过墙厚（掉帧 / 卡顿），一步到墙外就会穿过去
    this._delta.set(this.vel.x * dt, 0, this.vel.z * dt);
    moveWithCollisions(this.pos, this._delta, this.colliders, BODY_RADIUS);
    clampToWorld(this.pos);

    this.pos.y = this.heightAt(this.pos.x, this.pos.z);
    this.char.root.position.copy(this.pos);

    const horizontal = Math.hypot(this.vel.x, this.vel.z);
    this.speed01 = Math.min(1, horizontal / WALK);

    if (horizontal > 0.35) {
      const targetYaw = Math.atan2(-this.vel.x, -this.vel.z);
      this.char.root.rotation.y = lerpAngle(this.char.root.rotation.y, targetYaw, 1 - Math.exp(-14 * dt));
    }

    this.char.animate(dt, Math.min(1.35, this.speed01));
  }
}
