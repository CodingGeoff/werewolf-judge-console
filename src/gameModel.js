// ===== 狼人杀 · 法官控制台 数据模型与规则辅助 =====

export const ROLES = {
  werewolf:    { name: '狼人',     short: '狼',   color: '#ef4444', camp: 'wolf', subCamp: 'wolf',     desc: '每晚与狼队友商议袭击1名玩家；白天可随时自爆' },
  wolfKing:    { name: '狼王',     short: '狼王', color: '#dc2626', camp: 'wolf', subCamp: 'wolf',     desc: '出局（非被毒/非自爆）时可开枪带走1人' },
  whiteWolf:   { name: '白狼王',   short: '白狼', color: '#ea580c', camp: 'wolf', subCamp: 'wolf',     desc: '白天自爆时可强行带走1名玩家' },
  wolfBeauty:  { name: '狼美人',   short: '狼美', color: '#c026d3', camp: 'wolf', subCamp: 'wolf',     desc: '每晚魅惑1人，自身出局时被魅惑者殉情；不可自刀/自爆' },
  hiddenWolf:  { name: '隐狼',     short: '隐狼', color: '#b45309', camp: 'wolf', subCamp: 'wolf',     desc: '被预言家查验显示为好人，众狼全部出局后才带刀' },
  demon:       { name: '恶灵骑士', short: '恶灵', color: '#991b1b', camp: 'wolf', subCamp: 'wolf',     desc: '免疫夜间伤害，被预言家验或女巫毒会反伤' },

  seer:        { name: '预言家',   short: '预',   color: '#3b82f6', camp: 'good', subCamp: 'god',      desc: '每晚查验1名玩家属于好人阵营还是狼人阵营' },
  witch:       { name: '女巫',     short: '巫',   color: '#a855f7', camp: 'good', subCamp: 'god',      desc: '拥有解药×1与毒药×1；通常同一晚只能使用一瓶药' },
  hunter:      { name: '猎人',     short: '猎',   color: '#f59e0b', camp: 'good', subCamp: 'god',      desc: '出局时可开枪带走1人；被女巫毒死时不可开枪（闷枪）' },
  guard:       { name: '守卫',     short: '守',   color: '#10b981', camp: 'good', subCamp: 'god',      desc: '每晚守护1人免受狼刀；不可连续两晚守同一人；同守同救奶穿' },
  idiot:       { name: '白痴',     short: '白',   color: '#14b8a6', camp: 'good', subCamp: 'god',      desc: '白天被投票放逐时可翻牌免死，之后失去投票权与被投票权' },
  knight:      { name: '骑士',     short: '骑',   color: '#eab308', camp: 'good', subCamp: 'god',      desc: '白天发言阶段可翻牌决斗1人：是狼则狼死入夜，是好人则骑士以死谢罪' },
  gravekeeper: { name: '守墓人',   short: '墓',   color: '#6366f1', camp: 'good', subCamp: 'god',      desc: '每晚得知上一个白天被放逐玩家是好人还是狼人' },
  bear:        { name: '熊',       short: '熊',   color: '#d97706', camp: 'good', subCamp: 'god',      desc: '天亮时若存活且左右存活邻座中有狼人，法官宣布“昨晚熊咆哮了”' },

  villager:    { name: '平民',     short: '民',   color: '#64748b', camp: 'good', subCamp: 'villager', desc: '无特殊技能，依靠白天发言与投票放逐狼人' },

  cupid:       { name: '丘比特',   short: '丘',   color: '#ec4899', camp: 'third', subCamp: 'god',     desc: '首夜连接2名玩家成为情侣，一方出局另一方殉情；人狼恋为第三方阵营' },
};

export const ROLE_KEYS = Object.keys(ROLES);

