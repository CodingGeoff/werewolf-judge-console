import { useState, useEffect, useMemo, useRef } from 'react';
import {
  BOARDS, ROLES, ROLE_KEYS, EVENT_TYPES, PRESET_PLAYER_TAGS, DEATH_REASON_LABELS,
  createGame, createEmptyNightDraft, makeId, roleName, roleShort, roleColor,
  isWolfRole, isGodRole, isVillagerRole, canRoleShoot,
  computeRound, addPlayerTag, removePlayerTag, previewNightSettlement,
} from './gameModel';
import {
  Modal, DealPassModal, EventModal, PlayerDetailModal, ReportModal, DeployGuideModal,
} from './components';
import './styles.css';

const STORAGE_KEY = 'wos_judge_games_v2';
const CURRENT_KEY = 'wos_judge_current_v2';

function loadGames() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveGames(games) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
  } catch (e) {
    console.warn('保存失败', e);
  }
}

function loadCurrentId() {
  try {
    return localStorage.getItem(CURRENT_KEY) || null;
  } catch {
    return null;
  }
}

function saveCurrentId(id) {
  try {
    localStorage.setItem(CURRENT_KEY, id || '');
  } catch {}
}

// ===== 将单条事件的状态副作用应用到 game 对象上 =====
function applyEventEffects(g, ev) {
  const actor = ev.actorId ? g.players.find((p) => p.id === ev.actorId) : null;
  const target = ev.targetId ? g.players.find((p) => p.id === ev.targetId) : null;

  const markDead = (pl, reason) => {
    if (!pl) return;
    pl.alive = false;
    pl.deathReason = reason;
    pl.deadRound = ev.roundNumber;
    pl.deadPhase = ev.phase;
    if (pl.isSheriff) {
      // 警长死亡保留标记供法官移交警徽，不立即清空，但提示移交
    }
  };

  switch (ev.type) {
    case 'night_kill':
      if (target) {
        markDead(target, 'kill');
        addPlayerTag(target, '刀口', '#fb7185');
        if (actor && actor.id === target.id) addPlayerTag(target, '自刀', '#ec4899');
      }
      break;
    case 'night_guarded':
      if (target) {
        g.guardLastTargetId = target.id;
        addPlayerTag(target, '被守', '#10b981');
      }
      break;
    case 'night_saved':
      g.witchState.antidoteUsed = true;
      g.witchState.antidoteRound = ev.roundNumber;
      g.witchState.antidoteTargetId = target ? target.id : null;
      if (target) {
        target.alive = true;
        target.deathReason = null;
        target.deadRound = null;
        target.deadPhase = null;
        addPlayerTag(target, '银水', '#38bdf8');
      }
      break;
    case 'night_poisoned':
      g.witchState.poisonUsed = true;
      g.witchState.poisonRound = ev.roundNumber;
      g.witchState.poisonTargetId = target ? target.id : null;
      if (target) {
        markDead(target, 'poison');
        addPlayerTag(target, '被毒', '#a855f7');
        if (canRoleShoot(target.role) && !g.settings.hunterCanShootWhenPoisoned) {
          target.canShootStatus = 'blocked';
          addPlayerTag(target, '闷枪', '#9ca3af');
        }
      }
      break;
    case 'night_seer_check':
      if (target) {
        if (ev.result === 'wolf') addPlayerTag(target, '查杀', '#dc2626');
        else addPlayerTag(target, '金水', '#22c55e');
      }
      break;
    case 'day_sheriff':
      if (target) {
        g.players.forEach((p) => { p.isSheriff = false; });
        target.isSheriff = true;
        target.sheriffState = 'elected';
        g.sheriffId = target.id;
        g.badgeDestroyed = false;
      } else if (ev.tags?.includes('单爆吞警徽') || ev.text.includes('撕') || ev.text.includes('吞')) {
        g.players.forEach((p) => { p.isSheriff = false; });
        g.sheriffId = null;
        g.badgeDestroyed = true;
      }
      break;
    case 'day_vote_out':
      if (target) {
        if (target.role === 'idiot' && !target.idiotRevealed) {
          // 若法官直接记录放逐白痴，默认提示翻牌；这里仍按放逐标死，若翻牌可用白痴翻牌事件
        }
        markDead(target, 'vote');
      }
      break;
    case 'day_idiot_reveal':
      if (target) {
        target.alive = true;
        target.deathReason = null;
        target.idiotRevealed = true;
        addPlayerTag(target, '白痴已翻牌(无票)', '#14b8a6');
      }
      break;
    case 'day_hunter_shot':
      if (actor && canRoleShoot(actor.role)) actor.canShootStatus = 'used';
      if (target) markDead(target, 'shot');
      break;
    case 'day_selfboom':
      if (actor) markDead(actor, 'selfboom');
      if (target) markDead(target, 'whitewolf');
      if (ev.roundNumber === 1 && !g.sheriffId && g.settings.singleBoomEatsBadge) {
        g.badgeDestroyed = true;
      }
      break;
    case 'day_knight_duel':
      if (target && isWolfRole(target.role)) {
        markDead(target, 'duel');
      } else if (actor) {
        markDead(actor, 'duel');
      }
      break;
    case 'lover_link':
      if (actor && target) {
        actor.loverId = target.id;
        target.loverId = actor.id;
        if (!actor.alive && target.alive) markDead(target, 'lover');
      } else if (target) {
        markDead(target, 'lover');
      }
      break;
    case 'foul_warning':
      if (actor) addPlayerTag(actor, '违规警告', '#f43f5e');
      break;
    default:
      break;
  }
}

