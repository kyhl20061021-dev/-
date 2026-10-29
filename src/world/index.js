import { buildTerrain, heightAt } from './terrain.js';
import {
  buildSky, buildLights, buildRocks, buildGrass,
  buildTrees, buildSafeHouse, buildTunnel, buildParticles
} from './props.js';
import { decorate } from './vegetation.js';

export function createWorld(scene) {
  const colliders = [];

  buildSky(scene);
  buildLights(scene);
  buildTerrain(scene);

  const safehouse = buildSafeHouse(scene, colliders);
  const tunnel = buildTunnel(scene, colliders);
  const baseParticles = buildParticles(scene);

  /** 炉火的呼吸：让屋里唯一的光源活着，而不是一块常亮的贴图 */
  const updateParticles = (dt) => {
    baseParticles(dt);
    const t = performance.now() * 0.001;
    const f = 0.84 + Math.sin(t * 7.3) * 0.08 + Math.sin(t * 13.7) * 0.05;
    if (safehouse.fireLight) safehouse.fireLight.intensity = safehouse.baseFireIntensity * f;
    if (safehouse.flame) {
      safehouse.flame.scale.set(1, 0.9 + Math.sin(t * 9.1) * 0.13, 1);
      safehouse.flame.rotation.y = Math.sin(t * 3.4) * 0.25;
    }
  };

  const world = {
    heightAt,
    colliders,
    safehouse,
    tunnel,
    updateParticles,
    decorated: false,
    vegStats: null
  };

  /**
   * 铺植被。资源包模型来自 Unity《Meadow Environment》，
   * 加载失败时退回原来那套程序化占位物，保证场景不会空掉。
   */
  world.decorate = async (onProgress) => {
    try {
      const r = await decorate(scene, { colliders, onProgress });
      world.decorated = true;
      world.vegStats = r.stats;
      return r;
    } catch (err) {
      console.warn('[vegetation] 资源包植被加载失败，退回程序化占位：', err);
      buildRocks(scene, colliders);
      buildGrass(scene);
      buildTrees(scene, colliders);
      return null;
    }
  };

  return world;
}