// ===== 板子预设（默认置顶 9人标准局） =====
export const BOARDS = {
  b9_std: {
    id: 'b9_std',
    name: '9人标准局（预女猎）',
    players: 9,
    roles: ['werewolf', 'werewolf', 'werewolf', 'seer', 'witch', 'hunter', 'villager', 'villager', 'villager'],
    winRule: '屠边（杀光3神 或 杀光3民）',
    witchSelfSave: 'first', // 'first' | 'never' | 'always'
    hasSheriff: true,
    notes: '最常用9人局：3狼 + 预言家/女巫/猎人 + 3平民。首夜女巫可自救，屠边获胜。',
  },
  b9_noself: {
    id: 'b9_noself',
    name: '9人进阶局（女巫不可自救）',
    players: 9,
    roles: ['werewolf', 'werewolf', 'werewolf', 'seer', 'witch', 'hunter', 'villager', 'villager', 'villager'],
    winRule: '屠边（杀光3神 或 杀光3民）',
    witchSelfSave: 'never',
    hasSheriff: false,
    notes: '9人无警徽或有警徽均可，女巫全程不可自救，节奏更快。',
  },
  b9_guard: {
    id: 'b9_guard',
    name: '9人预女猎守（4神2民/3神3民可调）',
    players: 9,
    roles: ['werewolf', 'werewolf', 'werewolf', 'seer', 'witch', 'guard', 'villager', 'villager', 'villager'],
    winRule: '屠边',
    witchSelfSave: 'never',
    hasSheriff: true,
    notes: '含守卫，需重点记录“昨晚守了谁（防连守）”与“同守同救奶穿”。',
  },
  b10_std: {
    id: 'b10_std',
    name: '10人标准局（3狼3神4民）',
    players: 10,
    roles: ['werewolf', 'werewolf', 'werewolf', 'seer', 'witch', 'hunter', 'villager', 'villager', 'villager', 'villager'],
    winRule: '屠边（杀光3神 或 杀光4民）',
    witchSelfSave: 'first',
    hasSheriff: true,
    notes: '3狼 + 预女猎 + 4民，好人容错率比9人局多一轮推人空间。',
  },
  b10_idiot: {
    id: 'b10_idiot',
    name: '10人预女猎白局',
    players: 10,
    roles: ['werewolf', 'werewolf', 'werewolf', 'seer', 'witch', 'hunter', 'idiot', 'villager', 'villager', 'villager'],
    winRule: '屠边（开局请约定白痴算神或算民）',
    witchSelfSave: 'never',
    hasSheriff: true,
    notes: '3狼 + 预女猎白 + 3民。注意白痴被投翻牌免死但失去投票权。',
  },
  b12_std: {
    id: 'b12_std',
    name: '12人预女猎白标准局',
    players: 12,
    roles: ['werewolf', 'werewolf', 'werewolf', 'werewolf', 'seer', 'witch', 'hunter', 'idiot', 'villager', 'villager', 'villager', 'villager'],
    winRule: '屠边（杀光4神 或 杀光4民）',
    witchSelfSave: 'first',
    hasSheriff: true,
    notes: '经典12人警徽局：4狼4神4民，单爆吞警徽或双爆吞警徽可在设置中调整。',
  },
  b12_wolfking_guard: {
    id: 'b12_wolfking_guard',
    name: '12人狼王守卫局',
    players: 12,
    roles: ['wolfKing', 'werewolf', 'werewolf', 'werewolf', 'seer', 'witch', 'hunter', 'guard', 'villager', 'villager', 'villager', 'villager'],
    winRule: '屠边（杀光4神 或 杀光4民）',
    witchSelfSave: 'never',
    hasSheriff: true,
    notes: '3普狼+1狼王 vs 预女猎守+4民。狼王被毒或自爆不可开枪；同守同救奶穿。',
  },
};

