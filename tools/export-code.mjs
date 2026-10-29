/**
 * 把整个项目的源码导出成「一个文件」，方便归档、发给别人、或者丢给另一个 AI 读。
 *
 * 收录范围：手写的源码 + 配置 + 设定文档。
 * 不收录：node_modules / dist（构建产物）/ public（模型贴图等二进制）/ shots（截图）
 *         / package-lock.json（自动生成、几十万行、没有阅读价值）/ tools/fbx（原始素材）
 *
 * 用法：
 *   node tools/export-code.mjs                    → 写到 E:/代码/摆渡人-全部代码.md
 *   OUT_DIR=D:/xxx node tools/export-code.mjs     → 换输出目录
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJ = path.resolve(HERE, '..');            // ferryman-3d
const WORK = path.resolve(PROJ, '..');            // 工作区根，act1 在隔壁
const OUT_DIR = process.env.OUT_DIR || 'E:/代码';
const OUT_FILE = path.join(OUT_DIR, process.env.OUT_NAME || '摆渡人-全部代码.md');

/** 每个分组：标题 + 说明 + 若干「相对 WORK 的路径」 */
const GROUPS = [
  {
    title: '第一部分 · 说明与设定（先读这些）',
    note: '世界观是最高指令：剧情、关卡、AI 行为都按 docs/ 下的三份文档执行，glossary 里的禁用词不能出现在迪伦线文本里。',
    files: [
      'ferryman-3d/README.md',
      'ferryman-3d/docs/story-bible.md',
      'ferryman-3d/docs/mechanics.md',
      'ferryman-3d/docs/glossary.md',
      'ferryman-3d/docs/AI-CONTRACT.md',
      'ferryman-act1/story-bible.md',
      'ferryman-act1/mechanics.md',
    ],
  },
  {
    title: '第二部分 · 入口与配置',
    note: '`index.html` 是所有 UI 的 DOM 骨架（HUD / 菜单 / 对话 / 限时条 / 另一视角面板 / 结局卡），`src/styles.css` 是它们的外观。',
    files: [
      'ferryman-3d/index.html',
      'ferryman-3d/vite.config.js',
      'ferryman-3d/package.json',
      'ferryman-3d/start-game.bat',
    ],
  },
  {
    title: '第三部分 · 主程序与样式',
    note: '`main.js` 是唯一的装配点：建世界、开章节、推进触发器、收口限时选择、回溯检查点、存档。改剧情流转基本都在这。',
    files: [
      'ferryman-3d/src/main.js',
      'ferryman-3d/src/styles.css',
    ],
  },
  {
    title: '第四部分 · core（不含业务逻辑的底层）',
    note: '`canon.js` 是「设定的可执行版本」——章节数、视角解锁章节、真相代价、失败时限这些数字只在它里面出现一次，剧本与 UI 都从这里取。',
    files: [
      'ferryman-3d/src/core/canon.js',
      'ferryman-3d/src/core/noise.js',
      'ferryman-3d/src/core/save.js',
    ],
  },
  {
    title: '第五部分 · world（地形、植被、道具、布局）',
    note: '地形与植被是程序化生成 + Unity《Meadow Environment》资源包的模型实例化。`heightAt()` 是全世界唯一的地面高度来源，玩家、相机、植被摆放都问它。',
    files: [
      'ferryman-3d/src/world/index.js',
      'ferryman-3d/src/world/terrain.js',
      'ferryman-3d/src/world/heightfield.js',
      'ferryman-3d/src/world/vegetation.js',
      'ferryman-3d/src/world/props.js',
      'ferryman-3d/src/world/layout.js',
    ],
  },
  {
    title: '第六部分 · systems（玩家、相机、碰撞、对话、音效、数值、心像）',
    note: '限时选择在 `dialogue.js`（选项摆出来才开始计时，归零由系统代选）；镜头避障与俯仰解耦在 `cameraRig.js`；防穿墙的分步推进在 `collision.js` 的 `moveWithCollisions`。',
    files: [
      'ferryman-3d/src/systems/player.js',
      'ferryman-3d/src/systems/cameraRig.js',
      'ferryman-3d/src/systems/collision.js',
      'ferryman-3d/src/systems/npc.js',
      'ferryman-3d/src/systems/input.js',
      'ferryman-3d/src/systems/dialogue.js',
      'ferryman-3d/src/systems/stats.js',
      'ferryman-3d/src/systems/mood.js',
      'ferryman-3d/src/systems/audio.js',
    ],
  },
  {
    title: '第七部分 · data（两条视角线的全部剧本）',
    note: '双主角双路线，信息严格隔离：迪伦线不得提前出现「你已经死了」，崔斯坦线不得出现迪伦的私事。两条线由 `scripts/check-isolation.mjs` 静态扫描 + 运行期复核。',
    files: [
      'ferryman-3d/src/data/route-dylan.js',
      'ferryman-3d/src/data/route-tristan.js',
    ],
  },
  {
    title: '第八部分 · entities 与 ui',
    note: '`pov.js` 是第 8 章读完后用 Tab 打开的「另一视角」回看面板：左目录右正文，只读、不推进剧情。',
    files: [
      'ferryman-3d/src/entities/character.js',
      'ferryman-3d/src/ui/hud.js',
      'ferryman-3d/src/ui/pov.js',
    ],
  },
  {
    title: '第九部分 · 静态检查与自动化测试',
    note: '`check-canon` 是「设定不能自相矛盾」的断言集；`check-isolation` 是禁词扫描；`smoke-test` 与 `flow-ch8` 用 puppeteer 驱动真实 Chrome 跑流程（headless + SwiftShader 只有个位数帧率，断言会全在测渲染器，不可用）。',
    files: [
      'ferryman-3d/scripts/check-canon.mjs',
      'ferryman-3d/scripts/check-isolation.mjs',
      'ferryman-3d/scripts/smoke-test.mjs',
      'ferryman-3d/scripts/shots.mjs',
    ],
  },
  {
    title: '第十部分 · tools（资源转换与验收探针）',
    note: '`build-models.mjs` 把 Unity `.unitypackage` 解包成自定义二进制几何；`convert-textures.mjs` 把 4K TIF 降成 PNG，**贴图是按名字硬编码引用的，漏加白名单不会报错，只会让模型悄悄变黑**。',
    files: [
      'ferryman-3d/tools/build-models.mjs',
      'ferryman-3d/tools/convert-textures.mjs',
      'ferryman-3d/tools/make-detail.mjs',
      'ferryman-3d/tools/flow-ch8.mjs',
      'ferryman-3d/tools/probe-feel.mjs',
      'ferryman-3d/tools/probe-assets.mjs',
      'ferryman-3d/tools/probe-indoor.mjs',
      'ferryman-3d/tools/probe-look.mjs',
      'ferryman-3d/tools/perf.mjs',
      'ferryman-3d/tools/closeup.mjs',
      'ferryman-3d/tools/shot-inside.mjs',
      'ferryman-3d/tools/shots2.mjs',
      'ferryman-3d/tools/shots3.mjs',
      'ferryman-3d/tools/probe.mjs',
      'ferryman-3d/tools/probe2.mjs',
      'ferryman-3d/tools/probe3.mjs',
      'ferryman-3d/tools/probe-boot.mjs',
      'ferryman-3d/tools/probe-nav.mjs',
      'ferryman-3d/tools/probe-veg.mjs',
      'ferryman-3d/tools/probe-load.mjs',
      'ferryman-3d/tools/export-code.mjs',
    ],
  },
  {
    title: '第十一部分 · 第一阶段 2D 切片（单文件，可双击运行）',
    note: '这是最早做的那一版，用来验证「沉默压迫 + 限时选择」的手感。零依赖、不用构建，双击 `index.html` 就能玩，留作设计参照。',
    files: ['ferryman-act1/index.html'],
  },
];

