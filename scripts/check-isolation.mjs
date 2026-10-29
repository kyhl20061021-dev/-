/**
 * 双线信息隔离检查 + 数据结构完整性检查
 * 运行： npm run check:isolation
 */
import { dylanRoute } from '../src/data/route-dylan.js';
import { tristanRoute } from '../src/data/route-tristan.js';

const FORBIDDEN_FOR_DYLAN = [
  '死', '亡', '灵魂', '魂魄', '摆渡人', '引路人', '恶魔', '鬼',
  '尸体', '墓', '葬礼', '投胎', '转世'
];

let failures = 0;
let checks = 0;

function ok(cond, label, detail = '') {
  checks++;
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? '  ->  ' + detail : ''}`);
  }
}

function collectText(route) {
  const out = [];
  for (const [key, d] of Object.entries(route.dialogues)) {
    for (const l of d.lines || []) out.push({ where: `${key}.line`, text: l.text || '' });
    for (const c of d.choices || []) {
      out.push({ where: `${key}.choice`, text: c.text || '' });
      for (const r of c.reply || []) out.push({ where: `${key}.reply`, text: r.text || '' });
    }
  }
  if (route.ending) {
    out.push({ where: 'ending.title', text: route.ending.title || '' });
    out.push({ where: 'ending.text', text: route.ending.text || '' });
  }
  // 第 8 章解锁的「另一视角」也是玩家能读到的文本，一样受隔离约束
  if (route.otherPov) {
    for (const e of route.otherPov.entries || []) {
      for (const l of e.lines || []) out.push({ where: `otherPov.${e.n}`, text: l.text || '' });
    }
  }
  return out;
}

console.log('\n[1] 迪伦线信息隔离');
{
  const texts = collectText(dylanRoute);
  const hits = [];
  for (const t of texts) {
    for (const word of FORBIDDEN_FOR_DYLAN) {
      if (t.text.includes(word)) hits.push(`${t.where} 含「${word}」：${t.text.slice(0, 26)}…`);
    }
  }
  ok(hits.length === 0, `迪伦线 ${texts.length} 条文本无越界提示`, hits.join(' / '));
}

console.log('\n[2] 崔斯坦线允许知情');
{
  const texts = collectText(tristanRoute);
  const hit = texts.some(t => t.text.includes('灵魂') || t.text.includes('完整'));
  ok(hit, `${texts.length} 条文本中存在知情视角的表达`);
}

console.log('\n[3] 对话结构完整性');
for (const route of [dylanRoute, tristanRoute]) {
  const names = Object.keys(route.dialogues);
  ok(names.length >= 4, `${route.id} 有 ${names.length} 段对话`);

  let emptyLine = 0;
  for (const d of Object.values(route.dialogues)) {
    for (const l of d.lines || []) if (!l.text || !l.text.trim()) emptyLine++;
  }
  ok(emptyLine === 0, `${route.id} 无空台词`, `空行 ${emptyLine}`);

  const badTriggers = route.triggers.filter(t => !route.dialogues[t.dialogue]);
  ok(badTriggers.length === 0, `${route.id} 所有触发器都指向存在的对话`,
    badTriggers.map(t => t.id).join(','));
}

console.log('\n[4] 触发器可达性（必须靠近小路，否则玩家找不到）');
{
  // 直接用与游戏一致的地形/路径数据做距离检查
  const { nearestPathInfo } = await import('../src/world/layout.js');
  for (const route of [dylanRoute, tristanRoute]) {
    const far = route.triggers
      .filter(t => !t.spawnLocal)
      .map(t => ({ id: t.id, d: nearestPathInfo(t.x, t.z).dist }))
      .filter(t => t.d > 14);
    ok(far.length === 0, `${route.id} 触发器均在小路 14m 内（出生点触发器除外）`,
      far.map(t => `${t.id}:${t.d.toFixed(1)}m`).join(','));
  }
}

console.log('\n[5] 两条线共用同一世界');
{
  const houseA = dylanRoute.triggers.find(t => t.id === 'house');
  const houseB = tristanRoute.triggers.find(t => t.id === 'house');
  ok(!!houseA && !!houseB, '两条线都有安全屋触发器');
  ok(houseA.x === houseB.x && houseA.z === houseB.z, '安全屋触发器坐标一致',
    `${houseA.x},${houseA.z} vs ${houseB.x},${houseB.z}`);

  ok(dylanRoute.spawn.x !== tristanRoute.spawn.x || dylanRoute.spawn.z !== tristanRoute.spawn.z,
    '两条线出生点不同');
  ok(dylanRoute.npc.name === '崔斯坦' && tristanRoute.npc.name === '迪伦',
    '两条线的 NPC 互为对方');
}

console.log(`\n结果：${checks - failures}/${checks} 通过\n`);
process.exit(failures === 0 ? 0 : 1);
