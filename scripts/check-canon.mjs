/**
 * 设定一致性检查：把 docs/ 下三份文档（故事圣经 / 机制 / 术语库）
 * 变成可执行的断言，防止后续改剧情时悄悄违背「最高指令」。
 *
 * 运行： npm run check:canon
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { dylanRoute } from '../src/data/route-dylan.js';
import { tristanRoute } from '../src/data/route-tristan.js';
import { CANON, canPeekOtherPov } from '../src/core/canon.js';
import { HOUSE_POS } from '../src/world/layout.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let checks = 0;
let failures = 0;
function ok(cond, label, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? '  ->  ' + detail : ''}`);
  }
}

/* ------------------------------------------------------------------ */
/* 1. 文档本身：必须存在且包含关键锚点                                    */
/* ------------------------------------------------------------------ */
console.log('\n[1] 设定文档');
const docs = {
  'docs/story-bible.md': ['四幕情绪曲线', '安全屋逼问', '荒原逆行', '心像的投射'],
  'docs/mechanics.md': ['视角切换与解锁机制', 'QTE 判定规则', '灵魂完整度', '信任与羁绊', '报废度'],
  'docs/glossary.md': ['摆渡人', '恶魔', '分界线', '记录室', '钴蓝色', '单向玻璃']
};
for (const [file, anchors] of Object.entries(docs)) {
  let text = '';
  try { text = read(file); } catch { /* 缺失在下面报 */ }
  ok(text.length > 200, `${file} 存在且非空`, text ? `${text.length} 字符` : '文件缺失');
  const miss = anchors.filter((a) => !text.includes(a));
  ok(miss.length === 0, `${file} 关键锚点齐全`, miss.join(','));
}

/* ------------------------------------------------------------------ */
/* 2. 术语：全局禁用词                                                  */
/* ------------------------------------------------------------------ */
function collect(route) {
  const out = [];
  for (const [k, d] of Object.entries(route.dialogues)) {
    for (const l of d.lines || []) out.push({ where: `${k}.line`, text: l.text || '', fx: l.fx });
    for (const c of d.choices || []) {
      out.push({ where: `${k}.choice`, text: c.text || '', fx: c.fx });
      for (const r of c.reply || []) out.push({ where: `${k}.reply`, text: r.text || '', fx: r.fx });
    }
    if (d.fx) out.push({ where: `${k}.dialogue`, text: '', fx: d.fx });
  }
  if (route.ending) {
    out.push({ where: 'ending.title', text: route.ending.title || '' });
    out.push({ where: 'ending.text', text: route.ending.text || '' });
  }
  return out;
}

const allText = [
  ...collect(dylanRoute).map((x) => ({ ...x, route: 'dylan' })),
  ...collect(tristanRoute).map((x) => ({ ...x, route: 'tristan' }))
];

console.log('\n[2] 术语（docs/glossary.md）');
const GLOBAL_BANNED = ['死神', '天使', '丧尸', '僵尸', '幽灵', '鬼魂'];
const hits = allText.filter((x) => GLOBAL_BANNED.some((w) => x.text.includes(w)));
ok(hits.length === 0, '全局无「死神/天使/丧尸/幽灵」类错误称谓',
  hits.map((h) => `${h.route}.${h.where}:${h.text.slice(0, 12)}`).join(' | '));

/* 迪伦线：她不知道自己已死，任何解释性词汇都是剧透 */
const DYLAN_BANNED = [
  '死', '亡', '灵魂', '魂魄', '摆渡人', '引路人', '恶魔', '鬼',
  '尸体', '墓', '葬礼', '投胎', '转世',
  '完整度', '分界线', '心像', '名册', '逆行', '彼岸', '审判官'
];
console.log('\n[3] 迪伦线信息隔离');
const dylanTexts = allText.filter((x) => x.route === 'dylan');
const leak = dylanTexts.filter((x) => DYLAN_BANNED.some((w) => x.text.includes(w)));
ok(leak.length === 0, '迪伦线台词无真相提示词',
  leak.map((h) => `${h.where}:${h.text.slice(0, 14)}`).join(' | '));

/* 崔斯坦线：他知道真相，但不能知道迪伦没告诉他的私事 */
const TRISTAN_PRIVATE = ['她妈妈', '她父亲', '她爸妈', '她小时候', '她生前', '火车事故', '她家', '她十五岁'];
console.log('\n[4] 崔斯坦线信息边界');
const peek = allText
  .filter((x) => x.route === 'tristan')
  .filter((x) => TRISTAN_PRIVATE.some((w) => x.text.includes(w)));
ok(peek.length === 0, '崔斯坦没有读取迪伦的私人记忆',
  peek.map((h) => `${h.where}:${h.text.slice(0, 14)}`).join(' | '));

