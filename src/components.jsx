import { useState, useEffect } from 'react';
import {
  ROLES, ROLE_KEYS, EVENT_TYPES, PRESET_PLAYER_TAGS, PRESET_EVENT_TAGS,
  DEATH_REASON_LABELS, roleName, roleShort, roleColor, isWolfRole,
  addPlayerTag, removePlayerTag, exportTextReport,
} from './gameModel';

// ===== 通用弹窗 =====
export function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="关闭">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// ===== 传手机防窥看牌器（给每个人发身份用） =====
export function DealPassModal({ open, onClose, game }) {
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (open) {
      setIdx(0);
      setRevealed(false);
    }
  }, [open]);

  if (!open || !game) return null;
  const p = game.players[idx];
  if (!p) return null;
  const role = ROLES[p.role] || ROLES.villager;
  const wolfTeammates = isWolfRole(p.role) && p.role !== 'hiddenWolf'
    ? game.players.filter((x) => x.id !== p.id && isWolfRole(x.role) && x.role !== 'hiddenWolf')
    : [];

  return (
    <Modal open={open} onClose={onClose} title="📱 传阅发牌器（防偷窥模式）">
      <div className="deal-box">
        <div className="deal-progress">
          正在发牌：{idx + 1} / {game.players.length}
        </div>
        <div className="deal-seat-badge">
          {p.seat}号 {p.name ? `· ${p.name}` : '玩家'}
        </div>

        {!revealed ? (
          <div className="deal-cover">
            <p className="deal-tip">请将屏幕递给 <strong>{p.seat}号{p.name ? `（${p.name}）` : ''}</strong> 本人确认周围无人偷看</p>
            <button type="button" className="btn btn-primary btn-lg" onClick={() => setRevealed(true)}>
              👁️ 点击翻看我的身份
            </button>
          </div>
        ) : (
          <div className="deal-reveal" style={{ '--role-color': role.color }}>
            <div className="deal-role-tag" style={{ background: role.color }}>{role.camp === 'wolf' ? '狼人阵营' : role.camp === 'third' ? '第三方阵营' : '好人阵营'}</div>
            <div className="deal-role-name" style={{ color: role.color }}>{role.name}</div>
            <p className="deal-role-desc">{role.desc}</p>
            {wolfTeammates.length > 0 && (
              <div className="deal-teammates">
                🐺 你的狼队友：{wolfTeammates.map((w) => `${w.seat}号${w.name ? `(${w.name})` : ''}`).join('、')}
              </div>
            )}
            <div className="deal-next-row">
              {idx < game.players.length - 1 ? (
                <button
                  type="button"
                  className="btn btn-primary btn-lg"
                  onClick={() => { setRevealed(false); setIdx(idx + 1); }}
                >
                  🙈 记住啦，隐藏身份并传给 {game.players[idx + 1].seat}号 →
                </button>
              ) : (
                <button type="button" className="btn btn-good btn-lg" onClick={onClose}>
                  ✅ 全部发牌完毕，进入第 1 夜主持！
                </button>
              )}
            </div>
          </div>
        )}

        <div className="deal-jump">
          <span>快速跳座位：</span>
          {game.players.map((pl, i) => (
            <button
              key={pl.id}
              type="button"
              className={`btn btn-xs ${i === idx ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { setRevealed(false); setIdx(i); }}
            >
              {pl.seat}号
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ===== 新增 / 编辑 / 事后标注 事件弹窗 =====
export function EventModal({ open, initialData, game, onClose, onSaveEvent }) {
  const isEdit = Boolean(initialData?.id);
  const [type, setType] = useState('night_kill');
  const [roundNumber, setRoundNumber] = useState(1);
  const [phase, setPhase] = useState('night');
  const [actorId, setActorId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [result, setResult] = useState('good');
  const [text, setText] = useState('');
  const [annotation, setAnnotation] = useState('');
  const [tags, setTags] = useState([]);
  const [customTag, setCustomTag] = useState('');
  const [applyStateChange, setApplyStateChange] = useState(true);

  useEffect(() => {
    if (!open || !game) return;
    if (initialData?.id) {
      setType(initialData.type || 'note');
      setRoundNumber(initialData.roundNumber || 1);
      setPhase(initialData.phase || 'night');
      setActorId(initialData.actorId || '');
      setTargetId(initialData.targetId || '');
      setResult(initialData.result || 'good');
      setText(initialData.text || '');
      setAnnotation(initialData.annotation || '');
      setTags(Array.isArray(initialData.tags) ? [...initialData.tags] : []);
      setApplyStateChange(false); // 编辑历史事件默认不重复改动生死状态
    } else {
      const initType = initialData?.type || (game.phase === 'night' ? 'night_kill' : 'day_vote_out');
      setType(initType);
      setRoundNumber(initialData?.roundNumber ?? game.roundNumber);
      setPhase(initialData?.phase ?? game.phase);
      setActorId(initialData?.actorId || '');
      setTargetId(initialData?.targetId || '');
      setResult(initialData?.result || 'good');
      setText(initialData?.text || '');
      setAnnotation(initialData?.annotation || '');
      setTags(Array.isArray(initialData?.tags) ? [...initialData.tags] : []);
      setApplyStateChange(true);
    }
    setCustomTag('');
  }, [open, initialData, game]);

  // 当选择查验目标时，自动帮法官算出真实好坏结果
  useEffect(() => {
    if (!isEdit && type === 'night_seer_check' && targetId && game) {
      const t = game.players.find((p) => p.id === targetId);
      if (t) {
        const showsWolf = isWolfRole(t.role) && t.role !== 'hiddenWolf';
        setResult(showsWolf ? 'wolf' : 'good');
      }
    }
  }, [type, targetId, isEdit, game]);

  if (!open || !game) return null;
  const meta = EVENT_TYPES[type] || EVENT_TYPES.note;

  const toggleTag = (t) => {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const addCustom = () => {
    const clean = customTag.trim();
    if (!clean) return;
    if (!tags.includes(clean)) setTags((prev) => [...prev, clean]);
    setCustomTag('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSaveEvent(
      {
        id: initialData?.id || null,
        type,
        roundNumber: Number(roundNumber) || 1,
        phase,
        actorId: actorId || null,
        targetId: targetId || null,
        result: type === 'night_seer_check' ? result : undefined,
        text: text.trim(),
        annotation: annotation.trim(),
        tags,
      },
      applyStateChange
    );
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? '✏️ 编辑记录与后续标注' : '➕ 记录事件 / 突发情况'} wide>
      <form className="form" onSubmit={handleSubmit}>
        <div className="field">
          <span>① 事件类型</span>
          <div className="type-grid">
            {Object.entries(EVENT_TYPES).map(([k, v]) => (
              <button
                key={k}
                type="button"
                className={`type-btn ${type === k ? 'type-btn-sel' : ''}`}
                onClick={() => setType(k)}
              >
                <span>{v.icon}</span>
                <span>{v.label}</span>
              </button>
            ))}
          </div>
          <div className="field-tip">{meta.desc}</div>
        </div>

        <div className="form-row-2">
          <label className="field">
            <span>所属回合（可补记任意回合）</span>
            <input
              type="number"
              min="1"
              max="30"
              value={roundNumber}
              onChange={(e) => setRoundNumber(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
          <label className="field">
            <span>阶段</span>
            <select value={phase} onChange={(e) => setPhase(e.target.value)}>
              <option value="night">🌙 夜晚（第{roundNumber}夜）</option>
              <option value="day">☀️ 白天（第{roundNumber}天）</option>
            </select>
          </label>
        </div>

        <div className="form-row-2">
          {meta.actorLabel !== null && (
            <label className="field">
              <span>{meta.actorLabel || '行动发起人（谁做的）'}</span>
              <select value={actorId} onChange={(e) => setActorId(e.target.value)}>
                <option value="">— 不指定 / 未知 —</option>
                {game.players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.seat}号{p.name ? `(${p.name})` : ''} · {roleName(p.role)}{p.alive ? '' : ' [已出局]'}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="field">
            <span>{meta.targetLabel || '目标对象（对谁做的）'}</span>
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">— 不指定 / 无目标 —</option>
              {game.players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.seat}号{p.name ? `(${p.name})` : ''} · {roleName(p.role)}{p.alive ? '' : ' [已出局]'}
                </option>
              ))}
            </select>
          </label>
        </div>

        {type === 'night_seer_check' && (
          <div className="field">
            <span>查验结果（已按目标真实身份自动匹配，可手动改）</span>
            <div className="radio-row">
              <button
                type="button"
                className={`radio ${result === 'good' ? 'radio-sel-good' : ''}`}
                onClick={() => setResult('good')}
              >
                👍 好人（金水）
              </button>
              <button
                type="button"
                className={`radio ${result === 'wolf' ? 'radio-sel-bad' : ''}`}
                onClick={() => setResult('wolf')}
              >
                👎 狼人（查杀）
              </button>
            </div>
          </div>
        )}

        <label className="field">
          <span>情况描述（如：谁拿刀堵了谁、具体票型 1,4,6→3号、猎人为何开枪等）</span>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="例：2号主刀5号，守卫守中5号堵刀成功 / 平票PK后 1,3,4,6 投出 7号"
          />
        </label>

        <label className="field anno-field">
          <span>📌 法官后续标注 / 复盘批注（随时可补写，时间线中醒目高亮）</span>
          <textarea
            className="textarea"
            value={annotation}
            onChange={(e) => setAnnotation(e.target.value)}
            placeholder="例：复盘看这里7号其实已经聊爆了，但好人分票导致抗推了真猎人…"
          />
        </label>

        <div className="field">
          <span>🏷️ 快捷标签（可多选，也可输入自定义标签）</span>
          <div className="tag-row">
            {PRESET_EVENT_TAGS.map((t) => (
              <button
                key={t}
                type="button"
                className={`tag-btn ${tags.includes(t) ? 'tag-btn-sel' : ''}`}
                onClick={() => toggleTag(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="custom-tag-row">
            <input
              type="text"
              value={customTag}
              onChange={(e) => setCustomTag(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
              placeholder="输入自定义标签后按添加…"
            />
            <button type="button" className="btn btn-sm" onClick={addCustom}>+ 添加标签</button>
          </div>
        </div>

        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={applyStateChange}
            onChange={(e) => setApplyStateChange(e.target.checked)}
          />
          <span>同步自动更新玩家生死/药水/警徽/标签状态（如果只是补记文字且不想改动当前存活状态，请取消勾选）</span>
        </label>

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>取消</button>
          <button type="submit" className="btn btn-primary">💾 保存记录与标注</button>
        </div>
      </form>
    </Modal>
  );
}

// ===== 单个玩家完整档案 + 身份修改 + 标签标注弹窗 =====
export function PlayerDetailModal({ open, playerId, game, update, onClose, onEditEvent }) {
  const [customTag, setCustomTag] = useState('');
  if (!open || !game || !playerId) return null;
  const p = game.players.find((x) => x.id === playerId);
  if (!p) return null;

  const relatedEvents = game.events.filter((e) => e.actorId === p.id || e.targetId === p.id);
  const pLabel = (id) => {
    const x = game.players.find((pl) => pl.id === id);
    return x ? `${x.seat}号(${roleShort(x.role)})` : '';
  };

  const handleAddCustomTag = () => {
    const clean = customTag.trim();
    if (!clean) return;
    update((g) => {
      const target = g.players.find((x) => x.id === p.id);
      if (target) addPlayerTag(target, clean, '#3b82f6');
    });
    setCustomTag('');
  };

  return (
    <Modal open={open} onClose={onClose} title={`📄 ${p.seat}号${p.name ? `（${p.name}）` : ''} · 玩家档案与标注`} wide>
      <div className="detail">
        <div className="detail-top-grid">
          <label className="field">
            <span>玩家昵称 / 姓名备注</span>
            <input
              type="text"
              value={p.name || ''}
              placeholder="如：小明 / 戴眼镜男生"
              onChange={(e) => update((g) => {
                const target = g.players.find((x) => x.id === p.id);
                if (target) target.name = e.target.value;
              })}
            />
          </label>

          <label className="field">
            <span>真实身份（线下发实体牌可在此录入/修改）</span>
            <select
              value={p.role}
              onChange={(e) => update((g) => {
                const target = g.players.find((x) => x.id === p.id);
                if (target) {
                  target.role = e.target.value;
                  if (target.role === 'hunter' || target.role === 'wolfKing') {
                    target.canShootStatus = target.deathReason === 'poison' ? 'blocked' : 'yes';
                  } else {
                    target.canShootStatus = 'na';
                  }
                }
              })}
            >
              {ROLE_KEYS.map((rk) => (
                <option key={rk} value={rk}>{ROLES[rk].name}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>当前存活状态</span>
            <select
              value={p.alive ? 'alive' : (p.deathReason || 'manual')}
              onChange={(e) => update((g) => {
                const target = g.players.find((x) => x.id === p.id);
                if (!target) return;
                if (e.target.value === 'alive') {
                  target.alive = true;
                  target.deathReason = null;
                  target.deadRound = null;
                  target.deadPhase = null;
                } else {
                  target.alive = false;
                  target.deathReason = e.target.value;
                  target.deadRound = target.deadRound || g.roundNumber;
                  target.deadPhase = target.deadPhase || g.phase;
                }
              })}
            >
              <option value="alive">🟢 存活在场</option>
              {Object.entries(DEATH_REASON_LABELS).map(([k, label]) => (
                <option key={k} value={k}>🔴 出局：{label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="field">
          <span>🏷️ 座位状态与复盘标签（点击即贴上/撕下）</span>
          <div className="tag-row" style={{ marginBottom: 8 }}>
            {PRESET_PLAYER_TAGS.map((pt) => {
              const existing = p.tags.find((t) => t.label === pt.label);
              return (
                <button
                  key={pt.label}
                  type="button"
                  className={`tag-btn ${existing ? 'tag-btn-sel' : ''}`}
                  style={existing ? { borderColor: pt.color, background: `${pt.color}28`, color: '#fff' } : undefined}
                  onClick={() => update((g) => {
                    const target = g.players.find((x) => x.id === p.id);
                    if (!target) return;
                    const ex = target.tags.find((t) => t.label === pt.label);
                    if (ex) removePlayerTag(target, ex.id);
                    else addPlayerTag(target, pt.label, pt.color);
                  })}
                >
                  {existing ? '✓ ' : '+ '}{pt.label}
                </button>
              );
            })}
          </div>
          {p.tags.length > 0 && (
            <div className="active-tags-bar">
              <span>当前已贴：</span>
              {p.tags.map((t) => (
                <span key={t.id} className="pill-tag" style={{ borderColor: t.color, background: `${t.color}26` }}>
                  {t.label}
                  <button
                    type="button"
                    onClick={() => update((g) => {
                      const target = g.players.find((x) => x.id === p.id);
                      if (target) removePlayerTag(target, t.id);
                    })}
                  >×</button>
                </span>
              ))}
            </div>
          )}
          <div className="custom-tag-row">
            <input
              type="text"
              value={customTag}
              placeholder="输入任意自定义标签（如：首夜被骗药、悍跳发3查杀）…"
              onChange={(e) => setCustomTag(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomTag(); } }}
            />
            <button type="button" className="btn btn-sm" onClick={handleAddCustomTag}>贴上标签</button>
          </div>
        </div>

        <label className="field">
          <span>📝 该玩家专属备注（发言记录、警徽流、逻辑疑点、复盘评价）</span>
          <textarea
            className="textarea"
            value={p.notes}
            placeholder="例：第1天警上起跳预言家，报4金水，警徽流留7、9；第2天被真预查杀后自爆…"
            onChange={(e) => update((g) => {
              const target = g.players.find((x) => x.id === p.id);
              if (target) target.notes = e.target.value;
            })}
          />
        </label>

        <div className="detail-events-box">
          <h5>📜 与 {p.seat}号 相关的全部事件（{relatedEvents.length} 条，点击可追加标注）</h5>
          {relatedEvents.length === 0 ? (
            <div className="empty-sm">暂无与该座位直接关联的事件记录</div>
          ) : (
            relatedEvents.map((ev) => {
              const meta = EVENT_TYPES[ev.type] || EVENT_TYPES.note;
              return (
                <div key={ev.id} className="mini-ev-card" onClick={() => { onClose(); onEditEvent(ev); }}>
                  <div className="mini-ev-main">
                    <span className="tl-phase-pill">第{ev.roundNumber}{ev.phase === 'night' ? '夜' : '天'}</span>
                    <span>{meta.icon} <strong>{meta.label}</strong></span>
                    {ev.actorId && <span>{pLabel(ev.actorId)}</span>}
                    {ev.targetId && <span>→ {pLabel(ev.targetId)}</span>}
                    {ev.text && <span className="muted">「{ev.text}」</span>}
                    <span className="edit-link">✏️ 标注</span>
                  </div>
                  {ev.annotation && <div className="ev-anno-box">📌 {ev.annotation}</div>}
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
}

// ===== 战报复制 & Render/静态平台部署指南弹窗 =====
export function ReportModal({ open, onClose, game }) {
  const [copied, setCopied] = useState(false);
  if (!open || !game) return null;
  const reportText = exportTextReport(game);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="📋 对局复盘文字战报（可直接发群）" wide>
      <p className="field-tip" style={{ marginTop: 0 }}>已汇总全场身份、出局原因、每一夜刀/救/毒/验详情及所有法官后续标注：</p>
      <textarea className="textarea report-box" readOnly value={reportText} />
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>关闭</button>
        <button type="button" className="btn btn-primary" onClick={copy}>
          {copied ? '✅ 已复制到剪贴板！' : '📋 一键复制全文'}
        </button>
      </div>
    </Modal>
  );
}

export function DeployGuideModal({ open, onClose }) {
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title="🚀 部署到 Render / Vercel / Cloudflare 指南" wide>
      <div className="deploy-guide">
        <div className="deploy-block">
          <h4>方案一：部署到 Render（推荐 Static Site，完全免费且永不休眠！）</h4>
          <p>本项目是纯前端单页应用（数据自动持久保存在法官设备的浏览器本地存储，还支持导出 JSON 备份），在 Render 上使用 <strong>Static Site</strong> 部署不仅 <strong>$0 免费</strong>，而且<strong>不会像免费 Node 实例那样 15 分钟休眠卡顿</strong>，面杀现场秒开！</p>
          <ol>
            <li>将本项目文件夹（<code>judge-console</code>）上传到你的 GitHub 仓库。</li>
            <li>登录 <a href="https://dashboard.render.com" target="_blank" rel="noreferrer">Render Dashboard</a>，点击右上角 <strong>New +</strong> → 选择 <strong>Blueprint</strong>（自动识别项目内置的 <code>render.yaml</code>），或直接选 <strong>Static Site</strong>。</li>
            <li>若手动选 <strong>Static Site</strong>，只需填两行配置：
              <ul>
                <li><strong>Build Command</strong>：<code>npm install && npm run build</code></li>
                <li><strong>Publish Directory</strong>：<code>dist</code></li>
              </ul>
            </li>
            <li>点击 <strong>Create Static Site</strong>，约 30 秒构建完成，即可获得永久 HTTPS 网址（如 <code>https://werewolf-judge.onrender.com</code>），手机/平板/电脑打开即用！</li>
          </ol>
        </div>

        <div className="deploy-block">
          <h4>方案二：部署到 Vercel / Netlify / Cloudflare Pages</h4>
          <ul>
            <li>项目内已预置 <code>vercel.json</code>、<code>public/_redirects</code> 与 <code>public/404.html</code>。</li>
            <li>导入 GitHub 仓库后，Framework 选 <strong>Vite</strong>，Build Command 填 <code>npm run build</code>，Output Directory 填 <code>dist</code>，一键上线。</li>
          </ul>
        </div>
      </div>
    </Modal>
  );
}
