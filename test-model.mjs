import {
  BOARDS, ROLES, createGame, shuffle, computeRound,
  previewNightSettlement, exportTextReport, isWolfRole, isGodRole, isVillagerRole,
} from './src/gameModel.js';

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
}

console.log('\n=== 1. 板子配置与9人局校验 ===');
for (const b of Object.values(BOARDS)) {
  check(`${b.name}: 角色数(${b.roles.length}) === 座位数(${b.players})`, b.roles.length === b.players);
}

const g9 = createGame({ boardId: 'b9_std' });
check('9人标准局座位数 = 9', g9.players.length === 9);
check('3狼 + 预女猎 + 3民',
  g9.players.filter((p) => p.role === 'werewolf').length === 3 &&
  g9.players.filter((p) => p.role === 'seer').length === 1 &&
  g9.players.filter((p) => p.role === 'witch').length === 1 &&
  g9.players.filter((p) => p.role === 'hunter').length === 1 &&
  g9.players.filter((p) => p.role === 'villager').length === 3
);

console.log('\n=== 2. 夜晚结算引擎（同守同救奶穿 / 女巫救人 / 猎人被毒闷枪 / 预言家查验） ===');
const gGuard = createGame({ boardId: 'b12_wolfking_guard', shuffleRoles: false });
const wolf = gGuard.players.find((p) => p.role === 'werewolf');
const hunter = gGuard.players.find((p) => p.role === 'hunter');
const villager = gGuard.players.find((p) => p.role === 'villager');

// 场景A：狼刀平民，女巫救 → 平安夜
gGuard.nightDraft = {
  wolfKillerId: wolf.id,
  wolfTargetId: villager.id,
  guardTargetId: '',
  witchSave: true,
  witchPoisonTargetId: '',
  seerTargetId: wolf.id,
};
let prev = previewNightSettlement(gGuard);
check('女巫救起刀口 → 平安夜 0 死', prev.deaths.length === 0);
check('预言家验狼 → 手势提示查杀', prev.seerCheckInfo?.result === 'wolf');

// 场景B：同守同救 → 奶穿死亡
gGuard.nightDraft = {
  wolfKillerId: wolf.id,
  wolfTargetId: villager.id,
  guardTargetId: villager.id,
  witchSave: true,
  witchPoisonTargetId: '',
  seerTargetId: villager.id,
};
prev = previewNightSettlement(gGuard);
check('同守同救 → 触发奶穿 1 死', prev.deaths.length === 1 && prev.deaths[0].reason === 'milk_kill');
check('预言家验民 → 手势提示金水', prev.seerCheckInfo?.result === 'good');

// 场景C：女巫毒猎人 → 猎人闷枪不可开枪；狼刀空刀
gGuard.nightDraft = {
  wolfKillerId: '',
  wolfTargetId: '',
  guardTargetId: '',
  witchSave: false,
  witchPoisonTargetId: hunter.id,
  seerTargetId: '',
};
prev = previewNightSettlement(gGuard);
check('女巫毒猎人 → 猎人死亡且不可开枪（闷枪）',
  prev.deaths.length === 1 && prev.deaths[0].canShoot === false && prev.gunNotes[0].allowed === false);

// 场景D：狼刀猎人 → 猎人可开枪
gGuard.nightDraft = {
  wolfKillerId: wolf.id,
  wolfTargetId: hunter.id,
  guardTargetId: '',
  witchSave: false,
  witchPoisonTargetId: '',
  seerTargetId: '',
};
prev = previewNightSettlement(gGuard);
check('狼刀猎人 → 猎人死亡且可开枪',
  prev.deaths.length === 1 && prev.deaths[0].canShoot === true && prev.gunNotes[0].allowed === true);

console.log('\n=== 3. 屠边与胜负预警 ===');
const gRound = createGame({ boardId: 'b9_std' });
let r = computeRound(gRound);
check('9人局初始：狼3 神3 民3', r.wolf === 3 && r.god === 3 && r.villager === 3);
gRound.players.filter((p) => isGodRole(p.role)).forEach((p) => { p.alive = false; });
r = computeRound(gRound);
check('3神死光 → 自动提示屠神狼胜', r.autoHint?.winner === 'wolf');

console.log('\n=== 4. 战报导出包含事后标注 ===');
gRound.events.push({
  id: 'ev_1',
  roundNumber: 1,
  phase: 'night',
  type: 'night_kill',
  actorId: gRound.players[0].id,
  targetId: gRound.players[1].id,
  text: '1号拿刀刀2号',
  annotation: '复盘标注：此处骗药成功',
  tags: ['自刀骗药'],
});
const rep = exportTextReport(gRound);
check('文字战报包含事件与法官标注', rep.includes('复盘标注：此处骗药成功') && rep.includes('自刀骗药'));

console.log(`\n通过 ${pass} / ${pass + fail}`);
if (fail > 0) process.exit(1);
