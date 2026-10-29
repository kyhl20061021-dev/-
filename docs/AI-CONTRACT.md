# 给 AI 的接续开发约定

这份文件回答一个问题：**下一个 AI（或下一阶段的你）拿到这个项目，应该先读什么、不能动什么。**

## 一、读取顺序（每次开新对话，第一句都这么说）

```
先读 docs/story-bible.md、docs/mechanics.md、docs/glossary.md，再读这份 AI-CONTRACT.md，
然后才开始回答。任何与之冲突的写法，一律以这三份文档为准。
```

三份文档的分工，不要混用：

| 文件 | 管什么 | 典型误用 |
|---|---|---|
| `story-bible.md` | 世界观、人物、四幕情绪曲线 | 拿它当台词库用 |
| `mechanics.md` | 视角解锁、QTE 形态、三条数值 | 自己发明第四种数值 |
| `glossary.md` | 称谓、禁用词、专有名词 | 把「摆渡人」写成「引路人」「死神」 |

## 二、六条不能碰的红线

1. **迪伦在第一幕不知道自己是灵魂。** 她的台词、她的 HUD、她的任务文案里不能出现「死 / 灵魂 / 摆渡人 / 恶魔 / 分界线 / 完整度」。HUD 上那条状态条对她显示为「气息」，只有 `knows_truth` 之后才改名。
2. **崔斯坦从不撒谎，只省略。** 他可以说「先跟我走」，不能说「你没事」。
3. **只有三条数值轴**：灵魂完整度（迪伦）、信任与羁绊（共用）、报废度（崔斯坦）。加第四条之前先改文档。
4. **钴蓝色是崔斯坦的唯一标识**，两条线必须用同一个色值（`CANON.cobalt`）。这是第四幕「他有没有被重置」的判据，不能因为美术喜好改掉。
5. **视角是叙事结构，不是相机。** `V` 键只切第一/第三人称相机。另一条叙事视角只能通过 `Tab` 面板**回看**，且必须满足：第 8 章读完才解锁、只读不写、不自动跳转（`CANON.pov`）。第 9–19 章不开新入口，第 20 章强制切换。
6. **改剧情节点的同时必须跑检查**，见下一节。

## 三、改完必须跑的三个命令

```bash
npm run check                   # 信息隔离 14 项 + 设定一致性 75 项
node tools/flow-ch8.mjs         # 第 8 章流程实测 39 项（真实窗口，约 2 分钟）
node scripts/smoke-test.mjs     # 两条线冒烟测试 39 项（约 3-6 分钟）
npm run build                   # 生产构建
```

跑浏览器测试前先 `npm run build` 并起一个 `npm run preview`（脚本会自动探测 5180 / 5179 / 5178 端口，探测不到会直接报错退出，不会伪装成 PASS）。

`check:canon` 会拦住这几种错误：术语用错、迪伦线剧透、崔斯坦读到迪伦的私事、数值超出 canon 上限、钴蓝色被改、章节数被改小、另一视角超过 8 章或每章超过 4 行、限时选择没有 checkpoint、第 8 章超时被写成结局、屋内疑点跑到屋外。

## 四、代码地图（改哪里找哪里）

