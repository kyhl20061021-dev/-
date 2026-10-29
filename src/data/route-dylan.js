/**
 * 迪伦线 · 第一幕（第 1–8 章）+ 第 9 章开头
 *
 * 信息边界（硬约束）：
 * 第 8 章真相揭示之前，本文件里的任何一句台词都不得出现解释性提示。
 * 迪伦此刻只知道：火车翻在隧道里、她身上没伤、她走不出来。
 * 真相不是被"告知"的，是被她自己在屋里数出来的。
 * scripts/check-isolation.mjs 与 check-canon.mjs 会对此做静态检查。
 */

import { CANON } from '../core/canon.js';
import { HOUSE_POS } from '../world/layout.js';

/** 三处说不通的地方：缺一不可，凑齐才能问出口 */
const CLUES = ['clue_fire', 'clue_bowl', 'clue_window'];
export const clueCount = (s) => CLUES.filter((k) => s.flags[k]).length;

export const dylanRoute = {
  id: 'dylan',
  role: 'dylan',
  label: '迪伦',
  spawn: { x: 2.5, z: 86, yaw: 0 },

  playerModel: {
    coat: 0xa8bccb,
    pants: 0x545c66,
    skin: 0xe8c8a8,
    hair: 0x3a2e26,
    scale: 0.96,
    skirt: true,
    eyes: CANON.dylanEyes
  },

  npc: {
    name: '崔斯坦',
    x: -13,
    z: 54,
    yaw: 0.4,
    behavior: 'wait',
    model: {
      coat: 0x424c58,
      pants: 0x3a4048,
      skin: 0xd9c0a4,
      hair: 0x2a2320,
      scale: 1.04,
      eyes: CANON.cobalt
    }
  },

  objectives: [
    { id: 'place', text: '弄清楚自己在什么地方', done: (s) => !!s.flags.left_tunnel },
    { id: 'someone', text: '找到一个活着的人', done: (s) => !!s.flags.met_tristan },
    { id: 'house', text: '跟崔斯坦去那间亮着灯的屋子', done: (s) => !!s.flags.reached_house },
    { id: 'clues', text: '找出屋里说不通的地方', done: (s) => clueCount(s) >= 3 },
    { id: 'ask', text: '问他', done: (s) => !!s.flags.knows_truth },
    { id: 'valley', text: '跟他走出这座屋子', done: (s) => !!s.flags.followed }
  ],

  interact: {
    radius: 5.2,
    prompt: (state) => (clueCount(state) >= 3 && !state.flags.knows_truth ? '问他' : '与崔斯坦交谈'),
    dialogue: (state) => {
      if (state.flags.knows_truth) return null;
      if (clueCount(state) >= 3) return 'confront';
      if (state.flags.in_house) return 'wait_talk';
      return state.flags.met_tristan ? null : 'meet';
    }
  },

  /** 屋内三处疑点：只在她进了屋子之后才可交互 */
  hotspots: [
    {
      id: 'fire', x: HOUSE_POS.x - 1.05, z: HOUSE_POS.z - 1.65, r: 1.9,
      prompt: '把手伸到火前', dialogue: 'clue_fire', requires: 'in_house'
    },
    {
      id: 'bowl', x: HOUSE_POS.x + 1.05, z: HOUSE_POS.z - 0.5, r: 1.7,
      prompt: '看那只碗', dialogue: 'clue_bowl', requires: 'in_house'
    },
    {
      id: 'window', x: HOUSE_POS.x + 2.25, z: HOUSE_POS.z + 0.55, r: 1.7,
      prompt: '听窗外的雨', dialogue: 'clue_window', requires: 'in_house'
    }
  ],

  triggers: [
    { id: 'leave-tunnel', x: 0, z: 72, r: 8, dialogue: 'realize' },
    { id: 'midway', x: -13, z: 40, r: 8, dialogue: 'midway', requires: 'met_tristan' },
    { id: 'house', x: -9, z: -58, r: 6.5, dialogue: 'house_enter', requires: 'met_tristan' },
    { id: 'valley', x: -9, z: -75, r: 7, dialogue: 'valley_gate', requires: 'knows_truth' }
  ],

  dialogues: {
    /* ---------------- 第 1 章 ---------------- */
    realize: {
      chapter: 1,
      set: ['left_tunnel'],
      lines: [
        { who: '', italic: true, text: '……这不是车厢。' },
        { who: '', italic: true, text: '我身上没有伤。可我记得那一瞬间的倾斜，记得有人在尖叫。' },
        { who: '', italic: true, text: '雨落在脸上。一点声音也没有。' },
        { who: '', text: '隧道口的石头还在后面。往前是一片望不到边的坡地，草是灰绿色的。' },
        { who: '', italic: true, text: '我不知道该往哪走。但站在原地更难受。' }
      ]
    },

    /* ---------------- 第 2 章 ---------------- */
    meet: {
      chapter: 2,
      lines: [
        { who: '崔斯坦', text: '你走出来了。' },
        { who: '', text: '坡上站着一个人。他离我不远，可刚才我望了很久，那里明明什么都没有。' },
        { who: '迪伦', text: '你是谁？' },
        { who: '崔斯坦', text: '崔斯坦。' },
        { who: '迪伦', text: '这里是什么地方？火车呢？其他人呢？' },
        { who: '崔斯坦', text: '……先跟我走。天要黑了。' },
        { who: '', text: '他没有回答火车。他把“天要黑了”这四个字，说得比火车更重。' }
      ],
      choices: [
        {
          text: '“你不回答我，我就不走。”',
          set: ['met_tristan'],
          fx: { trust: -3 },
          reply: [
            { who: '崔斯坦', text: '那你留在这里。这里比你想的更不友好。' },
            { who: '', text: '他说完就往前走。走了三步，停下来。' },
            { who: '', text: '他没有回头。可他在等。' }
          ]
        },
        {
          text: '“……好。我跟你走。”',
          set: ['met_tristan'],
          fx: { trust: 6 },
          reply: [
            { who: '', text: '他点了一下头，转身往坡下走。' },
            { who: '迪伦', text: '你走慢一点。' },
            { who: '崔斯坦', text: '我一直在你前面三步。' }
          ]
        }
      ]
    },

    /* ---------------- 第 3 章 ---------------- */
    midway: {
      chapter: 3,
      set: ['mid_talked'],
      lines: [
        { who: '迪伦', text: '你一直走在我前面。为什么？' },
        { who: '崔斯坦', text: '路我熟。' },
        { who: '迪伦', text: '你连头都不回。' },
        { who: '崔斯坦', text: '回头，你会以为我在等你。' },
        { who: '', text: '这句话很怪。可我一时说不上来，怪在哪里。' },
        { who: '', italic: true, text: '我跟上去。草叶扫过小腿，凉的，但不像水。' }
      ]
    },

    /* ---------------- 第 4–6 章：走进那间屋子 ---------------- */
    house_enter: {
      chapter: 4,
      set: ['reached_house', 'in_house'],
      lines: [
        { who: '', text: '雾里有一点光。很小，像有人在很远的地方点了一支蜡烛。' },
        { who: '迪伦', text: '那是什么？' },
        { who: '崔斯坦', text: '安全屋。门一关上，今晚就过去了。' },
        { who: '', text: '走近了才看清：门是开着的。' },
        { who: '', text: '里面有一炉火，烧得不高，也不低。' },
        { who: '', italic: true, text: '我进去的时候，先闻到的不是烟，是灰。' },
        { who: '迪伦', text: '这里的火，是谁点的？' },
        { who: '崔斯坦', text: '一直有人在点。你只要知道，天亮之前它不会灭。' },
        { who: '', text: '他站在窗边，没有脱外套，也没有坐下。', chapter: 5 },
        { who: '迪伦', text: '你不睡？' },
        { who: '崔斯坦', text: '我不困。' },
        { who: '', italic: true, text: '我算了一下：从隧道走到这里，四个小时。他一步没停，一口水没喝。' },
        { who: '', text: '我在火边坐下来，把手伸出去。', chapter: 6 },
        { who: '', italic: true, text: '该烫的。可过了很久，我什么也没感觉到。' },
        { who: '', italic: true, text: '我告诉自己：是太累了。' }
      ]
    },

    /** 进屋后、凑齐疑点前，和他说话只会得到这样的回答 */
    wait_talk: {
      chapter: 6,
      lines: [
        { who: '迪伦', text: '你在看什么？' },
        { who: '崔斯坦', text: '外面。' },
        { who: '迪伦', text: '外面有什么？' },
        { who: '崔斯坦', text: '现在，什么都没有。' },
        { who: '', italic: true, text: '他说的是“现在”。' }
      ]
    },

    /* ---------------- 第 7 章：三处疑点 ---------------- */
    clue_fire: {
      chapter: 7,
      set: ['clue_fire'],
      lines: [
        { who: '', text: '我又把手往前伸了一点，几乎碰到火苗。' },
        { who: '', text: '不烫。也不是冷。' },
        { who: '', italic: true, text: '是“没有”。像把手伸进一个没装东西的口袋。' },
        { who: '', italic: true, text: '我把手收回来，装作只是在取暖。' }
      ]
    },

    clue_bowl: {
      chapter: 7,
      set: ['clue_bowl'],
      lines: [
        { who: '', text: '桌上有一只碗。汤面结了一层薄皮，像放了一整天。' },
        { who: '', text: '我端起来。碗底是凉的。' },
        { who: '', italic: true, text: '我确实不饿。从醒来到现在，我一口水都没有喝过。' },
        { who: '', italic: true, text: '我一直以为，那是因为害怕。' }
      ]
    },

    clue_window: {
      chapter: 7,
      set: ['clue_window'],
      lines: [
        { who: '', text: '窗外在下雨。雨点打在玻璃上，顺着往下滑。' },
        { who: '', text: '我把耳朵贴上去。' },
        { who: '', text: '一点声音也没有。' },
        { who: '', italic: true, text: '太累了。风太大。耳朵在嗡嗡响。' },
        { who: '', italic: true, text: '我给自己找了三个理由。三个都站不住。' }
      ]
    },

    /* ---------------- 第 8 章：真相 ---------------- */
    confront: {
      chapter: 8,
      lines: [
        { who: '迪伦', text: '崔斯坦。' },
        { who: '崔斯坦', text: '嗯。' },
        { who: '迪伦', text: '这炉火烧了一整夜。我把手伸进去，不烫。' },
        { who: '', italic: true, text: '他没有回头。肩膀僵了一下。' },
        { who: '迪伦', text: '桌上那碗汤，我没有喝。我也不饿。' },
        { who: '崔斯坦', text: '迪伦。' },
        { who: '迪伦', text: '窗外一直在下雨。我一次都没有听见。' },
        { who: '迪伦', text: '你从下车到现在，没有吃过东西，也没有影子。' },
        { who: '崔斯坦', text: '你在数我。' },
        { who: '迪伦', text: '我在数所有说不通的东西。数到第三个，我就不敢再数了。' },
        { who: '', italic: true, text: '火忽然响了一声。很小的一声，像有人叹了口气。' },
        { who: '崔斯坦', text: '火车上，有多少人？' },
        { who: '迪伦', text: '……你说什么？' },
        { who: '崔斯坦', text: '我问你，火车上，有多少人。' },
        { who: '迪伦', text: '我不知道。很多人。' },
        { who: '崔斯坦', text: '他们都出来了。' },
        { who: '崔斯坦', text: '除了一个。' },
        {
          who: '崔斯坦',
          text: '你不是唯一活下来的人。你是唯一没有出来的那个。',
          effect: 'heartstop',
          set: ['knows_truth'],
          fx: { integrity: CANON.truth.cost }
        },
        { who: '', italic: true, text: '屋子里的声音一下子全没了。火在烧，可我听不见它。' },
        { who: '', italic: true, text: '我低头看自己的手。它们还在。只是看起来，比刚才淡了一点。' }
      ],
      timeLimit: CANON.truth.choiceTime,
      timeoutChoice: 2,
      choices: [
        {
          text: '哭出来。',
          set: ['broke_down'],
          fx: { integrity: CANON.truth.breakdownCost, trust: CANON.truth.breakdownTrust },
          reply: [
            { who: '', italic: true, text: '我听见自己在哭。声音很远，像从别人身体里传出来的。' },
            { who: '', italic: true, text: '他没有过来。他把脸转开了。' },
            { who: '崔斯坦', text: '哭吧。这里没有人会听见。' },
            { who: '', italic: true, text: '他往门边走了一步，又停住。' },
            { who: '', italic: true, text: '后来我才明白：他不是不想过来。他是不敢。' },
            { who: '', italic: true, text: '窗外起了风。这座荒原跟着我一起塌下去了一点。' }
          ]
        },
        {
          text: '坐下来，把话问完。',
          set: ['accepted'],
          fx: { trust: CANON.truth.calmTrust },
          reply: [
            { who: '', italic: true, text: '我没有哭。我坐回火边，把手放在膝盖上。' },
            { who: '迪伦', text: '那我是什么。' },
            { who: '崔斯坦', text: '你是我要送过去的人。' },
            { who: '迪伦', text: '送去哪里。' },
            { who: '崔斯坦', text: '前面。走到你能自己走为止。' },
            { who: '', italic: true, text: '他说得很慢，像在背一段别人的话。' },
            { who: '', italic: true, text: '窗外的雨忽然轻了。' }
          ]
        },
        {
          text: '（说不出话）',
          set: ['went_silent'],
          fx: { integrity: -6 },
          reply: [
            { who: '', italic: true, text: '我想说话。喉咙里像塞了一团湿棉花。' },
            { who: '', italic: true, text: '火还在烧。烧了一整夜，也没把这块地方烧暖。' },
            { who: '崔斯坦', text: '你不用现在回答我。' },
            { who: '崔斯坦', text: '天亮之前，你有的是时间。' },
            { who: '', italic: true, text: '他以为时间还有很多。' }
          ]
        }
      ]
    },

    /* ---------------- 第 9 章：山谷之前（限时选择 + 回溯） ---------------- */
    valley_gate: {
      chapter: 9,
      checkpoint: true,
      timeLimit: CANON.failure.choiceTime,
      timeoutChoice: 1,
      lines: [
        { who: '', text: '这里的夜好像没有尽头。' },
        { who: '', italic: true, text: '我在心里数过很多遍：从进这间屋子到现在，火没有矮下去一寸。' },
        { who: '', text: '崔斯坦站在门外，背对着我。' },
        { who: '崔斯坦', text: '前面是山谷。过去之后，剩一半路。' },
        { who: '迪伦', text: '如果我不去呢。' },
        { who: '崔斯坦', text: '屋子只能撑一夜。今晚我在。明晚我不一定在。' },
        { who: '', italic: true, text: '他伸出手。没有回头。' },
        { who: '崔斯坦', text: '跟着我。别松手。' }
      ],
      choices: [
        {
          text: '握住他的手。',
          set: ['followed'],
          fx: { trust: 8 },
          reply: [
            { who: '', text: '他的手比屋里还凉。' },
            { who: '迪伦', text: '你的手怎么这么冷。' },
            { who: '崔斯坦', text: '一直这样。' },
            { who: '', italic: true, text: '他没有松开。' },
            { who: '', italic: true, text: '走出二十步之后，我回头看了一眼那间屋子。' },
            { who: '', italic: true, text: '窗里的火已经灭了。我明明只走开了二十步。' }
          ]
        },
        {
          text: '留在屋里。',
          set: ['stayed'],
          action: 'fail:stay',
          reply: [
            { who: '', italic: true, text: '我往后退了一步。' },
            { who: '', italic: true, text: '他没有回头，也没有再说什么。他只是把手收了回去。' },
            { who: '崔斯坦', text: '……好。' },
            { who: '', italic: true, text: '门在我面前合上。' }
          ]
        }
      ]
    }
  },

  /* ---------------- 失败：坏结局 + 回溯（不惩罚读者） ---------------- */
  failures: {
    stay: {
      kicker: '第 九 章 · 未 能 同 行',
      title: '屋子只能撑一夜',
      text: '后半夜，火矮下去一寸，又一寸。\n你把所有能烧的东西都塞了进去，包括那张桌子。\n\n天亮的时候，屋里是冷的。\n门外没有脚印，也没有人回来。',
      rewind: '回到伸手的那一刻'
    }
  },

  /* ---------------- 幕间 ---------------- */
  interlude: {
    kicker: '第 一 幕 · 完',
    title: '荒原',
    text: '你知道了自己的处境。\n而他没有说的是：从这里到分界线，还有很远，很远。\n\n山那边，有什么东西在等。'
  },

  /* ---------------- 第 8 章解锁：此章另一视角（崔斯坦的内心片段） ----------------
   * 只补内心，不改事实；每段不超过四行，总补写量控制在 10% 以内。
   * 全部为「可选回看」，不强制、不自动跳转（作者 2026-10-29 表格）。
   */
  otherPov: {
    name: '崔斯坦',
    entries: [
      {
        n: 1, title: '坡上',
        lines: [
          { who: '', italic: true, text: '我在坡上等了很久。久到草把鞋面打湿了两次。' },
          { who: '', italic: true, text: '隧道口一直很安静。每一次都是这样：先安静，然后有人走出来。' },
          { who: '', italic: true, text: '这一次走出来的，比我想的要瘦。' }
        ]
      },
      {
        n: 2, title: '三步',
        lines: [
          { who: '', italic: true, text: '她问我火车。我只能说天要黑了。' },
          { who: '', italic: true, text: '这不是撒谎。天确实要黑了。' },
          { who: '', italic: true, text: '我走在她前面三步。三步是规矩：太近她会跟着我，太远她会回头。' }
        ]
      },
      {
        n: 3, title: '不回头',
        lines: [
          { who: '', italic: true, text: '她说我连头都不回。' },
          { who: '', italic: true, text: '回头，她就会以为我在等她。而等，是我最不该让她学会的事。' },
          { who: '', italic: true, text: '我数着后面的脚步声。一步没少。' }
        ]
      },
      {
        n: 4, title: '四个小时',
        lines: [
          { who: '', italic: true, text: '她走了四个小时，一次都没有喊累。' },
          { who: '', italic: true, text: '大多数人走一个小时就会问：还有多远。' },
          { who: '', italic: true, text: '她没有问。她只是跟着。这让我更难开口。' }
        ]
      },
      {
        n: 5, title: '窗边',
        lines: [
          { who: '', italic: true, text: '我站在窗边，是因为窗边能看见外面。' },
          { who: '', italic: true, text: '这间屋子的火，永远烧得刚好，也永远不暖。' },
          { who: '', italic: true, text: '我早就知道。我只是没想到，她会先发现。' }
        ]
      },
      {
        n: 6, title: '她伸手',
        lines: [
          { who: '', italic: true, text: '她把整只手伸进了火里。' },
          { who: '', italic: true, text: '我几乎要喊出来。可我没有。喊出来，就等于承认。' },
          { who: '', italic: true, text: '她把手收回去，说了一句我听不见的话，然后笑了笑。' }
        ]
      },
      {
        n: 7, title: '数到第三个',
        lines: [
          { who: '', italic: true, text: '她站起来，又坐下，又站起来。三次。' },
          { who: '', italic: true, text: '我知道她数完了。' },
          { who: '', italic: true, text: '我想过很多种说法。每一种，都比沉默更像撒谎。' }
        ]
      },
      {
        n: 8, title: '不像自己的声音',
        lines: [
          { who: '', italic: true, text: '说出口的时候，我的声音不像自己的。' },
          { who: '', italic: true, text: '这句话我说过很多次。每一次都比上一次轻。' },
          { who: '', italic: true, text: '这次说完，我听见屋子外面的风停了。' },
          { who: '', italic: true, text: '风停的时候，通常意味着有什么东西来了。' }
        ]
      }
    ]
  },

  ending: {
    title: '第一幕 · 荒原',
    text: '你走进了一间没有主人的屋子。火还在烧。\n你没有问出口的那句话，被留在了门外。'
  }
};