// ===== 事件类型（覆盖夜间行动、白天投票、开枪、自爆、警徽、违规、任意突发情况） =====
export const EVENT_TYPES = {
  night_kill:       { label: '狼人落刀',   icon: '🗡️', camp: 'wolf',    actorLabel: '拿刀/主刀狼人（可选）', targetLabel: '被刀目标（刀口）', desc: '记录哪只狼主刀、刀了谁（自刀则执行者与目标选同一人）' },
  night_guarded:    { label: '守卫守护',   icon: '🛡️', camp: 'good',    actorLabel: '守卫座位',             targetLabel: '守护/堵刀目标',   desc: '记录守卫今晚守了谁（防下回合连守；同守同救为奶穿）' },
  night_saved:      { label: '女巫解药',   icon: '💊', camp: 'good',    actorLabel: '女巫座位',             targetLabel: '救起目标（银水）', desc: '女巫使用解药救活刀口，目标复活并标记银水' },
  night_poisoned:   { label: '女巫毒药',   icon: '☠️', camp: 'good',    actorLabel: '女巫座位',             targetLabel: '毒杀目标',         desc: '女巫使用毒药毒杀目标（若为猎人/狼王则闷枪不能开枪）' },
  night_seer_check: { label: '预言家查验', icon: '🔍', camp: 'good',    actorLabel: '预言家座位',           targetLabel: '查验目标',         desc: '记录预言家查验了谁，自动校验好人(金水)/狼人(查杀)' },
  night_settle:     { label: '天亮死讯',   icon: '🌅', camp: 'neutral', actorLabel: null,                   targetLabel: '死亡玩家（可选）', desc: '天亮公布昨晚死讯（平安夜 / 单死 / 双死 / 奶穿）' },

  day_sheriff:      { label: '警长/警徽',  icon: '🎖️', camp: 'neutral', actorLabel: '原持有者/竞选人',      targetLabel: '获得警徽玩家',     desc: '记录上警、退水、当选警长、移交警徽或撕毁警徽' },
  day_vote_out:     { label: '投票放逐',   icon: '⚖️', camp: 'good',    actorLabel: '归票人（可选）',       targetLabel: '被放逐出局玩家',   desc: '记录白天公投出局者，可在描述中记下具体票型与PK情况' },
  day_hunter_shot:  { label: '开枪带走',   icon: '💥', camp: 'good',    actorLabel: '开枪者（猎人/狼王）',  targetLabel: '被枪带走目标',     desc: '记录猎人或狼王开枪带走了谁（若压枪不开，目标留空备注压枪）' },
  day_selfboom:     { label: '狼人自爆',   icon: '💣', camp: 'wolf',    actorLabel: '自爆狼人',             targetLabel: '带走目标（白狼王可选）', desc: '狼人翻牌自爆直接入夜；若是白狼王可同时选择带走目标' },
  day_idiot_reveal: { label: '白痴翻牌',   icon: '🃏', camp: 'good',    actorLabel: null,                   targetLabel: '白痴玩家',         desc: '白痴被放逐时翻牌免死，保留发言权但失去投票权' },
  day_knight_duel:  { label: '骑士决斗',   icon: '⚔️', camp: 'good',    actorLabel: '骑士座位',             targetLabel: '决斗目标',         desc: '决斗狼人则狼死直接入夜；决斗好人则骑士死亡继续发言' },
  lover_link:       { label: '情侣/殉情',  icon: '💔', camp: 'third',   actorLabel: '连线/先死一方',        targetLabel: '另一方情侣',       desc: '记录丘比特连情侣，或一方出局后另一方殉情' },
  foul_warning:     { label: '场外/违规',  icon: '⚠️', camp: 'neutral', actorLabel: '涉及玩家',             targetLabel: '关联玩家（可选）', desc: '记录贴脸、场外、夜间睁眼偷看、超时等违规判罚' },
  note:             { label: '自由情况/备注', icon: '📝', camp: 'neutral', actorLabel: '关联玩家A（可选）', targetLabel: '关联玩家B（可选）', desc: '记录对跳、悍跳发言、特殊约定或任何乱七八糟的突发情况' },
};