/* ------------------------------------------------------------------ */
/* 5. 数值：只有三条轴，且单次变化不超过 canon 上限                       */
/* ------------------------------------------------------------------ */
console.log('\n[5] 数值系统（docs/mechanics.md §三）');
const ALLOWED = ['integrity', 'trust', 'anomaly'];
const badKey = [];
const badRange = [];
for (const x of allText) {
  if (!x.fx) continue;
  for (const [k, v] of Object.entries(x.fx)) {
    if (!ALLOWED.includes(k)) badKey.push(`${x.route}:${k}`);
    if (k === 'integrity' && (v > 0 || v < CANON.integrity.demonTouch)) badRange.push(`${x.route}:integrity=${v}`);
    if (k === 'trust' && Math.abs(v) > 20) badRange.push(`${x.route}:trust=${v}`);
    if (k === 'anomaly' && Math.abs(v) > 10) badRange.push(`${x.route}:anomaly=${v}`);
  }
}
ok(badKey.length === 0, '没有第四种数值轴', badKey.join(','));
ok(badRange.length === 0, '单次变化都在 canon 允许范围内', badRange.join(','));

ok(dylanRoute.role === 'dylan' && tristanRoute.role === 'tristan', '两条线都声明了 role');
ok(CANON.integrity.start === 100 && CANON.trust.start === 0 && CANON.anomaly.start === 0,
  '初始值符合文档（完整度 100 / 信任 0 / 报废 0）');

/* ------------------------------------------------------------------ */
/* 6. 钴蓝色：崔斯坦的唯一标识，两条线必须是同一个值                       */
/* ------------------------------------------------------------------ */
console.log('\n[6] 钴蓝色标识');
const dTristan = dylanRoute.npc.model.eyes;
const tTristan = tristanRoute.playerModel.eyes;
ok(dTristan === CANON.cobalt, '迪伦线里的崔斯坦是钴蓝色眼睛', `0x${dTristan?.toString(16)}`);
ok(tTristan === CANON.cobalt, '崔斯坦线里的自己也是钴蓝色', `0x${tTristan?.toString(16)}`);
ok(dylanRoute.playerModel.eyes === CANON.dylanEyes, '迪伦不是钴蓝色');
ok(tristanRoute.npc.model.eyes === CANON.dylanEyes, '崔斯坦眼里的迪伦也不是钴蓝色');

/* ------------------------------------------------------------------ */
/* 7. 视角解锁节点                                                      */
/* ------------------------------------------------------------------ */
console.log('\n[7] 视角规则');
ok(canPeekOtherPov(7) === false, '第 7 章仍锁定单视角');
ok(canPeekOtherPov(8) === true, '第 8 章开放「回忆查看」');
ok(CANON.pivot.boundaryChapter === 20, '强制双视角互换在第 20 章');

/* ------------------------------------------------------------------ */
/* 8. UI 措辞：迪伦在知道真相前不能看到「灵魂」二字                        */
/* ------------------------------------------------------------------ */
console.log('\n[8] UI 措辞');
const html = read('index.html');
ok(html.includes('data-stat="integrity"'), 'HUD 有完整度一行');
ok(html.includes('气息'), '默认标签用「气息」而不是「灵魂完整度」');
const hudSrc = read('src/ui/hud.js');
ok(hudSrc.includes('setStatLabel'), 'HUD 支持运行时改标签名');
const mainSrc = read('src/main.js');
ok(mainSrc.includes("revealed ? '灵魂完整度' : '气息'"), '真相揭示后才切换成「灵魂完整度」');


/* ------------------------------------------------------------------ */
/* 9. 章节推进（第 1–8 章一幕，第 9 章起同行）                            */
/* ------------------------------------------------------------------ */
console.log('\n[9] 章节与视角解锁');
for (const r of [dylanRoute, tristanRoute]) {
  const marks = [];
  const bad = [];
  for (const [k, d] of Object.entries(r.dialogues)) {
    let prev = d.chapter || 0;
    if (d.chapter) marks.push({ where: k, c: d.chapter });
    for (const l of d.lines || []) {
      if (!l.chapter) continue;
      if (l.chapter < prev) bad.push(`${k}: ${prev} -> ${l.chapter}`);
      prev = l.chapter;
      marks.push({ where: `${k}.line`, c: l.chapter });
    }
  }
  const maxC = Math.max(...marks.map((m) => m.c));
  ok(marks.length >= 6, `${r.id} 有章节推进标记`, `${marks.length} 处`);
  ok(bad.length === 0, `${r.id} 章号只增不减`, bad.join(','));
  ok(maxC === CANON.chapters.actTwoStart, `${r.id} 第一幕止于第 9 章`, `最高 ${maxC}`);
  ok(marks.every((m) => m.c >= 1 && m.c <= CANON.chapters.actTwoStart), `${r.id} 章号在 1–9 之间`,
    marks.filter((m) => m.c < 1 || m.c > 9).map((m) => m.where).join(','));

  // 另一视角：8 章、只读、不覆盖第 9 章之后
  const entries = r.otherPov ? r.otherPov.entries : [];
  ok(entries.length === CANON.chapters.reviewCount, `${r.id} 另一视角共 8 章`, `${entries.length} 章`);
  ok(entries.every((e) => e.n >= 1 && e.n <= CANON.pov.unlockAt), `${r.id} 另一视角只覆盖第 1–8 章`);
  ok(entries.every((e) => (e.lines || []).length > 0 && e.lines.length <= 4),
    `${r.id} 每章补写不超过 4 行`, entries.filter((e) => e.lines.length > 4).map((e) => e.n).join(','));
}