const LANG = {
  '.js': 'js', '.mjs': 'js', '.css': 'css', '.html': 'html',
  '.json': 'json', '.md': 'md', '.bat': 'bat',
};

const read = (rel) => {
  const abs = path.join(WORK, rel);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
};

/** 代码块围栏要比正文里最长的一串反引号更长，否则内容会被截断 */
function fenceFor(text) {
  let max = 0;
  for (const m of text.matchAll(/`+/g)) max = Math.max(max, m[0].length);
  return '`'.repeat(Math.max(3, max + 1));
}

const out = [];
let fileCount = 0;
let lineCount = 0;
const missing = [];

const now = new Date();
const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

// 先扫一遍，拿到统计与目录
const sections = [];
for (const g of GROUPS) {
  const items = [];
  for (const rel of g.files) {
    const text = read(rel);
    if (text === null) { missing.push(rel); continue; }
    const lines = text.split('\n');
    const n = text.endsWith('\n') ? lines.length - 1 : lines.length;
    items.push({ rel, text, n });
    fileCount += 1;
    lineCount += n;
  }
  sections.push({ ...g, items });
}

// ── 封面
out.push('# 《摆渡人：荒原之间》全部代码');
out.push('');
out.push(`> 导出于 ${stamp} ｜ 共 **${fileCount}** 个文件、**${lineCount.toLocaleString('en-US')}** 行`);
out.push('>');
out.push('> 这份文件是把项目里**手写的全部源码、配置与设定文档**按目录拼成的一份，可以直接通读，也可以照着逐文件还原成一个能跑的项目。');
out.push('> 二进制资源（模型 `.bin`、贴图 `.png`）、构建产物（`dist/`）、依赖（`node_modules/`）不在其中——它们靠命令重新生成或安装，见下面的「怎么跑起来」。');
out.push('');

// ── 怎么跑
out.push('## 怎么跑起来');
out.push('');
out.push('```bash');
out.push('cd ferryman-3d');
out.push('npm install          # 依赖只有 three + vite + puppeteer-core（测试用）');
out.push('npm run dev          # → http://127.0.0.1:5178/   开发模式，改代码会热更新');
out.push('npm run build        # → dist/');
out.push('npm run preview      # → http://127.0.0.1:5179/   跑构建产物');
out.push('');
out.push('npm run check        # 89 项静态检查（设定自洽 + 双线信息隔离）');
out.push('node tools/flow-ch8.mjs   # 第 1–9 章流程实测，39 项，需要先 build + preview');
out.push('```');
out.push('');
out.push('**只想玩**：双击 `start-game.bat`（桌面上那份 `Ferryman.bat` 内容相同）。它会自己判断要不要构建、要不要起服务，然后打开浏览器。');
out.push('');
out.push('**不能直接双击 `dist/index.html`**：页面是 ES module，模型还用 `fetch` 读 `.bin`，`file://` 协议下会被 CORS 拦掉，必须有一个本地 HTTP 服务。');
out.push('');
out.push('> 第一阶段的 2D 切片是例外：`ferryman-act1/index.html` 零依赖、零构建，双击就能玩。');
out.push('');

// ── 目录
out.push('## 目录');
out.push('');
for (const [i, s] of sections.entries()) {
  out.push(`${i + 1}. **${s.title}**`);
  for (const it of s.items) {
    out.push(`   - \`${it.rel}\` — ${it.n} 行`);
  }
}
out.push('');

// ── 正文
for (const s of sections) {
  out.push('---');
  out.push('');
  out.push(`# ${s.title}`);
  out.push('');
  if (s.note) { out.push(s.note); out.push(''); }

  for (const it of s.items) {
    out.push(`## \`${it.rel}\``);
    out.push('');
    out.push(`<sub>${it.n} 行</sub>`);
    out.push('');
    const fence = fenceFor(it.text);
    out.push(fence + (LANG[path.extname(it.rel)] || ''));
    out.push(it.text.replace(/\n$/, ''));
    out.push(fence);
    out.push('');
  }
}

// ── 结尾
out.push('---');
out.push('');
out.push('## 附：这份代码里最容易踩的坑');
out.push('');
out.push('1. **全屏遮罩不要加 `backdrop-filter`。** 盖在 WebGL 画布上会拖死合成器：截图挂起、`requestAnimationFrame` 不再推进，看起来像「游戏逻辑坏了」，其实是 CSS。');
out.push('2. **`InstancedMesh` 的材质必须是白色。** 颜色只放在 `instanceColor` 里，否则会被乘两次，草和石头全黑。');
out.push('3. **`vite build` 会先清空 `dist/`。** 构建被打断会留下一个没有 `assets/` 的空壳，预览服务器照常返回 200，但页面是空的。');
out.push('4. **贴图按名字硬编码引用。** 漏加白名单不报错，只让模型悄悄变黑。加资源后跑一次 `node tools/probe-assets.mjs`。');
out.push('5. **真实窗口被挡住时 Chrome 会停掉 rAF。** 自动化测试的启动参数必须带 `--disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-features=CalculateNativeWinOcclusion`，并 `page.bringToFront()`。');
out.push('6. **headless + SwiftShader 只有个位数帧率。** 任何「走 N 米 / 等 N 秒」的断言都在测渲染器，不在测游戏。');
out.push('7. **限时选择只在选项摆出来之后才计时**，超时是「系统代选」，不等于失败；第 8 章超时走的是「沉默」这条分支，不是坏结局。');
out.push('');

fs.mkdirSync(OUT_DIR, { recursive: true });
const body = out.join('\n');
fs.writeFileSync(OUT_FILE, body, 'utf8');

const kb = (Buffer.byteLength(body, 'utf8') / 1024).toFixed(0);
console.log(`写入 ${OUT_FILE}`);
console.log(`  ${fileCount} 个文件 / ${lineCount} 行 / ${kb} KB`);

// ── 同一份内容再出一个 HTML：双击就能读，左边目录可跳转，浏览器 Ctrl+F 直接搜
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const navHtml = sections.map((s, i) => `
  <div class="grp">
    <a class="gt" href="#g${i}">${esc(s.title)}</a>
    ${s.items.map((it, j) => `<a class="fi" href="#f${i}-${j}">${esc(it.rel.replace(/^ferryman-3d\//, '').replace(/^ferryman-act1\//, 'act1/'))}<b>${it.n}</b></a>`).join('')}
  </div>`).join('');

const mainHtml = sections.map((s, i) => `
  <section id="g${i}">
    <h2>${esc(s.title)}</h2>
    ${s.note ? `<p class="note">${esc(s.note)}</p>` : ''}
    ${s.items.map((it, j) => `
      <article id="f${i}-${j}">
        <h3><code>${esc(it.rel)}</code><span>${it.n} 行</span></h3>
        <pre><code>${esc(it.text)}</code></pre>
      </article>`).join('')}
  </section>`).join('');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>《摆渡人：荒原之间》全部代码</title>
<style>
  :root {
    --paper: #f7f4ee; --card: #fffdf8; --ink: #23201b; --dim: #6b6459;
    --line: #e0d9cc; --accent: #8c3f2b; --code-bg: #fbf9f4;
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    margin: 0; background: var(--paper); color: var(--ink);
    font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    display: flex; min-height: 100vh;
  }
  nav {
    width: 300px; flex: 0 0 300px; height: 100vh; overflow-y: auto;
    background: #efeae0; border-right: 1px solid var(--line);
    padding: 18px 14px 60px; position: sticky; top: 0;
    font-size: 12px; line-height: 1.7;
  }
  nav .head { font-weight: 700; font-size: 13px; margin-bottom: 4px; }
  nav .meta { color: var(--dim); font-size: 11px; margin-bottom: 14px; }
  nav .grp { margin-bottom: 12px; }
  nav .gt {
    display: block; font-weight: 600; color: var(--accent);
    text-decoration: none; padding: 3px 0; border-bottom: 1px solid var(--line);
  }
  nav .fi {
    display: flex; justify-content: space-between; gap: 8px;
    color: var(--dim); text-decoration: none; padding: 2px 0 2px 8px;
    border-left: 2px solid transparent; word-break: break-all;
  }
  nav .fi:hover { color: var(--ink); border-left-color: var(--accent); background: #e6dfd2; }
  nav .fi b { color: #a99e8e; font-weight: 400; flex: 0 0 auto; }
  main { flex: 1 1 auto; min-width: 0; padding: 34px 44px 120px; max-width: 1080px; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  .lead { color: var(--dim); font-size: 13px; line-height: 1.9; margin-bottom: 26px; }
  section { margin-bottom: 40px; }
  section > h2 {
    font-size: 16px; margin: 40px 0 8px; padding-bottom: 8px;
    border-bottom: 2px solid var(--ink);
  }
  .note {
    font-size: 12.5px; color: var(--dim); line-height: 1.9;
    background: var(--card); border-left: 3px solid var(--accent);
    padding: 10px 14px; margin: 0 0 18px; border-radius: 2px;
  }
  article { margin-bottom: 26px; }
  article h3 {
    display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
    font-size: 13px; margin: 0 0 6px; font-weight: 600;
    background: #e9e3d6; padding: 7px 11px; border-radius: 3px 3px 0 0;
    border: 1px solid var(--line); border-bottom: none;
  }
  article h3 code { font-weight: 600; color: var(--accent); word-break: break-all; }
  article h3 span { color: var(--dim); font-size: 11px; font-weight: 400; flex: 0 0 auto; }
  pre {
    margin: 0; padding: 13px 15px; overflow-x: auto;
    background: var(--code-bg); border: 1px solid var(--line); border-radius: 0 0 3px 3px;
    font-family: "Cascadia Mono", Consolas, "SF Mono", Menlo, monospace;
    font-size: 12px; line-height: 1.62; tab-size: 2;
  }
  pre code { white-space: pre; }
  @media (max-width: 860px) {
    body { display: block; }
    nav { width: auto; height: auto; position: static; max-height: 40vh; }
    main { padding: 20px 16px 80px; }
  }
</style>
</head>
<body>
<nav>
  <div class="head">《摆渡人：荒原之间》</div>
  <div class="meta">全部代码 · ${fileCount} 个文件 · ${lineCount.toLocaleString('en-US')} 行<br>${stamp} 导出</div>
  ${navHtml}
</nav>
<main>
  <h1>全部代码</h1>
  <p class="lead">
    手写的全部源码、配置与设定文档，按目录拼成的一份。<br>
    二进制资源（模型 .bin、贴图 .png）、构建产物（dist/）、依赖（node_modules/）不在这里，靠 <code>npm install</code> 与 <code>npm run build</code> 重新生成。<br>
    运行方式、章节结构、已知问题见第一部分的 <code>README.md</code>。
  </p>
  ${mainHtml}
</main>
</body>
</html>`;

const htmlFile = OUT_FILE.replace(/\.md$/i, '.html');
fs.writeFileSync(htmlFile, html, 'utf8');
console.log(`写入 ${htmlFile}`);
console.log(`  ${(Buffer.byteLength(html, 'utf8') / 1024).toFixed(0)} KB`);
if (missing.length) console.log('  找不到（已跳过）：\n   - ' + missing.join('\n   - '));