// ===== 预设玩家状态/复盘标签（法官可一键给任意玩家贴/撕） =====
export const PRESET_PLAYER_TAGS = [
  { label: '上警',   color: '#3b82f6' },
  { label: '退水',   color: '#64748b' },
  { label: '悍跳',   color: '#ef4444' },
  { label: '冲锋狼', color: '#f97316' },
  { label: '倒钩狼', color: '#eab308' },
  { label: '深水狼', color: '#a855f7' },
  { label: '自刀',   color: '#ec4899' },
  { label: '金水',   color: '#22c55e' },
  { label: '银水',   color: '#38bdf8' },
  { label: '查杀',   color: '#dc2626' },
  { label: '刀口',   color: '#fb7185' },
  { label: '被守',   color: '#10b981' },
  { label: '闷枪',   color: '#9ca3af' },
  { label: '抗推位', color: '#f59e0b' },
  { label: '铁好人', color: '#14b8a6' },
  { label: 'MVP',    color: '#fbbf24' },
  { label: '背锅',   color: '#94a3b8' },
  { label: '违规警告', color: '#f43f5e' },
];

export const PRESET_EVENT_TAGS = [
  '刀口', '拿刀主刀', '自刀骗药', '空刀', '堵刀成功', '同守同救(奶穿)',
  '首夜救人', '盲毒', '闷枪(毒猎人)', '金水', '查杀', '反向金水',
  '悍跳预言家', '对跳女巫', '对跳猎人', '冲锋', '倒钩', '深水',
  '警徽流', '单爆吞警徽', '平票PK', '分票', '抗推好人', '猎人开枪', '猎人压枪', '场外警告',
];

export const DEATH_REASON_LABELS = {
  kill:      '狼刀出局',
  poison:    '女巫毒杀',
  milk_kill: '同守同救(奶穿)',
  vote:      '投票放逐',
  shot:      '中枪带走',
  selfboom:  '狼人自爆',
  whitewolf: '白狼王带走',
  duel:      '决斗出局',
  lover:     '情侣殉情',
  manual:    '法官标死',
};