ok(canPeekOtherPov(CANON.pov.unlockAt - 1) === false, '第 8 章之前拿不到另一视角');
ok(canPeekOtherPov(CANON.pov.unlockAt) === true, '第 8 章读完后解锁另一视角');
ok(CANON.pov.autoOpen === false, '另一视角不自动弹出（可选回看）');

/* ------------------------------------------------------------------ */
/* 10. 限时选择与失败回溯                                                */
/* ------------------------------------------------------------------ */
console.log('\n[10] 失败机制');
for (const r of [dylanRoute, tristanRoute]) {
  const timed = Object.entries(r.dialogues).filter(([, d]) => d.timeLimit && d.checkpoint);
  ok(timed.length >= 1, `${r.id} 有限时选择`, `${timed.length} 处`);
  for (const [k, d] of timed) {
    const idx = typeof d.timeoutChoice === 'number' ? d.timeoutChoice : 0;
    const c = d.choices && d.choices[idx];
    ok(!!c, `${r.id}.${k} 超时选项存在`, `index ${idx}`);
    ok(!!(c && typeof c.action === 'string' && c.action.startsWith('fail:')),
      `${r.id}.${k} 不选也要付代价（超时落到失败分支）`, c && c.action);
    const key = c && c.action ? c.action.slice(5) : null;
    ok(!!(key && r.failures && r.failures[key]), `${r.id}.${k} 失败结局有文案`, key);
    ok(!!(key && r.failures[key] && r.failures[key].rewind), `${r.id}.${k} 失败提供「回到之前」`, key);
    ok(d.timeLimit >= 6 && d.timeLimit <= 15, `${r.id}.${k} 倒计时长度合理`, `${d.timeLimit}s`);
    ok(!!d.checkpoint, `${r.id}.${k} 选择前打了检查点`);
  }
}
ok(CANON.failure.rewind === true, '设定层写明：失败必须可回溯，不惩罚读者');

/* ------------------------------------------------------------------ */
/* 11. 选择不改变终点（只影响描写密度与情绪反馈）                          */
/* ------------------------------------------------------------------ */
console.log('\n[11] 分支收敛');
const confront = dylanRoute.dialogues.confront;
const truthLine = (confront.lines || []).find((l) => (l.set || []).includes('knows_truth'));
ok(!!truthLine, '迪伦线：真相由台词置位，三条分支共用同一段');
const cIdx = typeof confront.timeoutChoice === 'number' ? confront.timeoutChoice : 0;
const cTimeout = confront.choices && confront.choices[cIdx];
ok(!!(cTimeout && !cTimeout.action), '第 8 章超时 = 沉默，是分支不是结局', cTimeout && cTimeout.action);
const cf = tristanRoute.dialogues.confess;
ok((cf.choices || []).every((c) => (c.set || []).includes('told_truth')),
  '崔斯坦线：每个分支都必须把话说出口');

/* ------------------------------------------------------------------ */
/* 12. 屋内疑点：必须真的在屋里                                          */
/* ------------------------------------------------------------------ */
console.log('\n[12] 屋内疑点');
for (const r of [dylanRoute, tristanRoute]) {
  for (const h of r.hotspots || []) {
    const d = Math.hypot(h.x - HOUSE_POS.x, h.z - HOUSE_POS.z);
    ok(d < 3.2, `${r.id}.${h.id} 在屋里（离屋心 ${d.toFixed(1)}m）`);
    ok(!!r.dialogues[h.dialogue], `${r.id}.${h.id} 指向存在的对话`);
    ok(!!h.prompt, `${r.id}.${h.id} 有交互提示文案`);
  }
}

/* ------------------------------------------------------------------ */
/* 13. UI 载体存在                                                      */
/* ------------------------------------------------------------------ */
console.log('\n[13] UI 载体');
ok(html.includes('id="povPanel"'), '有「另一视角」面板');
ok(html.includes('class="dtimer'), '有倒计时条');
ok(html.includes('id="endRewind"'), '有「回到选择之前」按钮');
ok(html.includes('id="endKicker"'), '幕间/失败卡的标题可替换');

/* ------------------------------------------------------------------ */
console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}  ${checks - failures}/${checks} 项通过`);
process.exit(failures === 0 ? 0 : 1);