// ===== 阶段 1：开局配置与发牌设置页 =====
function SetupScreen({ onStart, onCancel }) {
  const [boardId, setBoardId] = useState('b9_std');
  const board = BOARDS[boardId] ?? BOARDS.b9_std;

  const [roleCounts, setRoleCounts] = useState(() => {
    const m = {};
    board.roles.forEach((r) => { m[r] = (m[r] || 0) + 1; });
    return m;
  });
  const [playerNames, setPlayerNames] = useState(Array(12).fill(''));
  const [showNames, setShowNames] = useState(false);
  const [customTitle, setCustomTitle] = useState('');

  const selectBoard = (id) => {
    setBoardId(id);
    const b = BOARDS[id] ?? BOARDS.b9_std;
    const m = {};
    b.roles.forEach((r) => { m[r] = (m[r] || 0) + 1; });
    setRoleCounts(m);
  };

  const changeCount = (roleKey, delta) => {
    setRoleCounts((prev) => {
      const next = Math.max(0, (prev[roleKey] || 0) + delta);
      const copy = { ...prev };
      if (next === 0) delete copy[roleKey];
      else copy[roleKey] = next;
      return copy;
    });
  };

  const rolesList = useMemo(() => {
    const arr = [];
    for (const rk of ROLE_KEYS) {
      const c = roleCounts[rk] || 0;
      for (let i = 0; i < c; i++) arr.push(rk);
    }
    return arr;
  }, [roleCounts]);

  const stats = useMemo(() => {
    let wolf = 0, god = 0, villager = 0, third = 0;
    rolesList.forEach((r) => {
      if (isWolfRole(r)) wolf++;
      else if (isGodRole(r)) god++;
      else if (isVillagerRole(r)) villager++;
      else third++;
    });
    return { total: rolesList.length, wolf, god, villager, third };
  }, [rolesList]);

  const handleLaunch = (mode) => {
    if (stats.total < 4) return;
    if (mode === 'manual_blank') {
      // 线下实体牌模式：默认全员先设为平民，法官在夜里谁睁眼点谁改身份
      const blankRoles = Array(stats.total).fill('villager');
      const g = createGame({
        boardId,
        seatCount: stats.total,
        rolesList: blankRoles,
        playerNames,
        shuffleRoles: false,
      });
      g.title = customTitle.trim() || `${board.name}（线下录入）`;
      onStart(g, false);
    } else {
      const g = createGame({
        boardId,
        seatCount: stats.total,
        rolesList,
        playerNames,
        shuffleRoles: true,
      });
      g.title = customTitle.trim() || board.name;
      onStart(g, mode === 'deal_pass');
    }
  };

  return (
    <div className="setup">
      <div className="setup-card">
        <div className="setup-top">
          <div>
            <h1 className="setup-title">🎴 配置板子并发放身份</h1>
            <p className="setup-sub">默认 9 人标准局（3狼 + 预女猎 + 3民），支持任意增减神狼角色或线下录入实体牌</p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>← 返回首页</button>
        </div>

        <section className="setup-sec">
          <h4>① 选择预设板子</h4>
          <div className="board-grid">
            {Object.values(BOARDS).map((b) => (
              <button
                key={b.id}
                type="button"
                className={`board-opt ${boardId === b.id ? 'board-opt-sel' : ''}`}
                onClick={() => selectBoard(b.id)}
              >
                <div className="board-opt-head">
                  <span className="board-opt-name">{b.name}</span>
                  <span className="board-opt-pill">{b.players}人</span>
                </div>
                <div className="board-opt-meta">{b.winRule}</div>
                {b.notes && <div className="board-opt-note">{b.notes}</div>}
              </button>
            ))}
          </div>
        </section>

        <section className="setup-sec">
          <div className="sec-head-inline">
            <h4>② 调整角色牌数量</h4>
            <div className="deck-summary">
              共 <strong>{stats.total}</strong> 人 ＝
              <span className="c-wolf"> 狼 {stats.wolf}</span> +
              <span className="c-god"> 神 {stats.god}</span> +
              <span className="c-vil"> 民 {stats.villager}</span>
              {stats.third > 0 && <span className="c-third"> + 三方 {stats.third}</span>}
            </div>
          </div>

          <div className="role-counter-grid">
            {ROLE_KEYS.map((rk) => {
              const count = roleCounts[rk] || 0;
              const r = ROLES[rk];
              return (
                <div
                  key={rk}
                  className={`rcounter ${count > 0 ? 'rcounter-on' : ''}`}
                  style={{ '--role-color': r.color }}
                >
                  <div className="rcounter-info" title={r.desc}>
                    <span className="rcounter-dot" />
                    <span className="rcounter-name">{r.name}</span>
                  </div>
                  <div className="rcounter-btns">
                    <button type="button" className="cnt-btn" onClick={() => changeCount(rk, -1)} disabled={count === 0}>−</button>
                    <span className="cnt-val">{count}</span>
                    <button type="button" className="cnt-btn" onClick={() => changeCount(rk, 1)}>+</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="setup-sec">
          <div className="sec-head-inline">
            <h4>③ 对局标题与座位昵称（可选）</h4>
            <button type="button" className="btn btn-xs btn-ghost" onClick={() => setShowNames((v) => !v)}>
              {showNames ? '收起座位昵称 ▲' : '填写 1~N 号玩家名字 ▼'}
            </button>
          </div>
          <input
            type="text"
            className="input-mb"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            placeholder={`选填对局名称，如：周六桌游局 第1把（默认：${board.name}）`}
          />
          {showNames && (
            <div className="names-grid">
              {Array.from({ length: stats.total }).map((_, i) => (
                <div key={i} className="name-item">
                  <span>{i + 1}号</span>
                  <input
                    type="text"
                    value={playerNames[i] || ''}
                    placeholder="玩家名字"
                    onChange={(e) => {
                      const next = [...playerNames];
                      next[i] = e.target.value;
                      setPlayerNames(next);
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="launch-actions">
          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={stats.total < 4}
            onClick={() => handleLaunch('deal_pass')}
          >
            📱 随机发牌并打开「传阅看牌器」
          </button>
          <button
            type="button"
            className="btn btn-good btn-lg"
            disabled={stats.total < 4}
            onClick={() => handleLaunch('random_direct')}
          >
            🎲 随机发牌直接进法官台
          </button>
          <button
            type="button"
            className="btn btn-outline btn-lg"
            disabled={stats.total < 4}
            onClick={() => handleLaunch('manual_blank')}
          >
            ✍️ 线下发实体牌（进局手动点录身份）
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== 夜晚流程引导与一键结算组件（专治法官忘刀口/忘药/忘连守/忘闷枪） =====
function NightGuidePanel({ game, update, onOpenEventModal }) {
  const d = game.nightDraft || createEmptyNightDraft();
  const preview = useMemo(() => previewNightSettlement(game), [game]);

  const setDraft = (patch) => {
    update((g) => {
      g.nightDraft = { ...(g.nightDraft || createEmptyNightDraft()), ...patch };
    }, false);
  };

  const alivePlayers = game.players.filter((p) => p.alive);
  const aliveWolves = alivePlayers.filter((p) => isWolfRole(p.role));
  const guardPlayer = game.players.find((p) => p.role === 'guard');
  const witchPlayer = game.players.find((p) => p.role === 'witch');
  const seerPlayer = game.players.find((p) => p.role === 'seer');

  // 一键结算本夜并进入白天
  const settleNightToDay = () => {
    update((g) => {
      const curRound = g.roundNumber;
      const draft = g.nightDraft || createEmptyNightDraft();
      const prev = previewNightSettlement(g);

      // 1. 记录守卫守护
      if (draft.guardTargetId) {
        const gActor = g.players.find((p) => p.role === 'guard')?.id || null;
        const gt = g.players.find((p) => p.id === draft.guardTargetId);
        const blocked = draft.wolfTargetId && draft.wolfTargetId === draft.guardTargetId && !draft.witchSave;
        g.guardLastTargetId = draft.guardTargetId;
        if (gt) addPlayerTag(gt, '被守', '#10b981');
        g.events.push({
          id: makeId('ev'),
          roundNumber: curRound,
          phase: 'night',
          type: 'night_guarded',
          actorId: gActor,
          targetId: draft.guardTargetId,
          text: blocked ? `守卫守中 ${gt?.seat}号，成功堵住狼刀！` : `守卫守护 ${gt?.seat}号`,
          annotation: '',
          tags: blocked ? ['堵刀成功'] : [],
          timestamp: Date.now(),
        });
      } else {
        g.guardLastTargetId = null;
      }

      // 2. 记录狼人落刀（含谁拿刀）
      if (draft.wolfTargetId) {
        const wt = g.players.find((p) => p.id === draft.wolfTargetId);
        const wk = g.players.find((p) => p.id === draft.wolfKillerId);
        const isSelfKill = wk && wt && wk.id === wt.id;
        if (wt) addPlayerTag(wt, '刀口', '#fb7185');
        if (isSelfKill && wt) addPlayerTag(wt, '自刀', '#ec4899');
        g.events.push({
          id: makeId('ev'),
          roundNumber: curRound,
          phase: 'night',
          type: 'night_kill',
          actorId: draft.wolfKillerId || null,
          targetId: draft.wolfTargetId,
          text: wk ? `${wk.seat}号拿刀 → 袭击 ${wt?.seat}号` : `狼队袭击 ${wt?.seat}号`,
          annotation: '',
          tags: isSelfKill ? ['刀口', '拿刀主刀', '自刀骗药'] : (wk ? ['刀口', '拿刀主刀'] : ['刀口']),
          timestamp: Date.now() + 1,
        });
      } else {
        g.events.push({
          id: makeId('ev'),
          roundNumber: curRound,
          phase: 'night',
          type: 'night_kill',
          actorId: null,
          targetId: null,
          text: '狼队选择空刀',
          annotation: '',
          tags: ['空刀'],
          timestamp: Date.now() + 1,
        });
      }

      // 3. 记录女巫解药
      if (draft.witchSave && draft.wolfTargetId) {
        const wActor = g.players.find((p) => p.role === 'witch')?.id || null;
        const wt = g.players.find((p) => p.id === draft.wolfTargetId);
        const milkKilled = draft.guardTargetId && draft.guardTargetId === draft.wolfTargetId && g.settings.sameGuardSameSaveDies;
        g.witchState.antidoteUsed = true;
        g.witchState.antidoteRound = curRound;
        g.witchState.antidoteTargetId = draft.wolfTargetId;
        if (wt && !milkKilled) addPlayerTag(wt, '银水', '#38bdf8');
        g.events.push({
          id: makeId('ev'),
          roundNumber: curRound,
          phase: 'night',
          type: 'night_saved',
          actorId: wActor,
          targetId: draft.wolfTargetId,
          text: milkKilled ? `女巫对 ${wt?.seat}号用解药，但与守卫同守同救触发奶穿！` : `女巫用解药救起 ${wt?.seat}号（银水）`,
          annotation: '',
          tags: milkKilled ? ['同守同救(奶穿)'] : (curRound === 1 ? ['首夜救人'] : []),
          timestamp: Date.now() + 2,
        });
      }

      // 4. 记录女巫毒药
      if (draft.witchPoisonTargetId) {
        const wActor = g.players.find((p) => p.role === 'witch')?.id || null;
        const pt = g.players.find((p) => p.id === draft.witchPoisonTargetId);
        g.witchState.poisonUsed = true;
        g.witchState.poisonRound = curRound;
        g.witchState.poisonTargetId = draft.witchPoisonTargetId;
        const blockedGun = pt && canRoleShoot(pt.role) && !g.settings.hunterCanShootWhenPoisoned;
        if (pt) {
          addPlayerTag(pt, '被毒', '#a855f7');
          if (blockedGun) {
            pt.canShootStatus = 'blocked';
            addPlayerTag(pt, '闷枪', '#9ca3af');
          }
        }
        g.events.push({
          id: makeId('ev'),
          roundNumber: curRound,
          phase: 'night',
          type: 'night_poisoned',
          actorId: wActor,
          targetId: draft.witchPoisonTargetId,
          text: blockedGun ? `女巫毒杀 ${pt?.seat}号（${roleName(pt.role)}被毒闷枪，不可开枪！）` : `女巫毒杀 ${pt?.seat}号`,
          annotation: '',
          tags: blockedGun ? ['闷枪(毒猎人)'] : [],
          timestamp: Date.now() + 3,
        });
      }

      // 5. 记录预言家查验
      if (draft.seerTargetId && prev.seerCheckInfo) {
        const sActor = g.players.find((p) => p.role === 'seer')?.id || null;
        const st = g.players.find((p) => p.id === draft.seerTargetId);
        const res = prev.seerCheckInfo.result;
        if (st) {
          addPlayerTag(st, res === 'wolf' ? '查杀' : '金水', res === 'wolf' ? '#dc2626' : '#22c55e');
        }
        g.events.push({
          id: makeId('ev'),
          roundNumber: curRound,
          phase: 'night',
          type: 'night_seer_check',
          actorId: sActor,
          targetId: draft.seerTargetId,
          result: res,
          text: `预言家查验 ${st?.seat}号 → ${res === 'wolf' ? '狼人（查杀）' : '好人（金水）'}`,
          annotation: '',
          tags: [res === 'wolf' ? '查杀' : '金水'],
          timestamp: Date.now() + 4,
        });
      }

      // 6. 结算真实死亡玩家并生成天亮死讯公告事件
      for (const item of prev.deaths) {
        const pl = g.players.find((p) => p.id === item.player.id);
        if (pl) {
          pl.alive = false;
          pl.deathReason = item.reason;
          pl.deadRound = curRound;
          pl.deadPhase = 'night';
          if (canRoleShoot(pl.role)) {
            pl.canShootStatus = item.canShoot ? 'yes' : 'blocked';
          }
        }
      }

      g.events.push({
        id: makeId('ev'),
        roundNumber: curRound,
        phase: 'night',
        type: 'night_settle',
        actorId: null,
        targetId: prev.deaths.length === 1 ? prev.deaths[0].player.id : null,
        text: prev.announcement + (draft.note ? `（夜间备注：${draft.note}）` : ''),
        annotation: '',
        tags: prev.deaths.length === 0 ? ['平安夜'] : [],
        timestamp: Date.now() + 5,
      });

      // 清空夜晚草稿并切入同回合白天
      g.nightDraft = createEmptyNightDraft();
      g.phase = 'day';
    });
  };

  return (
    <section className="panel guide-panel">
      <div className="panel-head">
        <h3>🌙 第 {game.roundNumber} 夜 · 法官流程引导台</h3>
        <button
          type="button"
          className="btn btn-xs btn-ghost"
          onClick={() => setDraft(createEmptyNightDraft())}
        >
          清空重选
        </button>
      </div>

      {/* 步骤 1：守卫（如果板子里有守卫，或法官想记守护） */}
      {guardPlayer && (
        <div className="step-card">
          <div className="step-title">
            <span>🛡️ 1. 守卫睁眼（{guardPlayer.seat}号 {guardPlayer.alive ? '存活' : '💀已出局请空过'}）</span>
            {game.guardLastTargetId && (
              <span className="step-hint-warn">
                上夜守了 {game.players.find((p) => p.id === game.guardLastTargetId)?.seat}号（不可连守）
              </span>
            )}
          </div>
          <select
            value={d.guardTargetId}
            disabled={!guardPlayer.alive}
            onChange={(e) => setDraft({ guardTargetId: e.target.value })}
          >
            <option value="">— 空守 / 不守护 —</option>
            {alivePlayers.map((p) => (
              <option key={p.id} value={p.id}>
                守护 {p.seat}号{p.name ? `(${p.name})` : ''} · {roleName(p.role)}
                {game.guardLastTargetId === p.id ? ' ⚠️上夜刚守过！' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 步骤 2：狼人落刀（记录谁拿刀 + 刀了谁） */}
      <div className="step-card">
        <div className="step-title">
          <span>🗡️ {guardPlayer ? '2.' : '1.'} 狼人睁眼落刀</span>
          <span className="step-hint">在场狼：{aliveWolves.map((w) => `${w.seat}号`).join('、') || '无'}</span>
        </div>
        <div className="form-row-2 compact-row">
          <select
            value={d.wolfKillerId}
            onChange={(e) => setDraft({ wolfKillerId: e.target.value })}
            aria-label="拿刀狼人"
          >
            <option value="">谁拿刀/主刀（可选）</option>
            {aliveWolves.map((w) => (
              <option key={w.id} value={w.id}>{w.seat}号{w.name ? `(${w.name})` : ''} 拿刀</option>
            ))}
          </select>
          <select
            value={d.wolfTargetId}
            onChange={(e) => setDraft({ wolfTargetId: e.target.value })}
            aria-label="狼刀目标"
          >
            <option value="">— 选择刀口（留空=空刀） —</option>
            {alivePlayers.map((p) => (
              <option key={p.id} value={p.id}>
                刀 {p.seat}号{p.name ? `(${p.name})` : ''} · {roleName(p.role)}{isWolfRole(p.role) ? ' [自刀]' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 步骤 3：女巫用药 */}
      <div className="step-card">
        <div className="step-title">
          <span>
            🧪 {guardPlayer ? '3.' : '2.'} 女巫睁眼
            {witchPlayer ? `（${witchPlayer.seat}号 ${witchPlayer.alive ? '存活' : '💀已出局请闭眼等节奏'}）` : ''}
          </span>
          <span className="step-hint">
            解药:{game.witchState.antidoteUsed ? '已用' : '🟢有'} ｜ 毒药:{game.witchState.poisonUsed ? '已用' : '🟢有'}
          </span>
        </div>

        <div className="witch-box">
          <div className="witch-knife-info">
            今晚刀口：
            {preview.wolfTarget ? (
              <strong>{preview.wolfTarget.seat}号（{roleName(preview.wolfTarget.role)}）</strong>
            ) : (
              <span className="muted">尚未选择 / 空刀</span>
            )}
          </div>
          <div className="form-row-2 compact-row">
            <label className={`save-toggle ${d.witchSave ? 'save-toggle-on' : ''}`}>
              <input
                type="checkbox"
                checked={!!d.witchSave}
                disabled={!d.wolfTargetId || (witchPlayer && !witchPlayer.alive)}
                onChange={(e) => setDraft({
                  witchSave: e.target.checked,
                  witchPoisonTargetId: e.target.checked && !game.settings.witchSameNightBothPots ? '' : d.witchPoisonTargetId,
                })}
              />
              <span>💊 用解药救刀口</span>
            </label>

            <select
              value={d.witchPoisonTargetId}
              disabled={witchPlayer && !witchPlayer.alive}
              onChange={(e) => setDraft({
                witchPoisonTargetId: e.target.value,
                witchSave: e.target.value && !game.settings.witchSameNightBothPots ? false : d.witchSave,
              })}
              aria-label="女巫毒药目标"
            >
              <option value="">☠️ 不用毒药</option>
              {alivePlayers.map((p) => (
                <option key={p.id} value={p.id}>
                  毒 {p.seat}号{p.name ? `(${p.name})` : ''} · {roleName(p.role)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 步骤 4：预言家查验 */}
      <div className="step-card">
        <div className="step-title">
          <span>
            🔍 {guardPlayer ? '4.' : '3.'} 预言家睁眼
            {seerPlayer ? `（${seerPlayer.seat}号 ${seerPlayer.alive ? '存活' : '💀已出局'}）` : ''}
          </span>
        </div>
        <select
          value={d.seerTargetId}
          disabled={seerPlayer && !seerPlayer.alive}
          onChange={(e) => setDraft({ seerTargetId: e.target.value })}
          aria-label="预言家查验目标"
        >
          <option value="">— 选择今晚查验对象 —</option>
          {alivePlayers
            .filter((p) => !seerPlayer || p.id !== seerPlayer.id)
            .map((p) => (
              <option key={p.id} value={p.id}>
                查验 {p.seat}号{p.name ? `(${p.name})` : ''} · {roleName(p.role)}
              </option>
            ))}
        </select>

        {preview.seerCheckInfo && (
          <div className={`seer-gesture-box ${preview.seerCheckInfo.result === 'wolf' ? 'gesture-wolf' : 'gesture-good'}`}>
            法官请给手势：<strong>{preview.seerCheckInfo.gesture}</strong> {preview.seerCheckInfo.note}
          </div>
        )}
      </div>

      <input
        type="text"
        className="input-mb"
        value={d.note}
        onChange={(e) => setDraft({ note: e.target.value })}
        placeholder="夜间其他乱七八糟情况随手记（如：5号夜间不小心碰杯子、狼队商量很久）…"
      />

      {/* 结算预览与警告 */}
      <div className="settle-preview">
        {preview.warnings.map((w, i) => (
          <div key={i} className="warn-banner">{w}</div>
        ))}
        <div className="announce-text">{preview.announcement}</div>
        {preview.deaths.length > 0 && (
          <div className="death-detail-list">
            {preview.deaths.map((x) => (
              <div key={x.player.id} className="death-detail-item">
                💀 {x.player.seat}号（{roleName(x.player.role)}）：{x.reasonText}
              </div>
            ))}
          </div>
        )}
        {preview.gunNotes.map((gn, idx) => (
          <div key={idx} className={`gun-banner ${gn.allowed ? 'gun-ok' : 'gun-no'}`}>
            {gn.text}
          </div>
        ))}
      </div>

      <div className="guide-actions">
        <button type="button" className="btn btn-primary btn-block" onClick={settleNightToDay}>
          🌅 一键结算第 {game.roundNumber} 夜，进入白天
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost btn-block"
          onClick={() => onOpenEventModal({ roundNumber: game.roundNumber, phase: 'night', type: 'note' })}
        >
          + 单独添加一条夜间其他事件（丘比特/混血/违规等）
        </button>
      </div>
    </section>
  );
}

// ===== 白天主持与各种突发情况快速记录台 =====
function DayGuidePanel({ game, update, selectedPlayerId, onOpenEventModal }) {
  const [voteTargetId, setVoteTargetId] = useState('');
  const [voteDetail, setVoteDetail] = useState('');

  const alivePlayers = game.players.filter((p) => p.alive);
  const sheriff = game.players.find((p) => p.isSheriff);

  const toggleCampaign = (pid, nextState) => {
    update((g) => {
      const p = g.players.find((x) => x.id === pid);
      if (!p) return;
      p.sheriffState = p.sheriffState === nextState ? 'none' : nextState;
    });
  };

  const electSheriff = (pid) => {
    update((g) => {
      g.players.forEach((p) => { p.isSheriff = false; });
      const target = g.players.find((p) => p.id === pid);
      if (target) {
        target.isSheriff = true;
        target.sheriffState = 'elected';
        g.sheriffId = target.id;
        g.badgeDestroyed = false;
        g.events.push({
          id: makeId('ev'),
          roundNumber: g.roundNumber,
          phase: 'day',
          type: 'day_sheriff',
          actorId: null,
          targetId: target.id,
          text: `${target.seat}号 当选/接任警长（1.5票）`,
          annotation: '',
          tags: ['警长'],
          timestamp: Date.now(),
        });
      }
    });
  };

  const destroyBadge = () => {
    update((g) => {
      g.players.forEach((p) => { p.isSheriff = false; });
      g.sheriffId = null;
      g.badgeDestroyed = true;
      g.events.push({
        id: makeId('ev'),
        roundNumber: g.roundNumber,
        phase: 'day',
        type: 'day_sheriff',
        actorId: null,
        targetId: null,
        text: '警徽流失 / 撕毁警徽（本局后续无警徽）',
        annotation: '',
        tags: [],
        timestamp: Date.now(),
      });
    });
  };

  const quickVoteOut = () => {
    if (!voteTargetId) return;
    const t = game.players.find((p) => p.id === voteTargetId);
    if (!t) return;

    update((g) => {
      const target = g.players.find((p) => p.id === voteTargetId);
      if (!target) return;
      if (target.role === 'idiot' && !target.idiotRevealed) {
        target.idiotRevealed = true;
        addPlayerTag(target, '白痴已翻牌(无票)', '#14b8a6');
        g.events.push({
          id: makeId('ev'),
          roundNumber: g.roundNumber,
          phase: 'day',
          type: 'day_idiot_reveal',
          actorId: null,
          targetId: target.id,
          text: `${target.seat}号 被公投最高票，翻牌亮出【白痴】免死！（后续失去投票权）${voteDetail ? ` 票型：${voteDetail}` : ''}`,
          annotation: '',
          tags: ['白痴翻牌'],
          timestamp: Date.now(),
        });
      } else {
        target.alive = false;
        target.deathReason = 'vote';
        target.deadRound = g.roundNumber;
        target.deadPhase = 'day';
        g.events.push({
          id: makeId('ev'),
          roundNumber: g.roundNumber,
          phase: 'day',
          type: 'day_vote_out',
          actorId: null,
          targetId: target.id,
          text: `${target.seat}号（${roleName(target.role)}）被公投放逐出局${voteDetail ? ` ｜ 票型：${voteDetail}` : ''}`,
          annotation: '',
          tags: canRoleShoot(target.role) ? ['可发动开枪'] : [],
          timestamp: Date.now(),
        });
      }
    });
    setVoteTargetId('');
    setVoteDetail('');
  };

  const enterNextNight = () => {
    update((g) => {
      g.roundNumber += 1;
      g.phase = 'night';
      g.nightDraft = createEmptyNightDraft();
    });
  };

  return (
    <section className="panel guide-panel">
      <div className="panel-head">
        <h3>☀️ 第 {game.roundNumber} 天 · 白天主持与突发情况台</h3>
      </div>

      {/* 1. 警长竞选与警徽管理 */}
      <div className="step-card">
        <div className="step-title">
          <span>🎖️ 警长竞选 / 警徽移交</span>
          <span>
            {sheriff ? `当前警长：${sheriff.seat}号` : game.badgeDestroyed ? '警徽已撕/流失' : '尚未选出警长'}
          </span>
        </div>
        {game.roundNumber === 1 && !sheriff && !game.badgeDestroyed && (
          <div className="campaign-box">
            <div className="field-tip" style={{ marginTop: 0, marginBottom: 6 }}>
              点一下标记【上警】，再点变【退水】（防忘谁在警上谁警下投票）：
            </div>
            <div className="campaign-seats">
              {game.players.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`camp-chip camp-${p.sheriffState}`}
                  onClick={() => {
                    const order = { none: 'running', running: 'dropped', dropped: 'none', elected: 'none' };
                    toggleCampaign(p.id, order[p.sheriffState] || 'running');
                  }}
                >
                  {p.seat}号
                  {p.sheriffState === 'running' ? ' ✋警上' : p.sheriffState === 'dropped' ? ' 💧退水' : ''}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="form-row-2 compact-row" style={{ marginTop: 8 }}>
          <select
            value={sheriff?.id || ''}
            onChange={(e) => { if (e.target.value) electSheriff(e.target.value); }}
            aria-label="指定或移交警长"
          >
            <option value="">🎖️ 点选当选/接任警长的座位…</option>
            {alivePlayers.map((p) => (
              <option key={p.id} value={p.id}>{p.seat}号{p.name ? `(${p.name})` : ''} 当选/接警徽</option>
            ))}
          </select>
          <button type="button" className="btn btn-sm btn-danger" onClick={destroyBadge}>
            🗑️ 撕毁/吞掉警徽
          </button>
        </div>
      </div>

      {/* 2. 白天公投放逐 */}
      <div className="step-card">
        <div className="step-title">
          <span>⚖️ 白天公投放逐（自动识别白痴翻牌）</span>
        </div>
        <select
          value={voteTargetId}
          onChange={(e) => setVoteTargetId(e.target.value)}
          className="input-mb"
          aria-label="被放逐玩家"
        >
          <option value="">— 选择今天被放逐出局的玩家 —</option>
          {alivePlayers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.seat}号{p.name ? `(${p.name})` : ''} · {roleName(p.role)}
              {p.idiotRevealed ? ' [白痴已翻牌免投]' : ''}
            </option>
          ))}
        </select>
        <div className="custom-tag-row">
          <input
            type="text"
            value={voteDetail}
            onChange={(e) => setVoteDetail(e.target.value)}
            placeholder="选填票型情况：如 1,4,5(警)→3号；2,6→7号；8弃票"
          />
          <button type="button" className="btn btn-sm btn-primary" disabled={!voteTargetId} onClick={quickVoteOut}>
            确认放逐
          </button>
        </div>
      </div>

      {/* 3. 各种乱七八糟突发情况一键记录 */}
      <div className="step-card">
        <div className="step-title">
          <span>⚡ 突发事件一键记（开枪 / 自爆 / 决斗 / 违规 / 备注）</span>
        </div>
        <div className="chaos-grid">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => onOpenEventModal({
              type: 'day_hunter_shot',
              actorId: game.players.find((p) => canRoleShoot(p.role) && !p.alive)?.id || selectedPlayerId || '',
            })}
          >
            💥 猎人/狼王开枪
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => onOpenEventModal({ type: 'day_selfboom', actorId: selectedPlayerId || '' })}
          >
            💣 狼人/白狼王自爆
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => onOpenEventModal({ type: 'day_knight_duel', actorId: game.players.find((p) => p.role === 'knight')?.id || '' })}
          >
            ⚔️ 骑士决斗
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => onOpenEventModal({ type: 'lover_link', targetId: selectedPlayerId || '' })}
          >
            💔 情侣殉情
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => onOpenEventModal({ type: 'foul_warning', actorId: selectedPlayerId || '' })}
          >
            ⚠️ 贴脸/场外判罚
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => onOpenEventModal({ type: 'note', actorId: selectedPlayerId || '' })}
          >
            📝 记发言/对跳/杂事
          </button>
        </div>
      </div>

      <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 10 }} onClick={enterNextNight}>
        🌙 白天结束，天黑进入第 {game.roundNumber + 1} 夜 →
      </button>
    </section>
  );
}

// ===== 主对局控制台 =====
function GameScreen({ game, update, canUndo, onUndo, onBack }) {
  const [tab, setTab] = useState('play');
  const [hideSecrets, setHideSecrets] = useState(false);
  const [selectedSeatId, setSelectedSeatId] = useState(null);
  const [dealModalOpen, setDealModalOpen] = useState(false);
  const [eventModalData, setEventModalData] = useState(null);
  const [detailPlayerId, setDetailPlayerId] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [quickTagInput, setQuickTagInput] = useState('');

  // 时间线筛选状态
  const [tlTypeFilter, setTlTypeFilter] = useState('all');
  const [tlPlayerFilter, setTlPlayerFilter] = useState('all');
  const [tlOnlyAnnotated, setTlOnlyAnnotated] = useState(false);

  const roundStats = useMemo(() => computeRound(game), [game]);
  const selectedPlayer = game.players.find((p) => p.id === selectedSeatId) || null;
  const sheriff = game.players.find((p) => p.isSheriff) || null;
  const guardLast = game.players.find((p) => p.id === game.guardLastTargetId) || null;

  const pShort = (id) => {
    const pl = game.players.find((x) => x.id === id);
    if (!pl) return '';
    return hideSecrets ? `${pl.seat}号` : `${pl.seat}号(${roleShort(pl.role)})`;
  };

  // 保存新增或修改的事件（支持事后任意标注）
  const handleSaveEvent = (payload, shouldApplyEffects) => {
    update((g) => {
      if (payload.id) {
        const idx = g.events.findIndex((e) => e.id === payload.id);
        if (idx >= 0) {
          g.events[idx] = { ...g.events[idx], ...payload };
          if (shouldApplyEffects) applyEventEffects(g, g.events[idx]);
        }
      } else {
        const newEv = {
          ...payload,
          id: makeId('ev'),
          timestamp: Date.now(),
        };
        g.events.push(newEv);
        if (shouldApplyEffects) applyEventEffects(g, newEv);
      }
    });
    setEventModalData(null);
  };

  const handleDeleteEvent = (evId) => {
    update((g) => {
      g.events = g.events.filter((e) => e.id !== evId);
    });
  };

  // 按（回合 + 夜晚/白天）分组事件，清晰区分 第1夜、第1天、第2夜、第2天
  const groupedTimeline = useMemo(() => {
    const filtered = game.events.filter((e) => {
      if (tlTypeFilter !== 'all' && e.type !== tlTypeFilter) return false;
      if (tlPlayerFilter !== 'all' && e.actorId !== tlPlayerFilter && e.targetId !== tlPlayerFilter) return false;
      if (tlOnlyAnnotated && !e.annotation) return false;
      return true;
    });
    const map = new Map();
    for (const ev of filtered) {
      const key = `${ev.roundNumber}_${ev.phase}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          roundNumber: ev.roundNumber || 1,
          phase: ev.phase || 'night',
          items: [],
        });
      }
      map.get(key).items.push(ev);
    }
    return [...map.values()].sort((a, b) => {
      if (a.roundNumber !== b.roundNumber) return a.roundNumber - b.roundNumber;
      return a.phase === 'night' ? -1 : 1;
    });
  }, [game.events, tlTypeFilter, tlPlayerFilter, tlOnlyAnnotated]);

  return (
    <div className="console">
      {/* 顶部主控制栏 */}
      <header className="topbar">
        <div className="topbar-left">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>← 对局库</button>
          <div className="game-title">
            <strong>{game.title || game.boardName}</strong>
            <span className="game-sub">
              {game.phase === 'night' ? `🌙 第 ${game.roundNumber} 夜` : `☀️ 第 ${game.roundNumber} 天`}
              {' · '}{game.players.length}人局
            </span>
          </div>
        </div>

        <div className="topbar-right">
          <div className="camp-counter" title="当前在场存活人数">
            <span className="cc-wolf">狼 {roundStats.wolf}</span>
            <span className="cc-sep">|</span>
            <span className="cc-god">神 {roundStats.god}</span>
            <span className="cc-sep">|</span>
            <span className="cc-vil">民 {roundStats.villager}</span>
          </div>

          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setHideSecrets((v) => !v)}
            title="防玩家路过偷窥屏幕"
          >
            {hideSecrets ? '👁️ 显示底牌' : '🙈 遮挡底牌'}
          </button>

          <button type="button" className="btn btn-sm" onClick={() => setDealModalOpen(true)}>
            📱 传阅发牌
          </button>

          <button
            type="button"
            className="btn btn-sm"
            disabled={!canUndo}
            onClick={onUndo}
            title="撤回上一次操作"
          >
            ↩️ 撤销
          </button>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setEventModalData({ roundNumber: game.roundNumber, phase: game.phase, actorId: selectedSeatId || '' })}
          >
            ➕ 记一笔情况
          </button>
        </div>
      </header>

      {/* 法官防忘事关键状态胶囊条 */}
      <div className="status-strip">
        <button
          type="button"
          className={`status-pill ${game.witchState.antidoteUsed ? 'pill-used' : 'pill-ready'}`}
          onClick={() => update((g) => { g.witchState.antidoteUsed = !g.witchState.antidoteUsed; })}
          title="点击可手动切换女巫解药状态"
        >
          💊 解药：{game.witchState.antidoteUsed
            ? `已用${game.witchState.antidoteRound ? `(N${game.witchState.antidoteRound})` : ''}`
            : '可用'}
        </button>

        <button
          type="button"
          className={`status-pill ${game.witchState.poisonUsed ? 'pill-used' : 'pill-ready'}`}
          onClick={() => update((g) => { g.witchState.poisonUsed = !g.witchState.poisonUsed; })}
          title="点击可手动切换女巫毒药状态"
        >
          ☠️ 毒药：{game.witchState.poisonUsed
            ? `已用${game.witchState.poisonRound ? `(N${game.witchState.poisonRound})` : ''}`
            : '可用'}
        </button>

        <span className="status-pill">
          🎖️ 警长：{sheriff ? `${sheriff.seat}号` : game.badgeDestroyed ? '已撕/无警徽' : '待竞选'}
        </span>

        {game.players.some((p) => p.role === 'guard') && (
          <span className="status-pill">
            🛡️ 上夜守护：{guardLast ? `${guardLast.seat}号` : '无'}
          </span>
        )}

        <div className="phase-switcher-mini">
          <span>阶段切换：</span>
          <button
            type="button"
            className={`btn btn-xs ${game.phase === 'night' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => update((g) => { g.phase = 'night'; })}
          >
            🌙 第{game.roundNumber}夜
          </button>
          <button
            type="button"
            className={`btn btn-xs ${game.phase === 'day' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => update((g) => { g.phase = 'day'; })}
          >
            ☀️ 第{game.roundNumber}天
          </button>
          <button
            type="button"
            className="btn btn-xs btn-ghost"
            title="回合数-1"
            onClick={() => update((g) => { g.roundNumber = Math.max(1, g.roundNumber - 1); })}
          >
            −回合
          </button>
          <button
            type="button"
            className="btn btn-xs btn-ghost"
            title="回合数+1"
            onClick={() => update((g) => { g.roundNumber += 1; })}
          >
            +回合
          </button>
        </div>
      </div>

      {/* 临界轮次 / 屠边自动提醒横幅 */}
      {roundStats.autoHint && game.winner === 'ongoing' && (
        <div className={`alert-bar alert-${roundStats.autoHint.winner}`}>
          <span>{roundStats.autoHint.reason}</span>
          {(roundStats.autoHint.winner === 'good' || roundStats.autoHint.winner === 'wolf') && (
            <button
              type="button"
              className="btn btn-xs btn-primary"
              onClick={() => {
                update((g) => { g.winner = roundStats.autoHint.winner; });
                setTab('timeline');
              }}
            >
              🏆 确认结算并进入复盘标注
            </button>
          )}
        </div>
      )}

      {/* 导航页签 */}
      <nav className="tabs">
        {[
          ['play', '🎮 法官主持台'],
          ['timeline', `📜 全局记录与事后标注 (${game.events.length})`],
          ['roles', '🎭 身份发牌与备注墙'],
          ['settings', '⚙️ 房规与导出备份'],
        ].map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`tab ${tab === k ? 'tab-sel' : ''}`}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className="content">
        {/* ==================== 页签 1：法官主持台 ==================== */}
        {tab === 'play' && (
          <div className="play-grid">
            {/* 左栏：座位盘 + 选中座位快捷操作/贴标签/改身份 */}
            <section className="panel">
              <div className="panel-head">
                <h3>🪑 座位盘（点击座位可快速记事件/贴标签/改身份）</h3>
                {selectedPlayer && (
                  <button type="button" className="btn btn-xs btn-ghost" onClick={() => setSelectedSeatId(null)}>
                    取消选中
                  </button>
                )}
              </div>

              <div className="seat-grid">
                {game.players.map((p) => {
                  const r = ROLES[p.role] || ROLES.villager;
                  const isSel = selectedSeatId === p.id;
                  return (
                    <div
                      key={p.id}
                      role="button"
                      tabIndex={0}
                      className={`seat-card ${isSel ? 'seat-card-sel' : ''} ${p.alive ? '' : 'seat-card-dead'}`}
                      style={{ '--role-color': hideSecrets ? '#64748b' : r.color }}
                      onClick={() => setSelectedSeatId(isSel ? null : p.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedSeatId(isSel ? null : p.id); }}
                    >
                      <div className="sc-top">
                        <span className="sc-num">
                          {p.seat}号 {p.isSheriff && <span title="警长">🎖️</span>}
                        </span>
                        <span className="sc-role-pill">
                          {hideSecrets ? '❓已遮挡' : r.name}
                        </span>
                      </div>

                      {p.name && <div className="sc-player-name">{p.name}</div>}

                      {!p.alive && (
                        <div className="sc-dead-reason">
                          💀 {DEATH_REASON_LABELS[p.deathReason] || '已出局'}
                        </div>
                      )}

                      {p.tags.length > 0 && (
                        <div className="sc-tags">
                          {p.tags.slice(0, 4).map((t) => (
                            <span
                              key={t.id}
                              className="sc-tag-mini"
                              style={{ borderColor: t.color, color: t.color }}
                            >
                              {t.label}
                            </span>
                          ))}
                          {p.tags.length > 4 && <span className="sc-tag-mini">+{p.tags.length - 4}</span>}
                        </div>
                      )}

                      {p.notes && <div className="sc-note-preview">📝 {p.notes}</div>}
                    </div>
                  );
                })}
              </div>

              {/* 选中某位玩家时的下方操作抽屉 */}
              {selectedPlayer && (
                <div className="selected-drawer">
                  <div className="sd-header">
                    <div className="sd-title">
                      <span className="sel-seat" style={{ '--role-color': roleColor(selectedPlayer.role) }}>
                        {selectedPlayer.seat}号{selectedPlayer.name ? ` · ${selectedPlayer.name}` : ''}
                      </span>
                      {!hideSecrets && (
                        <select
                          className="select-sm"
                          value={selectedPlayer.role}
                          aria-label="修改该座位身份"
                          onChange={(e) => update((g) => {
                            const pl = g.players.find((x) => x.id === selectedPlayer.id);
                            if (pl) pl.role = e.target.value;
                          })}
                        >
                          {ROLE_KEYS.map((rk) => (
                            <option key={rk} value={rk}>身份：{ROLES[rk].name}</option>
                          ))}
                        </select>
                      )}
                      <span className={selectedPlayer.alive ? 'state-alive' : 'state-dead'}>
                        {selectedPlayer.alive ? '🟢 存活' : `🔴 ${DEATH_REASON_LABELS[selectedPlayer.deathReason] || '出局'}`}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="btn btn-xs btn-outline"
                      onClick={() => setDetailPlayerId(selectedPlayer.id)}
                    >
                      📄 完整档案
                    </button>
                  </div>

                  {/* 快捷事件按钮 */}
                  <div className="sd-actions">
                    <button type="button" className="btn btn-xs" onClick={() => setEventModalData({ type: 'night_kill', targetId: selectedPlayer.id })}>🗡️ 被狼刀</button>
                    <button type="button" className="btn btn-xs" onClick={() => setEventModalData({ type: 'night_saved', targetId: selectedPlayer.id })}>💊 被救(银)</button>
                    <button type="button" className="btn btn-xs" onClick={() => setEventModalData({ type: 'night_poisoned', targetId: selectedPlayer.id })}>☠️ 被毒</button>
                    <button type="button" className="btn btn-xs" onClick={() => setEventModalData({ type: 'night_guarded', targetId: selectedPlayer.id })}>🛡️ 被守</button>
                    <button type="button" className="btn btn-xs" onClick={() => setEventModalData({ type: 'night_seer_check', targetId: selectedPlayer.id })}>🔍 被查验</button>
                    <button type="button" className="btn btn-xs" onClick={() => setEventModalData({ type: 'day_vote_out', targetId: selectedPlayer.id })}>⚖️ 放逐</button>
                    <button type="button" className="btn btn-xs" onClick={() => setEventModalData({ type: 'day_hunter_shot', actorId: selectedPlayer.id })}>💥 他开枪</button>
                    <button type="button" className="btn btn-xs" onClick={() => setEventModalData({ type: 'day_selfboom', actorId: selectedPlayer.id })}>💣 他自爆</button>
                    {selectedPlayer.alive ? (
                      <button
                        type="button"
                        className="btn btn-xs btn-danger"
                        onClick={() => update((g) => {
                          const pl = g.players.find((x) => x.id === selectedPlayer.id);
                          if (pl) { pl.alive = false; pl.deathReason = 'manual'; pl.deadRound = g.roundNumber; pl.deadPhase = g.phase; }
                        })}
                      >
                        ☠️ 标为死亡
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-xs btn-warn"
                        onClick={() => update((g) => {
                          const pl = g.players.find((x) => x.id === selectedPlayer.id);
                          if (pl) { pl.alive = true; pl.deathReason = null; pl.deadRound = null; pl.deadPhase = null; }
                        })}
                      >
                        ↩️ 恢复存活
                      </button>
                    )}
                  </div>

                  {/* 一键贴标签 */}
                  <div className="sd-tags">
                    {PRESET_PLAYER_TAGS.slice(0, 12).map((pt) => {
                      const has = selectedPlayer.tags.some((t) => t.label === pt.label);
                      return (
                        <button
                          key={pt.label}
                          type="button"
                          className={`tag-mini-btn ${has ? 'tag-mini-on' : ''}`}
                          onClick={() => update((g) => {
                            const pl = g.players.find((x) => x.id === selectedPlayer.id);
                            if (!pl) return;
                            const ex = pl.tags.find((t) => t.label === pt.label);
                            if (ex) removePlayerTag(pl, ex.id);
                            else addPlayerTag(pl, pt.label, pt.color);
                          })}
                        >
                          {has ? '✓' : '+'}{pt.label}
                        </button>
                      );
                    })}
                    <div className="sd-custom-tag">
                      <input
                        type="text"
                        value={quickTagInput}
                        placeholder="自定义标签…"
                        onChange={(e) => setQuickTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && quickTagInput.trim()) {
                            const txt = quickTagInput.trim();
                            update((g) => {
                              const pl = g.players.find((x) => x.id === selectedPlayer.id);
                              if (pl) addPlayerTag(pl, txt, '#3b82f6');
                            });
                            setQuickTagInput('');
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-xs"
                        onClick={() => {
                          if (!quickTagInput.trim()) return;
                          const txt = quickTagInput.trim();
                          update((g) => {
                            const pl = g.players.find((x) => x.id === selectedPlayer.id);
                            if (pl) addPlayerTag(pl, txt, '#3b82f6');
                          });
                          setQuickTagInput('');
                        }}
                      >
                        贴标
                      </button>
                    </div>
                  </div>

                  {/* 随手备注 */}
                  <input
                    type="text"
                    value={selectedPlayer.notes}
                    placeholder={`随手给 ${selectedPlayer.seat}号 记备注（发言、警徽流、疑点…）`}
                    onChange={(e) => update((g) => {
                      const pl = g.players.find((x) => x.id === selectedPlayer.id);
                      if (pl) pl.notes = e.target.value;
                    }, false)}
                  />
                </div>
              )}
            </section>

            {/* 中栏：夜晚引导台 或 白天引导台 */}
            {game.phase === 'night' ? (
              <NightGuidePanel
                game={game}
                update={update}
                onOpenEventModal={(init) => setEventModalData(init)}
              />
            ) : (
              <DayGuidePanel
                game={game}
                update={update}
                selectedPlayerId={selectedSeatId}
                onOpenEventModal={(init) => setEventModalData(init)}
              />
            )}

            {/* 右栏：实时事件流与一键事后标注 */}
            <section className="panel">
              <div className="panel-head">
                <h3>📝 事件记录与标注（{game.events.length}）</h3>
                <button
                  type="button"
                  className="btn btn-xs btn-outline"
                  onClick={() => setEventModalData({ roundNumber: game.roundNumber, phase: game.phase })}
                >
                  + 新增
                </button>
              </div>

              <div className="feed-list">
                {game.events.length === 0 ? (
                  <div className="empty">
                    还没有事件记录。<br />可在中间面板按流程结算，或点任意座位快速记一笔！
                  </div>
                ) : (
                  [...game.events].reverse().map((ev) => {
                    const meta = EVENT_TYPES[ev.type] || EVENT_TYPES.note;
                    return (
                      <div key={ev.id} className="feed-item">
                        <div className="feed-item-top">
                          <span className={`phase-chip ${ev.phase === 'night' ? 'chip-night' : 'chip-day'}`}>
                            第{ev.roundNumber}{ev.phase === 'night' ? '夜' : '天'}
                          </span>
                          <span className="feed-type">{meta.icon} {meta.label}</span>
                          <div className="feed-btns">
                            <button
                              type="button"
                              className="btn-link"
                              onClick={() => setEventModalData(ev)}
                              title="编辑或添加事后标注"
                            >
                              ✏️ 标注
                            </button>
                            <button
                              type="button"
                              className="btn-link danger-link"
                              onClick={() => handleDeleteEvent(ev.id)}
                              title="删除此条记录"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>

                        {(ev.actorId || ev.targetId) && (
                          <div className="feed-players">
                            {ev.actorId && <span className="fp-badge">{pShort(ev.actorId)}</span>}
                            {ev.actorId && ev.targetId && <span className="fp-arrow">→</span>}
                            {ev.targetId && <span className="fp-badge fp-target">{pShort(ev.targetId)}</span>}
                            {ev.result && (
                              <span className={`ev-result ${ev.result === 'wolf' ? 'bad' : 'good'}`}>
                                {ev.result === 'wolf' ? '查杀' : '金水'}
                              </span>
                            )}
                          </div>
                        )}

                        {ev.text && <div className="feed-desc">{ev.text}</div>}

                        {ev.tags?.length > 0 && (
                          <div className="feed-tags">
                            {ev.tags.map((tg, i) => (
                              <span key={i} className="tag tag-note">{tg}</span>
                            ))}
                          </div>
                        )}

                        {ev.annotation && (
                          <div className="ev-anno-box" onClick={() => setEventModalData(ev)}>
                            📌 <strong>法官标注：</strong>{ev.annotation}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        )}

        {/* ==================== 页签 2：全局时间线与复盘批注 ==================== */}
        {tab === 'timeline' && (
          <div className="timeline-layout">
            <section className="panel">
              <div className="panel-head">
                <h3>📜 全局时间线（点击任意记录可随时补充标注/修改）</h3>
                <div className="tl-filters">
                  <select className="select-sm" value={tlTypeFilter} onChange={(e) => setTlTypeFilter(e.target.value)}>
                    <option value="all">全部事件类型</option>
                    {Object.entries(EVENT_TYPES).map(([k, v]) => (
                      <option key={k} value={k}>{v.icon} {v.label}</option>
                    ))}
                  </select>

                  <select className="select-sm" value={tlPlayerFilter} onChange={(e) => setTlPlayerFilter(e.target.value)}>
                    <option value="all">全部座位玩家</option>
                    {game.players.map((p) => (
                      <option key={p.id} value={p.id}>{p.seat}号 · {roleName(p.role)}</option>
                    ))}
                  </select>

                  <label className="checkbox-inline" style={{ margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={tlOnlyAnnotated}
                      onChange={(e) => setTlOnlyAnnotated(e.target.checked)}
                    />
                    <span>只看已标注</span>
                  </label>

                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => setEventModalData({ roundNumber: game.roundNumber, phase: game.phase })}
                  >
                    + 补记一条事件
                  </button>
                </div>
              </div>

              {groupedTimeline.length === 0 ? (
                <div className="empty">当前筛选条件下暂无事件记录</div>
              ) : (
                groupedTimeline.map((grp) => (
                  <div key={grp.key} className="tl-round">
                    <div className="tl-round-head">
                      <span className={`tl-badge ${grp.phase === 'night' ? 'tl-night' : 'tl-day'}`}>
                        {grp.phase === 'night' ? `🌙 第 ${grp.roundNumber} 夜` : `☀️ 第 ${grp.roundNumber} 天`}
                      </span>
                    </div>
                    <div className="tl-events">
                      {grp.items.map((ev) => {
                        const meta = EVENT_TYPES[ev.type] || EVENT_TYPES.note;
                        return (
                          <div key={ev.id} className="tl-card">
                            <div className="tl-card-row">
                              <span className="tl-icon">{meta.icon}</span>
                              <strong className="tl-label">{meta.label}</strong>
                              {ev.actorId && <span className="fp-badge">{pShort(ev.actorId)}</span>}
                              {ev.actorId && ev.targetId && <span className="fp-arrow">→</span>}
                              {ev.targetId && <span className="fp-badge fp-target">{pShort(ev.targetId)}</span>}
                              {ev.tags?.map((tg, i) => <span key={i} className="tag tag-note">{tg}</span>)}
                              <span className="tl-text">{ev.text}</span>
                              <div className="tl-card-actions">
                                <button type="button" className="btn btn-xs" onClick={() => setEventModalData(ev)}>
                                  ✏️ {ev.annotation ? '修改标注' : '添加标注'}
                                </button>
                                <button type="button" className="btn btn-xs btn-ghost" onClick={() => handleDeleteEvent(ev.id)}>
                                  🗑️
                                </button>
                              </div>
                            </div>
                            {ev.annotation && (
                              <div className="ev-anno-box">
                                📌 <strong>法官标注：</strong>{ev.annotation}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </section>

            <section className="panel">
              <div className="panel-head">
                <h3>🏆 对局结局与整局复盘总评</h3>
              </div>
              <label className="field">
                <span>对局胜负结果</span>
                <select
                  value={game.winner || 'ongoing'}
                  onChange={(e) => update((g) => { g.winner = e.target.value; })}
                >
                  <option value="ongoing">⏳ 对局进行中</option>
                  <option value="good">🎉 好人阵营获胜</option>
                  <option value="wolf">🐺 狼人阵营获胜</option>
                  <option value="third">💘 第三方（情侣等）获胜</option>
                </select>
              </label>

              <label className="field">
                <span>📌 法官整局复盘总结（MVP、关键轮次失误、名场面记录）</span>
                <textarea
                  className="textarea"
                  style={{ minHeight: 150 }}
                  value={game.gameNotes || ''}
                  placeholder="例：本局 MVP 5号女巫，第2夜盲毒悍跳狼追回轮次；败方背锅 2号倒钩狼第3天冲票暴露…"
                  onChange={(e) => update((g) => { g.gameNotes = e.target.value; }, false)}
                />
              </label>

              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={() => setReportOpen(true)}
              >
                📋 生成复盘文字战报（一键复制发群）
              </button>
            </section>
          </div>
        )}

        {/* ==================== 页签 3：身份发牌与备注墙 ==================== */}
        {tab === 'roles' && (
          <section className="panel">
            <div className="panel-head">
              <h3>🎭 全场身份发牌、修改与独立备注墙</h3>
              <div className="export-row">
                <button type="button" className="btn btn-sm btn-primary" onClick={() => setDealModalOpen(true)}>
                  📱 打开传阅看牌器
                </button>
                <button type="button" className="btn btn-sm btn-outline" onClick={() => setHideSecrets((v) => !v)}>
                  {hideSecrets ? '👁️ 显示全部真实身份' : '🙈 隐藏真实身份（可投屏给玩家看）'}
                </button>
              </div>
            </div>

            <div className="cards-grid">
              {game.players.map((p) => (
                <div
                  key={p.id}
                  className={`role-card ${p.alive ? '' : 'role-card-dead'}`}
                  style={{ '--role-color': hideSecrets ? '#64748b' : roleColor(p.role) }}
                >
                  <div className="rc-head">
                    <span className="rc-seat">
                      {p.seat}号 {p.isSheriff && '🎖️'}
                    </span>
                    <span className="rc-alive">
                      {p.alive ? '🟢 存活' : `🔴 ${DEATH_REASON_LABELS[p.deathReason] || '出局'}`}
                    </span>
                  </div>

                  <input
                    type="text"
                    className="rc-name-input"
                    value={p.name || ''}
                    placeholder="填写玩家名字…"
                    onChange={(e) => update((g) => {
                      const pl = g.players.find((x) => x.id === p.id);
                      if (pl) pl.name = e.target.value;
                    }, false)}
                  />

                  {hideSecrets ? (
                    <div className="rc-hidden-role">❓ 身份已隐藏</div>
                  ) : (
                    <select
                      className="rc-role-select"
                      value={p.role}
                      onChange={(e) => update((g) => {
                        const pl = g.players.find((x) => x.id === p.id);
                        if (pl) pl.role = e.target.value;
                      })}
                    >
                      {ROLE_KEYS.map((rk) => (
                        <option key={rk} value={rk}>{ROLES[rk].name}</option>
                      ))}
                    </select>
                  )}

                  {p.tags.length > 0 && (
                    <div className="rc-tags">
                      {p.tags.map((t) => (
                        <span key={t.id} className="sc-tag-mini" style={{ borderColor: t.color, color: t.color }}>
                          {t.label}
                        </span>
                      ))}
                    </div>
                  )}

                  <textarea
                    className="rc-notes"
                    value={p.notes}
                    placeholder="该座位发言、站边、复盘标注…"
                    onChange={(e) => update((g) => {
                      const pl = g.players.find((x) => x.id === p.id);
                      if (pl) pl.notes = e.target.value;
                    }, false)}
                  />

                  <button
                    type="button"
                    className="btn btn-xs btn-ghost btn-block"
                    style={{ marginTop: 6 }}
                    onClick={() => setDetailPlayerId(p.id)}
                  >
                    📄 打开档案与标签管理
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ==================== 页签 4：房规设置与导出备份 ==================== */}
        {tab === 'settings' && (
          <section className="panel">
            <div className="panel-head"><h3>⚙️ 本局房规细节设置</h3></div>
            <div className="settings-list">
              <div className="setting-row">
                <div>
                  <div className="setting-label">女巫自救规则</div>
                  <div className="setting-desc">影响夜晚流程台在女巫中刀时的自救合法性提醒</div>
                </div>
                <select
                  className="select-sm"
                  value={game.settings.witchSelfSave}
                  onChange={(e) => update((g) => { g.settings.witchSelfSave = e.target.value; })}
                >
                  <option value="first">仅第一夜可自救（最常用）</option>
                  <option value="never">全程不可自救</option>
                  <option value="always">任意夜晚均可自救</option>
                </select>
              </div>

              {[
                ['sameGuardSameSaveDies', '同守同救触发「奶穿」死亡', '开启后，守卫与女巫同一晚作用于刀口则该玩家仍死亡'],
                ['witchSameNightBothPots', '允许女巫同一晚同时用解药和毒药', '绝大多数标准局禁止同夜双药'],
                ['hunterCanShootWhenPoisoned', '允许猎人被毒死时开枪', '标准规则下猎人被女巫毒死闷枪不可开枪'],
                ['singleBoomEatsBadge', '第一天单爆吞警徽', '警长竞选完之前有狼自爆则本局直接无警徽'],
                ['idiotCountsAsGod', '屠边计数时「白痴」算作神职', '关闭则白痴按平民阵营计入屠边条件'],
              ].map(([k, label, desc]) => (
                <label key={k} className="setting-row">
                  <div>
                    <div className="setting-label">{label}</div>
                    <div className="setting-desc">{desc}</div>
                  </div>
                  <input
                    type="checkbox"
                    className="switch"
                    checked={!!game.settings[k]}
                    onChange={() => update((g) => { g.settings[k] = !g.settings[k]; })}
                  />
                </label>
              ))}
            </div>

            <div className="panel-head" style={{ marginTop: 24 }}>
              <h3>💾 战报导出 / JSON 备份 / 重置</h3>
            </div>
            <div className="export-row">
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setReportOpen(true)}>
                📋 生成可复制文字战报
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(game, null, 2)], { type: 'application/json' });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = `狼人杀记录_${game.title || game.boardName}_${new Date().toISOString().slice(0, 10)}.json`;
                  a.click();
                }}
              >
                ⬇️ 导出本局 JSON 文件
              </button>
              <button
                type="button"
                className="btn btn-sm btn-warn"
                onClick={() => update((g) => {
                  g.events = [];
                  g.roundNumber = 1;
                  g.phase = 'night';
                  g.sheriffId = null;
                  g.badgeDestroyed = false;
                  g.guardLastTargetId = null;
                  g.witchState = { antidoteUsed: false, antidoteRound: null, antidoteTargetId: null, poisonUsed: false, poisonRound: null, poisonTargetId: null };
                  g.nightDraft = createEmptyNightDraft();
                  g.winner = 'ongoing';
                  g.players.forEach((p) => {
                    p.alive = true;
                    p.deathReason = null;
                    p.deadRound = null;
                    p.deadPhase = null;
                    p.isSheriff = false;
                    p.sheriffState = 'none';
                    p.idiotRevealed = false;
                    p.tags = [];
                    p.canShootStatus = canRoleShoot(p.role) ? 'yes' : 'na';
                  });
                })}
              >
                ♻️ 清空本局事件重开（保留座位身份）
              </button>
            </div>
          </section>
        )}
      </main>

      {/* 弹窗集合 */}
      <DealPassModal open={dealModalOpen} onClose={() => setDealModalOpen(false)} game={game} />

      <EventModal
        open={Boolean(eventModalData)}
        initialData={eventModalData}
        game={game}
        onClose={() => setEventModalData(null)}
        onSaveEvent={handleSaveEvent}
      />

      <PlayerDetailModal
        open={Boolean(detailPlayerId)}
        playerId={detailPlayerId}
        game={game}
        update={update}
        onClose={() => setDetailPlayerId(null)}
        onEditEvent={(ev) => setEventModalData(ev)}
      />

      <ReportModal open={reportOpen} onClose={() => setReportOpen(false)} game={game} />
    </div>
  );
}

// ===== 根组件 =====
export default function App() {
  const [games, setGames] = useState(loadGames);
  const [currentId, setCurrentId] = useState(loadCurrentId);
  const [view, setView] = useState(() => (loadCurrentId() ? 'game' : 'home'));
  const [autoOpenDeal, setAutoOpenDeal] = useState(false);
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [reportGame, setReportGame] = useState(null);
  const undoMapRef = useRef({}); // { [gameId]: [snapshotJson, ...] }
  const fileInputRef = useRef(null);

  const current = games.find((g) => g.id === currentId) || null;

  useEffect(() => { saveGames(games); }, [games]);
  useEffect(() => { saveCurrentId(currentId); }, [currentId]);

  const startNewGame = (g, openDealPass = false) => {
    setGames((prev) => [g, ...prev]);
    setCurrentId(g.id);
    setAutoOpenDeal(openDealPass);
    setView('game');
  };

  // 核心状态更新器（支持记录 Undo 快照）
  const updateCurrentGame = (mutatorFn, recordUndo = true) => {
    setGames((prev) =>
      prev.map((item) => {
        if (item.id !== currentId) return item;
        if (recordUndo) {
          const stack = undoMapRef.current[item.id] || [];
          stack.push(JSON.stringify(item));
          if (stack.length > 30) stack.shift();
          undoMapRef.current[item.id] = stack;
        }
        const clone = structuredClone(item);
        mutatorFn(clone);
        clone.updatedAt = Date.now();
        return clone;
      })
    );
  };

  const handleUndo = () => {
    if (!currentId) return;
    const stack = undoMapRef.current[currentId];
    if (!stack || stack.length === 0) return;
    const lastJson = stack.pop();
    const restored = JSON.parse(lastJson);
    setGames((prev) => prev.map((x) => (x.id === currentId ? restored : x)));
  };

  const canUndo = Boolean(currentId && undoMapRef.current[currentId]?.length > 0);

  const handleImportJson = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (parsed && Array.isArray(parsed.players)) {
          parsed.id = makeId('game');
          setGames((prev) => [parsed, ...prev]);
          setCurrentId(parsed.id);
          setView('game');
        }
      } catch {
        alert('导入失败：JSON 文件格式不正确');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const deleteGame = (id) => {
    setGames((prev) => prev.filter((x) => x.id !== id));
    if (currentId === id) {
      setCurrentId(null);
      setView('home');
    }
  };

  if (view === 'setup') {
    return (
      <SetupScreen
        onStart={startNewGame}
        onCancel={() => setView('home')}
      />
    );
  }

  if (view === 'game' && current) {
    return (
      <>
        <GameScreen
          game={current}
          update={updateCurrentGame}
          canUndo={canUndo}
          onUndo={handleUndo}
          onBack={() => setView('home')}
        />
        <DealPassModal
          open={autoOpenDeal}
          onClose={() => setAutoOpenDeal(false)}
          game={current}
        />
      </>
    );
  }

  // 首页：快速开局 + 历史对局复盘与事后标注库
  return (
    <div className="home">
      <div className="home-hero">
        <div className="hero-badge">法官防忘事工作台 · 离线持久化</div>
        <h1>🐺 狼人杀 · 法官控制台</h1>
        <p>一键 9 人局发身份 · 夜晚刀/守/救/毒/验自动结算 · 猎人开枪与突发情况记录 · 随时复盘标注</p>

        <div className="home-actions">
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => {
              const g = createGame({ boardId: 'b9_std' });
              startNewGame(g, false);
            }}
          >
            ⚡ 快速发牌：9人标准局（3狼预女猎3民）
          </button>

          <button type="button" className="btn btn-good btn-lg" onClick={() => setView('setup')}>
            🎴 选择板子 / 自定义发牌
          </button>
        </div>

        <div className="home-sub-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={handleImportJson}
          />
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => fileInputRef.current?.click()}>
            📂 导入 JSON 对局记录
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDeployModalOpen(true)}>
            🚀 Render / 网站部署说明
          </button>
        </div>
      </div>

      <div className="games-list">
        <div className="sec-head-inline">
          <h4>📚 历史对局记录（共 {games.length} 局，点击任意一局可继续主持或追加标注）</h4>
        </div>

        {games.length === 0 ? (
          <div className="empty">
            还没有对局记录。<br />点击上方「⚡ 快速发牌：9人标准局」或「🎴 选择板子 / 自定义发牌」立即开始！
          </div>
        ) : (
          games.map((g) => {
            const r = computeRound(g);
            const winBadge =
              g.winner === 'good' ? '🎉 好人胜' :
              g.winner === 'wolf' ? '🐺 狼人胜' :
              g.winner === 'third' ? '💘 三方胜' : '⏳ 进行中';
            return (
              <div key={g.id} className="game-card">
                <div className="gc-main" onClick={() => { setCurrentId(g.id); setView('game'); }}>
                  <div className="gc-head-row">
                    <span className="gc-name">{g.title || g.boardName}</span>
                    <span className={`gc-win gc-win-${g.winner || 'ongoing'}`}>{winBadge}</span>
                  </div>
                  <div className="gc-meta">
                    {g.players.length}人局 · 第{g.roundNumber}{g.phase === 'night' ? '夜' : '天'}
                    {' · '}存活：<span className="c-wolf">狼{r.wolf}</span> / <span className="c-god">神{r.god}</span> / <span className="c-vil">民{r.villager}</span>
                    {' · '}已记 <strong>{g.events.length}</strong> 条事件
                  </div>
                  {g.gameNotes && <div className="gc-note">📌 {g.gameNotes}</div>}
                </div>
                <div className="gc-btns">
                  <button type="button" className="btn btn-sm" onClick={() => setReportGame(g)}>战报</button>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => { setCurrentId(g.id); setView('game'); }}
                  >
                    进入/标注
                  </button>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => deleteGame(g.id)}>删除</button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <DeployGuideModal open={deployModalOpen} onClose={() => setDeployModalOpen(false)} />
      <ReportModal open={Boolean(reportGame)} onClose={() => setReportGame(null)} game={reportGame} />
    </div>
  );
}
