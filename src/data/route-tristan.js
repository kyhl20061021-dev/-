/**
 * 崔斯坦线 · 第一幕（第 1–8 章）+ 第 9 章开头
 *
 * 与迪伦线共用同一片荒原、同一批坐标、同一个安全屋。
 * 区别在于：他知道全部真相，并且必须决定什么时候不说。
 * 他不知道的是她心里的事——所以在他的线里，她始终隔着一扇门。
 */

import { CANON } from '../core/canon.js';
import { HOUSE_POS } from '../world/layout.js';

export const tristanRoute = {
  id: 'tristan',
  role: 'tristan',
  label: '崔斯坦',
  spawn: { x: 14, z: 74, yaw: 2.36 },

  playerModel: {
    coat: 0x424c58,
    pants: 0x3a4048,
    skin: 0xd9c0a4,
    hair: 0x2a2320,
    scale: 1.04,
    eyes: CANON.cobalt
  },

  npc: {
    name: '迪伦',
    x: 2.6,
    z: 88,
    yaw: 3.0,
    behavior: 'wait',
    model: {
      coat: 0xa8bccb,
      pants: 0x545c66,
      skin: 0xe8c8a8,
      hair: 0x3a2e26,
      scale: 0.96,
      skirt: true,
      eyes: CANON.dylanEyes
    }
  },

  objectives: [
    { id: 'find', text: '在荒原上找到她', done: (s) => !!s.flags.met_dylan },
    { id: 'check', text: '确认她的完整', done: (s) => !!s.flags.checked_dylan },
    { id: 'guide', text: '把她带到安全屋', done: (s) => !!s.flags.reached_house },
    { id: 'door', text: '守在门外，等到后半夜', done: (s) => !!s.flags.heard_her },
    { id: 'say', text: '把话说出口', done: (s) => !!s.flags.told_truth },
    { id: 'valley', text: '带她走进山谷', done: (s) => !!s.flags.led_out }
  ],

  interact: {
    radius: 5.2,
    prompt: (state) => (state.flags.heard_her && !state.flags.told_truth ? '推开门' : '与迪伦交谈'),
    dialogue: (state) => {
      if (state.flags.told_truth) return null;
      if (state.flags.heard_her) return 'confess';
      if (state.flags.reached_house) return 'door_talk';
      if (state.flags.checked_dylan) return null;
      return state.flags.met_dylan ? 'check' : 'meet';
    }
  },

  /** 他不进屋。唯一能「看」的地方是门外那扇窗。 */
  hotspots: [
    {
      id: 'window', x: HOUSE_POS.x + 2.25, z: HOUSE_POS.z + 0.6, r: 1.9,
      prompt: '从窗外看进去', dialogue: 'peek', requires: 'reached_house'
    }
  ],

  triggers: [
    { id: 'intro', x: 14, z: 74, r: 7, dialogue: 'intro', spawnLocal: true },
    { id: 'midway', x: -13, z: 40, r: 8, dialogue: 'midway', requires: 'checked_dylan' },
    { id: 'house', x: -9, z: -58, r: 6.5, dialogue: 'house_enter', requires: 'met_dylan' },
    { id: 'door', x: -9, z: -61, r: 4.5, dialogue: 'outside', requires: 'reached_house' },
    { id: 'valley', x: -9, z: -75, r: 7, dialogue: 'valley_gate', requires: 'told_truth' }
  ],

  dialogues: {
    intro: {
      chapter: 1,
      lines: [
        { who: '', italic: true, text: '荒原的夜，从来安静不了太久。' },
        { who: '', italic: true, text: '我在这条路上走了很多年。每一次，都会有一个新的名字。' },
        { who: '', italic: true, text: '这一次的名字叫迪伦。她应该已经站在那里了。' },
        { who: '', text: '隧道口有一点很淡的白。不是灯，是人站在那里。' }
      ]
    },

    meet: {
      chapter: 2,
      lines: [
        { who: '', text: '她站在隧道口，一动不动。像在等一班不会再来的车。' },
        { who: '迪伦', text: '你也是从那趟车上下来的，对不对？' },
        { who: '崔斯坦', text: '算是。' },
        { who: '迪伦', text: '那其他人呢？救援队到了吗？' },
        { who: '', italic: true, text: '她还不知道。她以为自己在等一个结果，其实结果已经发生了。' },
        { who: '崔斯坦', text: '先离开这里。这里晚上不安全。' },
        { who: '迪伦', text: '你还没回答我。' }
      ],
      choices: [
        {
          text: '把真相现在就告诉她。',
          set: ['met_dylan'],
          reply: [
            { who: '', italic: true, text: '我看着她的眼睛。她还站得住，说明裂痕还没有扩散。' },
            { who: '', italic: true, text: '但现在说，等于亲手把她推给外面的东西。' },
            { who: '崔斯坦', text: '跟我走。到了有火的地方，我把所有事都告诉你。' },
            { who: '迪伦', text: '你保证。' },
            { who: '', italic: true, text: '我没有保证。我只是转过身，开始走。' }
          ]
        },
        {
          text: '先带她离开这里。',
          set: ['met_dylan'],
          reply: [
            { who: '崔斯坦', text: '跟我走。别回头。' },
            { who: '迪伦', text: '为什么不能回头？' },
            { who: '', italic: true, text: '因为一回头，她就会看见它们有多近。' },
            { who: '', text: '我把她往坡下带。她的脚步很轻，几乎听不见。' }
          ]
        }
      ]
    },

    check: {
      chapter: 3,
      set: ['checked_dylan'],
      fx: { trust: 3 },
      lines: [
        { who: '', italic: true, text: '她跟着我走了半程。我需要确认她的完整。' },
        { who: '崔斯坦', text: '别动。' },
        { who: '', text: '我抬手，在离她额头一寸的地方停住。' },
        { who: '迪伦', text: '你在干什么？' },
        { who: '', italic: true, text: '完整。只差一道很浅的裂痕——在最后一秒，她听见了什么。', fx: { anomaly: 2 } },
        { who: '崔斯坦', text: '没什么。走吧。' },
        { who: '迪伦', text: '你的手在抖。' },
        { who: '', italic: true, text: '我没有回答。荒原上不能说没有把握的话。' }
      ]
    },

    midway: {
      chapter: 4,
      set: ['mid_talked'],
      lines: [
        { who: '', italic: true, text: '风停了。这是最坏的那种停。' },
        { who: '迪伦', text: '你有没有听见什么声音？' },
        { who: '崔斯坦', text: '听见了。' },
        { who: '迪伦', text: '是什么？' },
        { who: '崔斯坦', text: '你不用知道。你只要记住一件事——不管听见什么，不要停下。' },
        { who: '', text: '她看了我一眼，然后把视线收回路上。' },
        { who: '', italic: true, text: '很好。她比大多数人都懂得，什么时候不该问。' }
      ]
    },

    house_enter: {
      chapter: 5,
      set: ['reached_house'],
      lines: [
        { who: '', text: '远处的雾里有一点暖光。它在那里很多年了，从来没有变过。' },
        { who: '迪伦', text: '那里有人住吗？' },
        { who: '崔斯坦', text: '没有。屋子只是屋子。' },
        { who: '迪伦', text: '那火是谁点的？' },
        { who: '', italic: true, text: '她问得很好。她一直都问得很好。' },
        { who: '崔斯坦', text: '进去。门一关上，今晚就过去了。' },
        { who: '迪伦', text: '你不进来？' },
        { who: '崔斯坦', text: '我在外面。' },
        { who: '', italic: true, text: '这条路上有一条规矩：摆渡人不进屋。', chapter: 6 },
        { who: '', italic: true, text: '不是不能进。是不该进。进去一次，下一次就想再进。' }
      ]
    },

    /** 门外能看见的，只有那块窗 */
    peek: {
      chapter: 6,
      lines: [
        { who: '', text: '我贴到窗边。' },
        { who: '', text: '她坐在火前面，把手伸出去。' },
        { who: '', italic: true, text: '她伸得太近了。近到任何一个活人都该缩手。' },
        { who: '', italic: true, text: '她没有缩。' },
        { who: '', italic: true, text: '然后她把手收回来，低头看了看，像是确认了什么。' }
      ]
    },

    door_talk: {
      chapter: 6,
      lines: [
        { who: '迪伦', text: '你在外面不冷吗？' },
        { who: '崔斯坦', text: '不冷。' },
        { who: '迪伦', text: '你什么都说“不”。不困，不冷，不饿。' },
        { who: '', italic: true, text: '她说这句话的时候在笑。她以为自己在开玩笑。' },
        { who: '崔斯坦', text: '睡吧。天亮还要赶路。' }
      ]
    },

    /* ---------------- 第 7 章：他在门外听见 ---------------- */
    outside: {
      chapter: 7,
      set: ['heard_her'],
      lines: [
        { who: '', italic: true, text: '后半夜，屋里开始有声音。' },
        { who: '', italic: true, text: '不是哭。是走动，停，再走动。' },
        { who: '', text: '我数了一下：她在那间屋子里，来回走了十一趟。' },
        { who: '', italic: true, text: '每一趟都停在同一个位置。炉子前面。' },
        { who: '', italic: true, text: '然后是水声。碗碰到桌面的声音。很轻。' },
        { who: '', italic: true, text: '最后她走到窗边，站住了。' },
        { who: '', italic: true, text: '她站了很久。久到我以为她睡着了。' },
        { who: '', italic: true, text: '我知道她在数。她数得比我见过的任何人都慢，也比任何人都准。' }
      ]
    },

    /* ---------------- 第 8 章：说出口 ---------------- */
    confess: {
      chapter: 8,
      lines: [
        { who: '', text: '门开了。她站在门口，手里拿着那只碗。' },
        { who: '迪伦', text: '崔斯坦。' },
        { who: '崔斯坦', text: '嗯。' },
        { who: '迪伦', text: '这炉火烧了一整夜。我把手伸进去，不烫。' },
        { who: '', italic: true, text: '该来的还是来了。' },
        { who: '迪伦', text: '桌上这碗汤，我没有喝，也不饿。' },
        { who: '迪伦', text: '窗外的雨，我一次都没有听见。' },
        { who: '迪伦', text: '你从下车到现在，没吃过东西，也没有影子。' },
        { who: '崔斯坦', text: '你在数我。' },
        { who: '迪伦', text: '我在数所有说不通的东西。数到第三个，我就不敢再数了。' },
        { who: '', italic: true, text: '我可以说：你太累了。我可以说：这里的雨就是这样。' },
        { who: '', italic: true, text: '这两句话我用了很多年，从来没有人不信。' },
        { who: '', italic: true, text: '可她拿着那只碗站在我面前。碗底是凉的。' },
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
          set: ['truth_spoken'],
          fx: { anomaly: 6 }
        },
        { who: '', italic: true, text: '说完这句，屋子里静得能听见火。' },
        { who: '', italic: true, text: '我这才发现，火是有声音的。是我太久没有听过那么小的声音。' }
      ],
      choices: [
        {
          text: '走进去，站到她旁边。',
          set: ['told_truth', 'stepped_in'],
          fx: { trust: 10, anomaly: 4 },
          reply: [
            { who: '', italic: true, text: '我跨过门槛。这是我第一次进这间屋子。' },
            { who: '', italic: true, text: '地板比我想的要软。像踩在别人的记忆上。' },
            { who: '', italic: true, text: '她抬头看我，眼睛很亮。亮得不像刚知道自己已经不在人世的人。' },
            { who: '迪伦', text: '你手上在流血。' },
            { who: '', italic: true, text: '我低头。手背上有一道口子，不知道什么时候划的。' },
            { who: '', italic: true, text: '它没有合上。' }
          ]
        },
        {
          text: '站在门外，把话说完。',
          set: ['told_truth', 'stayed_out'],
          fx: { trust: 3 },
          reply: [
            { who: '', italic: true, text: '我没有进去。规矩还在，只是从今天起，它开始变得很轻。' },
            { who: '崔斯坦', text: '天亮之前，你有的是时间。' },
            { who: '', italic: true, text: '门在我面前慢慢合上。合到一半，她说话了。' },
            { who: '迪伦', text: '你会一直在外面吗？' },
            { who: '', italic: true, text: '我说：会。' },
            { who: '', italic: true, text: '这是我这辈子说过的、最像谎话的一句真话。' }
          ]
        }
      ]
    },

    /* ---------------- 第 9 章 ---------------- */
    valley_gate: {
      chapter: 9,
      checkpoint: true,
      timeLimit: CANON.failure.choiceTime,
      timeoutChoice: 1,
      lines: [
        { who: '', italic: true, text: '这里的夜没有尽头。钟表停在四点二十，走了很久也没动。' },
        { who: '', text: '我站在门外，回头看了一眼。' },
        { who: '', text: '她还没有出来。' },
        { who: '崔斯坦', text: '山谷在前面。过去之后，剩一半路。' },
        { who: '迪伦', text: '如果我不去呢。' },
        { who: '崔斯坦', text: '屋子只能撑一夜。今晚我在。明晚我不一定在。' },
        { who: '', italic: true, text: '我伸出手。' },
        { who: '', italic: true, text: '背对着她，是规矩。可这次我先转过身去等她。' },
        { who: '崔斯坦', text: '跟着我。别松手。' }
      ],
      choices: [
        {
          text: '等她把手放上来。',
          set: ['led_out'],
          fx: { trust: 8 },
          reply: [
            { who: '', italic: true, text: '她的手比我想的还要凉。' },
            { who: '迪伦', text: '你的手怎么这么冷。' },
            { who: '崔斯坦', text: '一直这样。' },
            { who: '', italic: true, text: '我没有松开。' },
            { who: '', italic: true, text: '走出二十步之后，她回头看了一眼那间屋子。' },
            { who: '', italic: true, text: '窗里的火灭了。她没有问为什么。' }
          ]
        },
        {
          text: '她还没出来就先走。',
          set: ['walked_on'],
          action: 'fail:walk_on',
          reply: [
            { who: '', italic: true, text: '我收回手，转身往前走。走了十步，才听见门响。' },
            { who: '', italic: true, text: '门响之后，没有脚步声。' },
            { who: '', italic: true, text: '我告诉自己：她只是还需要一点时间。' }
          ]
        }
      ]
    }
  },

  failures: {
    walk_on: {
      kicker: '第 九 章 · 未 能 同 行',
      title: '十步之后',
      text: '你在山谷口等到天光。\n她没有跟上来。\n\n回到屋子时，门是开着的，火已经灭了。\n桌上那只碗还在原地，汤面结的皮没有动过。',
      rewind: '回到转身之前'
    }
  },

  interlude: {
    kicker: '第 一 幕 · 完',
    title: '守夜',
    text: '你把这句最难的话说出了口。\n从这一刻起，她不再是路上第 N 个名字。\n\n山那边，有什么东西在等。'
  },

  /* 另一视角：她的内心（第 1–8 章）—— 他不知道的部分 */
  otherPov: {
    name: '迪伦',
    entries: [
      {
        n: 1, title: '隧道口',
        lines: [
          { who: '', italic: true, text: '我一直在等救援队。我等的时候在看手机，屏幕是黑的。' },
          { who: '', italic: true, text: '我以为没电了。后来我才发现，是我不敢按第二下。' }
        ]
      },
      {
        n: 2, title: '他出现得太快',
        lines: [
          { who: '', italic: true, text: '前一秒山坡上还是空的。' },
          { who: '', italic: true, text: '我告诉自己：是我没看清。人在害怕的时候，会看漏东西。' }
        ]
      },
      {
        n: 3, title: '三步',
        lines: [
          { who: '', italic: true, text: '他走在我前面三步。我数过。' },
          { who: '', italic: true, text: '不管我走快还是走慢，都是三步。' }
        ]
      },
      {
        n: 4, title: '风停的时候',
        lines: [
          { who: '', italic: true, text: '风停的那一秒，我听见了很轻的抓挠声。' },
          { who: '', italic: true, text: '像有人在很远的地方，用指甲刮一扇门。' },
          { who: '', italic: true, text: '我没有说。我怕说出来就变成真的。' }
        ]
      },
      {
        n: 5, title: '门口的犹豫',
        lines: [
          { who: '', italic: true, text: '我站在门口不想进去。' },
          { who: '', italic: true, text: '不是因为怕黑。是因为那炉火太像有人刚离开。' }
        ]
      },
      {
        n: 6, title: '火',
        lines: [
          { who: '', italic: true, text: '我把手伸进火里，是想试一件我一直不敢想的事。' },
          { who: '', italic: true, text: '如果连火都不烫我，那我要怎么证明自己还在。' }
        ]
      },
      {
        n: 7, title: '三个理由',
        lines: [
          { who: '', italic: true, text: '我给了自己三个理由，然后一个一个拆掉。' },
          { who: '', italic: true, text: '拆到第三个的时候，手在抖。我把手压在膝盖上。' }
        ]
      },
      {
        n: 8, title: '说出口之后',
        lines: [
          { who: '', italic: true, text: '他说完那句话，我第一个反应不是害怕。' },
          { who: '', italic: true, text: '是松了一口气。' },
          { who: '', italic: true, text: '终于有一件事，和我感觉到的是一样的了。' }
        ]
      }
    ]
  },

  ending: {
    title: '第一幕 · 守夜',
    text: '门关上了。你站在门外，听着她在里面走动，然后安静下来。\n这是你第一次希望，明天的路能长一点。'
  }
};
