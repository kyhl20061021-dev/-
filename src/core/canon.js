/**
 * 设定常量：docs/ 下三份文档的「可执行版本」。
 *
 * 这里的每个值都必须能在 docs/story-bible.md、docs/mechanics.md、
 * docs/glossary.md 里找到出处。改这里之前先改文档。
 */

export const CANON = {
  /** 钴蓝色：崔斯坦眼睛的专属颜色（glossary.md「钴蓝色」）。
   *  原作取值 #0047AB，夜间需要略提亮才能在低照度下读出来，
   *  因此用 #1E6BD6 —— 色相不变，明度上调。 */
  cobalt: 0x1e6bd6,
  /** 迪伦的眼睛，用于对比：不能让玩家混淆两人的标志色 */
  dylanEyes: 0x2b211c,

  /** 灵魂完整度（mechanics.md §三.1） */
  integrity: {
    start: 100,
    min: 0,
    max: 100,
    /** QTE 失败被恶魔触碰 */
    demonTouch: -10,
    /** 恶劣天气 / 恐惧，每分钟缓降 1 */
    weatherPerMin: -1,
    /** 安全屋内缓慢回复，每分钟 4 */
    safeRoomPerMin: 4
  },

  /** 信任与羁绊（mechanics.md §三.2） */
  trust: {
    start: 0,
    min: 0,
    max: 100,
    /** 高羁绊门槛：解锁崔斯坦的隐藏坦白 */
    high: 60,
    low: 20
  },

  /** 崔斯坦的报废度（mechanics.md §三.3） */
  anomaly: {
    start: 0,
    min: 0,
    max: 100,
    /** 被动累积：每分钟 0.5，剧情事件另计 */
    passivePerMin: 0.5,
    /** 第 20 章分界线处达到顶峰 */
    peak: 100
  },

  /** 视角解锁节点（mechanics.md §一）。第一章到第八章前锁定单视角。 */
  pivot: {
    truthRevealChapter: 8,
    boundaryChapter: 20
  },

  /**
   * 章节表。第一幕 1–8 章，第 8 章末尾揭示真相；第 9 章起进入荒原同行。
   * 一周目只走一条线，章号是全局的，不按路线各自编号。
   */
  chapters: {
    actOne: 8,
    actTwoStart: 9,
    total: 20,
    /** 回看入口只开放前 8 章 */
    reviewCount: 8
  },

  /**
   * 视角解锁规则（作者 2026-10-29 确认的表格）：
   *   第 1–8 章   单线，第 8 章读完后解锁「此章另一视角」回看入口
   *   第 9–19 章  单线，不加双视角入口
   *   第 20 章    从「我会跟在你后面」起强制切换，剧情结束前不解锁
   * 回看永远是「可选」，不强制、不自动跳转。
   */
  pov: {
    unlockAt: 8,
    forcedSwapAt: 20,
    autoOpen: false
  },

  /** 第 8 章真相揭示的数值与节奏 */
  truth: {
    /** 坦白瞬间：精神打击（mechanics.md §三.1「受到巨大精神打击」） */
    cost: -10,
    /** 崩溃分支的额外扣减 */
    breakdownCost: -8,
    /** 崩溃分支的信任回补：她在他面前碎了一次，这本身是靠近 */
    breakdownTrust: 12,
    /** 平静接受 */
    calmTrust: 5,
    /** 选择窗口（秒）：留够读完那段话的时间 */
    choiceTime: 14
  },

  /**
   * 失败机制（同一张表最后一格）：
   * 限时选择 + 坏结局 + 回溯，「不惩罚读者」——
   * 回溯必须回到选择之前，且数值一并回滚，不留下任何惩罚痕迹。
   */
  failure: {
    choiceTime: 10,
    rewind: true
  }
};

/** 视角是否已解锁：第八章之后才开放「回忆查看」 */
export function canPeekOtherPov(chapter) {
  return chapter >= CANON.pivot.truthRevealChapter;
}