| 想改的东西 | 文件 |
|---|---|
| 世界观 / 四幕 | `docs/story-bible.md` |
| 数值上下限、QTE 规则 | `docs/mechanics.md` → `src/core/canon.js` |
| 章节数、视角解锁点、真相代价、失败时限 | `src/core/canon.js` |
| 称谓与禁用词 | `docs/glossary.md` → `scripts/check-canon.mjs` |
| 台词、分支、限时选择、疑点、坏结局 | `src/data/route-dylan.js` / `route-tristan.js` |
| 限时条与超时代选 | `src/systems/dialogue.js` |
| 另一视角回看面板 | `src/ui/pov.js` + `#povPanel` |
| 数值计算 | `src/systems/stats.js` |
| 荒原随情绪变化 / 分支天气 | `src/systems/mood.js` |
| 心跳与心停 | `src/systems/audio.js` |
| 地形 / 植被 / 安全屋 | `src/world/`（安全屋在 `props.js` 的 `buildSafeHouse`） |
| 室内镜头收缩 | `src/systems/cameraRig.js` 的 `_pullIn` |
| 镜头避障（不穿房子/大石） | `src/systems/cameraRig.js` 的 `_avoidObstacles` |
| 视角吸附格与灵敏度 | `src/systems/cameraRig.js` 顶部 `SENS_*` / `STEP_*` |
| 位移分步推进（防穿墙） | `src/systems/collision.js` 的 `moveWithCollisions` |
| NPC 带路 / 跟随 | `src/systems/npc.js` + `main.js` 的 `wantedBehavior()` |
| 天光 / 雾 / 曝光 | `props.js` 的 `buildSky` `buildLights`，`main.js` 的 `toneMappingExposure` |
| 章节推进、触发器、热点、回溯 | `src/main.js` |
| 角色模型与瞳孔 | `src/entities/character.js` |

## 五、数据格式（写剧情时照抄）

```js
{
  who: '崔斯坦',            // '' 表示旁白，配 italic: true 更合适
  text: '……先跟我走。',
  italic: false,
  set: ['met_tristan'],     // 置位剧情标记
  fx: { trust: 6 },         // 数值：integrity / trust / anomaly 三者之一
  effect: 'heartstop',      // 特效：心跳停止 + 画面褪色
  chapter: 8                // 这一句出现时把章号推到 8（只增不减）
}
```

`fx` 的位置决定触发时机：写在 `dialogue.fx` = 对话开始；写在 `line.fx` = 那一句出现时；写在 `choice.fx` = 玩家选中时。

`dialogue` 上的三种结构字段：

```js
timeLimit: 14,        // 选项摆出来才开始计时（秒）
timeoutChoice: 2,     // 超时由系统代选第几项
checkpoint: true,     // 这个选择点可回溯（失败后回到这里）
```

**超时 ≠ 失败。** 只有配了 `checkpoint` 的选择点才允许出现坏结局；第 8 章的 `timeLimit` 配的是「沉默」分支，超时只是走另一条路。

热点（屋内疑点）：

```js
hotspots: [{ id: 'fire', x, z, r, requires: 'in_house', prompt: '把手伸到火前', dialogue: 'clue_fire' }]
```

`requires: 'in_house'` 依赖 `house_enter` 置的标记，别自己另起一套。

其他三块结构：`failures`（坏结局，含 `rewind` 文案）、`interlude`（幕间卡）、`otherPov.entries`（另一视角 8 章，每章 ≤4 行，只写内心不写事实）。

数值写多少，先看 `docs/mechanics.md`：单次完整度损失最多 10（被恶魔触碰），信任单次最多 ±20，报废度单次最多 +10。超了 `check:canon` 会报错。

## 六、下一阶段的正确起点

第 1–9 章已经闭环（疑点 → 逼问 → 真相 → 限时分支 → 幕间 → 另一视角 → 山谷口 → 失败 → 回溯）。接着做**第二幕·山谷（原著第 10–14 章）**，仍然先让空间与判定成立，再写台词：

1. 峡谷地形 + 一条必须通过的窄道（空间上先成立）
2. 恶魔（boids 群聚）+ 追逐 QTE（迪伦视角：跑酷躲避；崔斯坦视角：格挡）
3. 失败惩罚接到 `stats.integrity -= 10`，并在 HUD 上可见
4. 第 9–19 章不开新的双视角入口（`CANON.pov`），面板只回看前 8 章

**开工前需要世界观层面拍板一件事**：恶魔是「可打退」还是「不可战胜」。这直接决定 QTE 是躲闪还是格挡，也是第二幕与第四幕基调的分界。

在这四步完成之前，不要开始写第 10 章之后的大段台词——否则数值和空间都没定，台词会白写。