// ===== 工具函数 =====
export function makeId(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36).slice(-4)}`;
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function roleName(key) {
  return ROLES[key]?.name ?? key;
}

export function roleShort(key) {
  return ROLES[key]?.short ?? key;
}

export function roleColor(key) {
  return ROLES[key]?.color ?? '#64748b';
}

export function isWolfRole(key) {
  return ROLES[key]?.camp === 'wolf';
}

export function isGodRole(key) {
  return ROLES[key]?.subCamp === 'god' && ROLES[key]?.camp === 'good';
}

export function isVillagerRole(key) {
  return ROLES[key]?.subCamp === 'villager';
}

export function canRoleShoot(key) {
  return key === 'hunter' || key === 'wolfKing';
}

export function createEmptyNightDraft() {
  return {
    wolfKillerId: '',
    wolfTargetId: '',
    guardActorId: '',
    guardTargetId: '',
    witchActorId: '',
    witchSave: false,
    witchPoisonTargetId: '',
    seerActorId: '',
    seerTargetId: '',
    note: '',
  };
}

// ===== 创建新对局 =====
export function createGame({
  boardId = 'b9_std',
  seatCount = null,
  rolesList = null,
  playerNames = [],
  shuffleRoles = true,
} = {}) {
  const board = BOARDS[boardId] ?? BOARDS.b9_std;
  const count = seatCount ?? board.players;
  const baseRoles = rolesList ? [...rolesList] : [...board.roles];
  while (baseRoles.length < count) baseRoles.push('villager');
  const trimmed = baseRoles.slice(0, count);
  const assigned = shuffleRoles ? shuffle(trimmed) : trimmed;

  const players = assigned.map((role, i) => ({
    id: makeId('p'),
    seat: i + 1,
    name: (playerNames[i] || '').trim(),
    role,
    alive: true,
    deathReason: null,
    deadRound: null,
    deadPhase: null, // 'night' | 'day'
    canShootStatus: canRoleShoot(role) ? 'yes' : 'na', // 'yes' | 'blocked' | 'used' | 'na'
    isSheriff: false,
    sheriffState: 'none', // 'none' | 'running' | 'dropped' | 'elected'
    idiotRevealed: false,
    loverId: null,
    tags: [], // [{ id, label, color }]
    notes: '',
  }));

  return {
    id: makeId('game'),
    title: `${board.name}`,
    boardId,
    boardName: board.name,
    winRule: board.winRule,
    players,
    events: [],
    roundNumber: 1,
    phase: 'night', // 'night' | 'day'
    sheriffId: null,
    badgeDestroyed: false,
    guardLastTargetId: null,
    witchState: {
      antidoteUsed: false,
      antidoteRound: null,
      antidoteTargetId: null,
      poisonUsed: false,
      poisonRound: null,
      poisonTargetId: null,
    },
    nightDraft: createEmptyNightDraft(),
    winner: 'ongoing', // 'ongoing' | 'good' | 'wolf' | 'third'
    gameNotes: '',
    settings: {
      witchSelfSave: board.witchSelfSave ?? 'first', // 'first' | 'never' | 'always'
      witchSameNightBothPots: false,
      sameGuardSameSaveDies: true, // 同守同救奶穿
      hunterCanShootWhenPoisoned: false,
      wolfKingCanShootWhenPoisoned: false,
      singleBoomEatsBadge: true,
      idiotCountsAsGod: true,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ===== 存活阵营与屠边预警计算 =====
export function computeRound(game) {
  let wolf = 0;
  let god = 0;
  let villager = 0;
  let third = 0;
  for (const p of game.players) {
    if (!p.alive) continue;
    if (isWolfRole(p.role)) {
      wolf++;
    } else if (p.role === 'idiot') {
      if (game.settings?.idiotCountsAsGod !== false) god++;
      else villager++;
    } else if (isGodRole(p.role)) {
      god++;
    } else if (isVillagerRole(p.role)) {
      villager++;
    } else {
      third++;
    }
  }
  const good = god + villager;

  // 自动胜负提示（仅供法官参考，不强制结束对局，因为可能有混血/情侣等特殊规则）
  let autoHint = null;
  if (wolf === 0 && game.players.some((p) => isWolfRole(p.role))) {
    autoHint = { winner: 'good', reason: '全场狼人已全部出局，好人阵营获胜！' };
  } else if (god === 0 && game.players.some((p) => isGodRole(p.role))) {
    autoHint = { winner: 'wolf', reason: '神职已全部出局（屠神达成），狼人阵营获胜！' };
  } else if (villager === 0 && game.players.some((p) => isVillagerRole(p.role))) {
    autoHint = { winner: 'wolf', reason: '平民已全部出局（屠民达成），狼人阵营获胜！' };
  } else if (wolf > 0 && (god === 1 || villager === 1)) {
    autoHint = {
      winner: 'warning',
      reason: `临界预警：当前存活 狼${wolf} / 神${god} / 民${villager}，注意狼刀在先与屠边条件！`,
    };
  }

  return { good, wolf, god, villager, third, autoHint };
}

export function addPlayerTag(player, label, color = '#3b82f6') {
  if (!label || !label.trim()) return;
  const clean = label.trim();
  if (player.tags.some((t) => t.label === clean)) return;
  player.tags.push({ id: makeId('tag'), label: clean, color });
}

export function removePlayerTag(player, tagId) {
  player.tags = player.tags.filter((t) => t.id !== tagId);
}

// ===== 预览夜晚结算结果（不修改原状态，实时告诉法官天亮谁死、为什么死、猎人能不能开枪） =====
export function previewNightSettlement(game) {
  const d = game.nightDraft || createEmptyNightDraft();
  const s = game.settings || {};
  const byId = (id) => game.players.find((p) => p.id === id) || null;

  const killer = byId(d.wolfKillerId);
  const wolfTarget = byId(d.wolfTargetId);
  const guardTarget = byId(d.guardTargetId);
  const poisonTarget = byId(d.witchPoisonTargetId);
  const seerTarget = byId(d.seerTargetId);

  const warnings = [];

  // 检查守卫连守
  if (guardTarget && game.guardLastTargetId && guardTarget.id === game.guardLastTargetId) {
    warnings.push(`⚠️ 守卫昨晚已守过 ${guardTarget.seat}号，规则通常禁止连续两晚守同一人！`);
  }

  // 检查女巫用药冲突
  if (d.witchSave && game.witchState.antidoteUsed) {
    warnings.push('⚠️ 女巫解药在之前回合已经用过了！');
  }
  if (poisonTarget && game.witchState.poisonUsed) {
    warnings.push('⚠️ 女巫毒药在之前回合已经用过了！');
  }
  if (d.witchSave && poisonTarget && !s.witchSameNightBothPots) {
    warnings.push('⚠️ 当前规则下女巫同一晚不能同时使用解药和毒药！');
  }

  // 检查女巫自救权限
  if (d.witchSave && wolfTarget && wolfTarget.role === 'witch') {
    if (s.witchSelfSave === 'never') {
      warnings.push('⚠️ 当前房规：女巫全程不可自救！');
    } else if (s.witchSelfSave === 'first' && game.roundNumber > 1) {
      warnings.push('⚠️ 当前房规：女巫仅第一夜可自救，本夜不可自救！');
    }
  }

  // 计算死亡名单
  const deaths = []; // [{ player, reason, canShootNote }]
  if (wolfTarget) {
    const guarded = guardTarget && guardTarget.id === wolfTarget.id;
    const saved = !!d.witchSave;
    if (guarded && saved && s.sameGuardSameSaveDies) {
      deaths.push({
        player: wolfTarget,
        reason: 'milk_kill',
        reasonText: '同守同救（奶穿）死亡',
        canShoot: canRoleShoot(wolfTarget.role),
      });
    } else if (!guarded && !saved) {
      deaths.push({
        player: wolfTarget,
        reason: 'kill',
        reasonText: killer ? `被狼刀出局（${killer.seat}号主刀）` : '被狼刀出局',
        canShoot: canRoleShoot(wolfTarget.role),
      });
    }
  }

  if (poisonTarget) {
    const alreadyDead = deaths.find((x) => x.player.id === poisonTarget.id);
    const canShootWhenPoisoned =
      (poisonTarget.role === 'hunter' && s.hunterCanShootWhenPoisoned) ||
      (poisonTarget.role === 'wolfKing' && s.wolfKingCanShootWhenPoisoned);
    if (alreadyDead) {
      alreadyDead.reason = 'poison';
      alreadyDead.reasonText += ' + 被女巫毒杀（重叠）';
      alreadyDead.canShoot = canShootWhenPoisoned;
    } else {
      deaths.push({
        player: poisonTarget,
        reason: 'poison',
        reasonText: '被女巫毒杀',
        canShoot: canShootWhenPoisoned,
      });
    }
  }

  // 预言家查验提示（隐狼特殊处理）
  let seerCheckInfo = null;
  if (seerTarget) {
    const showsWolf = isWolfRole(seerTarget.role) && seerTarget.role !== 'hiddenWolf';
    seerCheckInfo = {
      target: seerTarget,
      result: showsWolf ? 'wolf' : 'good',
      gesture: showsWolf ? '👎 狼人（查杀）' : '👍 好人（金水）',
      note: seerTarget.role === 'hiddenWolf' ? '（注意：隐狼被查验显示为好人！）' : '',
    };
  }

  // 猎人/狼王开枪手势提示
  const gunNotes = deaths
    .filter((x) => canRoleShoot(x.player.role))
    .map((x) => ({
      player: x.player,
      allowed: x.canShoot,
      text: x.canShoot
        ? `🔫 ${x.player.seat}号(${roleName(x.player.role)}) 死亡，【可以开枪】`
        : `🚫 ${x.player.seat}号(${roleName(x.player.role)}) 被毒死，【闷枪！不可开枪】`,
    }));

  // 死讯播报话术（按座位号排序，防暴露先后刀毒顺序）
  const sortedDeadSeats = [...deaths].sort((a, b) => a.player.seat - b.player.seat).map((d2) => `${d2.player.seat}号`);
  const announcement =
    sortedDeadSeats.length === 0
      ? '📢 天亮请睁眼：昨晚是【平安夜】！'
      : `📢 天亮请睁眼：昨晚倒牌的是【${sortedDeadSeats.join('、')}】（排名不分先后）！`;

  return {
    killer,
    wolfTarget,
    guardTarget,
    poisonTarget,
    seerCheckInfo,
    deaths,
    warnings,
    gunNotes,
    announcement,
  };
}

// ===== 生成纯文本复盘战报（方便法官一键复制发群里） =====
export function exportTextReport(game) {
  const lines = [];
  const winMap = {
    ongoing: '进行中',
    good: '好人阵营获胜 🎉',
    wolf: '狼人阵营获胜 🐺',
    third: '第三方阵营获胜 💘',
  };
  lines.push(`【狼人杀复盘战报】${game.title || game.boardName}`);
  lines.push(`结果：${winMap[game.winner] || '进行中'} ｜ 规则：${game.winRule}`);
  lines.push('────────────────────');
  lines.push('【座位与身份总览】');
  for (const p of game.players) {
    const nameStr = p.name ? `(${p.name})` : '';
    const sheriffStr = p.isSheriff ? ' [🎖️警长]' : '';
    const statusStr = p.alive
      ? '存活'
      : `出局(${DEATH_REASON_LABELS[p.deathReason] || '死亡'}·第${p.deadRound || '?'}${p.deadPhase === 'night' ? '夜' : '天'})`;
    const tagStr = p.tags.length ? ` 标签:[${p.tags.map((t) => t.label).join('/')}]` : '';
    const noteStr = p.notes ? ` 备注:${p.notes}` : '';
    lines.push(`${String(p.seat).padStart(2, ' ')}号${nameStr}：${roleName(p.role)} ｜ ${statusStr}${sheriffStr}${tagStr}${noteStr}`);
  }
  lines.push('────────────────────');
  lines.push('【详细事件与标注记录】');
  if (game.events.length === 0) {
    lines.push('（暂无事件记录）');
  } else {
    for (const e of game.events) {
      const meta = EVENT_TYPES[e.type] || { icon: '•', label: e.type };
      const pName = (id) => {
        const pl = game.players.find((x) => x.id === id);
        if (!pl) return '';
        return `${pl.seat}号(${roleShort(pl.role)})`;
      };
      const phaseText = `第${e.roundNumber || 1}${e.phase === 'night' ? '夜' : '天'}`;
      const actor = e.actorId ? pName(e.actorId) : '';
      const target = e.targetId ? pName(e.targetId) : '';
      const link = actor && target ? `${actor} → ${target}` : actor || target || '';
      const tagPart = e.tags?.length ? ` [${e.tags.join('·')}]` : '';
      const descPart = e.text ? ` ${e.text}` : '';
      const annoPart = e.annotation ? ` 【法官标注：${e.annotation}】` : '';
      lines.push(`[${phaseText}] ${meta.icon}${meta.label} ${link}${tagPart}${descPart}${annoPart}`);
    }
  }
  if (game.gameNotes) {
    lines.push('────────────────────');
    lines.push(`【整局复盘批注】\n${game.gameNotes}`);
  }
  return lines.join('\n');
}
