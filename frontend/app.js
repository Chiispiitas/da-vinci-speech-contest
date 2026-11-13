/* Static GitHub Pages client. All contest writes go through the separate server. */
'use strict';
const role = document.body.dataset.role;
const params = new URLSearchParams(location.search);
const app = document.querySelector('#app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const readLocal = (key, fallback = '') => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };
const saveLocal = (key, value) => { try { localStorage.setItem(key, value); } catch { /* Private mode still works for the current visit. */ } };
let apiBase = (params.get('server') || window.CONTEST_CONFIG?.apiBase || readLocal('davinci-server')).replace(/\/$/, '');
let code = (params.get('code') || readLocal('davinci-code')).toUpperCase();
let judgeId = params.has('judge') ? params.get('judge') : readLocal('davinci-judge');
let judgeTurnId=params.get('turn')||'';
let state, tab = 'control', selectedDivision = 'A', draft, busy = false, failures = 0, editing = false;
let serverEpoch = Date.now(), serverPerf = performance.now(), displayedCue = '', lastRendered = -1, displayedSettings = '';
let pending = null;
const scenes = {standby:'Standby', introduction:'Division introduction', participants:'Participants', participant_wheel:'Participant wheel', topic_wheel:'Topic wheel', contestant:'Current contestant', participant_draw:'Participant reveal', topic_draw:'Topic reveal', preparation:'Preparation timer', speech:'Speech timer', announcement:'Announcement', leaderboard:'Published leaderboard', awards:'Awards', closing:'Closing'};
const sceneNames={...scenes,participant_wheel:'Participant wheel',topic_wheel:'Topic wheel'};
const now = () => (serverEpoch + performance.now() - serverPerf) / 1000;
const active = () => state?.turns?.find(t => t.id === state.active);
const panel = division => state.judges.filter(j => j.divisions.includes(division));
const participant = t => state.divisions[t.division].participants.find(p => p.id === t.participantId);
const remaining = timer => timer.running ? timer.endsAt - now() : timer.remaining;
const timerText = value => {
  const seconds = Math.ceil(Math.abs(value));
  return `${value < 0 ? '+' : ''}${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
const button = (text, action, data = {}, classes = '', disabled = false) => `<button class="${classes}" data-action="${action}" ${Object.entries(data).map(([k,v]) => `data-${k}="${esc(v)}"`).join(' ')} ${disabled ? 'disabled' : ''}>${text}</button>`;
const link = (target, extra = {}) => {
  const p = new URLSearchParams({code, ...extra});
  if (apiBase && apiBase !== window.CONTEST_CONFIG?.apiBase) p.set('server', apiBase);
  return `${target}.html?${p}`;
};
const phaseClock = timer => `<div class="timer" data-clock-turn="${esc(state?.current?.id || state?.active || '')}" data-timer="${esc(JSON.stringify(timer))}">${timerText(remaining(timer))}</div>`;
function toast(message, error = false) {
  document.querySelector('.toast')?.remove();
  const node = document.createElement('div');
  node.className = `toast ${error ? 'error' : ''}`;
  node.setAttribute('role', error ? 'alert' : 'status');
  node.textContent = message;
  document.body.append(node);
  setTimeout(() => node.remove(), error ? 10000 : 4500);
}
function connection() {
  const n = document.querySelector('#connection');
  if (n) { n.className = `connection ${failures ? 'offline' : ''}`; n.innerHTML = `<i class="dot"></i>${failures ? 'Reconnecting…' : 'Connected'}`; }
  if (role === 'audience') {
    let badge = document.querySelector('.audience-status');
    if (failures >= 3 && !badge) { badge = document.createElement('div'); badge.className = 'audience-status'; badge.textContent = 'Connection lost · showing last saved scene'; document.body.append(badge); }
    if (!failures) badge?.remove();
  }
}
async function request(path, options) {
  const start = Date.now();
  const response = await fetch(`${apiBase}/api/${path}`, {cache:'no-store', signal:AbortSignal.timeout(10000), ...options});
  if(response.status===429){const error=new Error('The server is busy. This screen will reconnect automatically; submitted saves can be retried safely.');error.status=429;throw error;}
  let data;
  try { data = await response.json(); } catch { throw new Error('The contest server is not configured here. Enter its public address in Connection settings.'); }
  if (!response.ok) { const error = new Error(data.error || `Server error ${response.status}`); error.status = response.status; throw error; }
  if (data.serverNow) { serverEpoch = data.serverNow * 1000 + (Date.now() - start) / 2; serverPerf = performance.now(); }
  failures = 0; connection();
  return data;
}
function accept(data) {
  if (state && data.revision < state.revision) return;
  const turnChanged = (state?.current?.id || state?.active) !== (data.current?.id || data.active);
  if(state&&state.generation!==data.generation){draft=null;editing=false;}
  if(data.current?.myScore&&!state?.current?.myScore)editing=false;
  state = data;
  if (turnChanged && role === 'judge') editing = false;
  if (role === 'admin') selectedDivision = state.division;
  document.documentElement.style.setProperty('--brand', state.settings.accent);
  document.documentElement.style.setProperty('--gold', state.settings.highlight);
  if (!draft && role === 'admin') {
    try { draft = JSON.parse(readLocal(`davinci-draft-${state.generation}`)); } catch { /* Use a fresh draft. */ }
    draft ||= {scene:'standby', division:selectedDivision, message:''};
  }
}
function persistPending(value) {
  pending = value;
  saveLocal(`davinci-pending-${role}-${code}`, value ? JSON.stringify(value) : '');
}
async function sendPending() {
  if (!pending || busy) return;
  busy = true;
  document.querySelectorAll('button[data-action],button[type=submit]').forEach(b => b.disabled = true);
  try {
    const savedAction=pending.action;
    const data = await request(`command?code=${encodeURIComponent(code)}`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(pending)});
    persistPending(null); accept(data);
    if(['undo_participant','undo_topic','undo_complete','select_participant'].includes(savedAction)){draft={scene:'contestant',division:selectedDivision,message:'',followLive:true};saveLocal(`davinci-draft-${state.generation}`,JSON.stringify(draft));}
    if(['draw_participant','draw_topic'].includes(savedAction)){draft={scene:savedAction==='draw_participant'?'participant_wheel':'topic_wheel',division:selectedDivision,message:'',followLive:false};saveLocal(`davinci-draft-${state.generation}`,JSON.stringify(draft));}
    if(savedAction==='take_live'&&state.live?.wheel){draft={scene:'contestant',division:selectedDivision,message:'',followLive:true};saveLocal(`davinci-draft-${state.generation}`,JSON.stringify(draft));}
    if(savedAction==='score')judgeTurnId='';
    editing = false; render(true); toast('Saved to the event.');
  } catch (e) {
    if (e.status && e.status!==429 && e.status<500) { persistPending(null); editing = false; await refresh(true); }
    else { failures++; connection(); render(true); }
    toast(e.status && e.status!==429 && e.status<500 ? e.message : 'The save could not be confirmed. Use “Retry save” to safely retry the same action.', true);
  } finally { busy = false; render(true); }
}
async function mutate(action, data = {}) {
  if (pending) return toast('Resolve the pending save with “Retry save” first.', true);
  if (busy || !state) return;
  if (failures) return toast('Wait for the server connection before making changes.', true);
  persistPending({requestId:crypto.randomUUID(), generation:state.generation, revision:state.revision, action, data});
  await sendPending();
}
let refreshing = false;
async function refresh(force = false) {
  if (refreshing || !code || role === 'home') return;
  refreshing = true;
  try {
    const data = await request(`${role}?code=${encodeURIComponent(code)}${role === 'judge' ? `&judge=${encodeURIComponent(judgeId)}${judgeTurnId?'&turn='+encodeURIComponent(judgeTurnId):''}` : ''}`);
    accept(data); render(force);
  } catch (e) {
    failures++; connection();
    if (!state) showConnection(e.message);
  } finally { refreshing = false; }
}
function header() {
  return `<header class="header"><div class="brand"><a href="index.html"><img src="${esc(state?.settings?.logo || 'assets/logo-blue.svg')}" alt="Unidad Educativa Leonardo Da Vinci"></a><span>IMPROMPTU SPEECH CONTEST<br><strong>${esc({admin:'Contest control',judge:'Judging panel',emcee:'Emcee desk',audience:'Audience display',home:'Manta, Ecuador'}[role])}</strong></span></div>${role==='home'?'':`<div id="connection" class="connection"><i class="dot"></i>${state ? 'Connected' : 'Not connected'}</div>`}</header>`;
}
function pendingNotice() {
  return pending ? `<div class="notice error">A save is waiting for confirmation. ${button('Retry save','retry')}</div>` : '';
}
function shell(content) {
  if (role === 'admin') {
    app.innerHTML = `${header()}<div class="layout"><nav class="sidebar" aria-label="Admin pages"><div class="side-label">THE EVENT</div>${[['control','Contest control'],['setup','Participants & topics'],['judges','Judging panel'],['program','Program flow'],['results','Scores & awards'],['settings','Settings']].map(([key,name]) => button(name,'tab',{tab:key},tab === key ? 'selected' : '')).join('')}<div class="side-label">CONNECTED SCREENS</div><a class="button" href="${link('audience')}" target="_blank" rel="noopener">Audience screen ↗</a><a class="button" href="${link('emcee')}" target="_blank" rel="noopener">Emcee desk ↗</a><a class="button" href="${link('judge')}" target="_blank" rel="noopener">Judges ↗</a></nav><main class="content">${pendingNotice()}${content}</main></div>`;
  } else app.innerHTML = `${header()}<main class="${role === 'judge' ? 'judge-wrap' : 'emcee-wrap'}">${pendingNotice()}${content}</main>`;
  connection(); tick();
}
function title(name, description='') {
  return `<div class="title-row"><div><div class="eyebrow">${esc(state.settings.title)}</div><h1>${name}</h1>${description?`<p class="muted">${description}</p>`:''}</div><div class="session-tag">EVENT SESSION<b>${esc(code)}</b></div></div>`;
}
function divisionTabs() {
  return `<div class="division-tabs" aria-label="Divisions">${Object.entries(state.divisions).map(([key,d]) => button(`Division ${key}<small>${esc(d.label)}</small>`,'division',{division:key},selectedDivision === key ? 'selected' : '',!!active() || busy)).join('')}</div>`;
}
function control() {
  const d = state.divisions[selectedDivision], t = active();
  const completed = state.turns.filter(x => x.division === selectedDivision && x.status === 'complete').length;
  const p = t && participant(t);
  const ready = d.confirmed && completed < d.participants.length;
  const lastComplete=[...state.turns].reverse().find(row=>row.division===selectedDivision&&row.status==='complete');
  const wheelBusy=!!state.live?.wheel&&now()<state.live.wheel.finishAt;
  const missing=state.turns.filter(x=>x.division===selectedDivision&&x.status==='complete'&&x.panel.some(id=>!Object.hasOwn(x.scores,id))).length;
  return `${title('Contest control')}${divisionTabs()}
    ${!d.confirmed ? `<div class="notice">Review participant names and the judging panel before the first draw. ${button('Review setup','tab',{tab:'setup'})}</div>` : ''}${missing?`<div class="notice">${missing} completed speech${missing===1?' is':'es are'} still awaiting judge scores. You can continue drawing participants.</div>`:''}
    <section class="card"><h2>Contestant controls</h2><form id="contestant-form"><label>Choose current contestant<select name="participantId">${d.participants.map(row=>{const attempt=state.turns.find(x=>x.participantId===row.id&&x.status!=='cancelled');return `<option value="${esc(row.id)}" ${t?.participantId===row.id?'selected':''}>${esc(row.name)} · ${attempt?.status||'Not drawn'}</option>`;}).join('')}</select></label><button type="submit" ${d.published?'disabled':''}>Change contestant</button></form><div class="row" style="margin-top:14px">${button('Undo participant draw','undo-participant',{},'danger',!t||!!d.published)}${button('Undo topic draw','undo-topic',{},'',!t?.topic||!!d.published)}${button('Undo last completion','undo-complete',{turn:lastComplete?.id||''},'',!lastComplete||!!d.published)}</div><p class="smalltext muted" style="margin:12px 0 0">Switching preserves each contestant’s topic and scores. Undoing a participant draw retains the cancelled attempt in history.</p></section><div class="grid"><div><section class="card"><div class="card-head"><h2>On the floor</h2><span class="chip">${completed} / ${d.participants.length} completed</span></div>
      ${t ? `<div class="eyebrow">DIVISION ${t.division} · ${esc(p.group)}</div><div class="hero-name">${esc(p.name)}</div><small>${esc(p.fullName)}</small>
      <hr class="sep">${t.topic ? `<div class="eyebrow">DRAWN TOPIC</div><p class="topic">${esc(t.topic.text)}</p>` : `<p class="muted">The participant is drawn. Select their topic next.</p>${button('Draw topic','draw-topic',{'wheel-wait':'true'},'primary',wheelBusy)}`}` : `<div class="empty"><span class="symbol">◎</span>${completed === d.participants.length ? 'All speeches in this division are complete.' : 'Ready for the next participant.'}</div>${button('Draw participant','draw-participant',{},'primary',!ready)}`}
    </section>${t ? `<section class="card"><div class="card-head"><h2>Contest timer</h2><span class="chip">${esc(t.timer.phase)}</span></div><div class="row">${button('Preparation','phase',{phase:'preparation'},t.timer.phase === 'preparation' ? 'selected' : '',t.timer.running || !t.topic)}${button('Speech','phase',{phase:'speech'},t.timer.phase === 'speech' ? 'selected' : '',t.timer.running || !t.topic)}</div><div class="timer-box"><div>${phaseClock(t.timer)}<div class="timer-label">${t.timer.phase === 'speech' ? 'Green at 2:00 elapsed · limit 3:00' : 'One minute to prepare'}</div></div><div class="timer-controls">${button(t.timer.running ? 'Pause' : 'Start','timer',{operation:t.timer.running ? 'pause' : 'start'},'primary',!t.topic)}${button('Reset','timer-reset',{},'',!t.topic)}</div></div><small>The timer continues on all connected screens. Expiry does not submit scores.</small></section>` : ''}
    <section class="card"><div class="card-head"><h2>Judging panel</h2><span class="chip">${t ? Object.keys(t.scores).length : 0} / ${t ? t.panel.length : panel(selectedDivision).length} submitted</span></div>${panel(selectedDivision).map(j => `<div class="row between" style="padding:10px 0"><span>${esc(j.name)}<br><small>${esc(j.description)}</small></span><span class="chip ${t?.scores[j.id] ? 'live' : ''}">${t?.scores[j.id] ? 'Submitted' : 'Waiting'}</span></div>`).join('')}${t ? `<hr class="sep"><p class="smalltext muted">Complete the speech and continue. Unfinished score sheets stay available to the judges.</p>${button('Complete participant','complete',{},'primary',!t.topic)}` : ''}</section></div>
    <div><section class="card"><div class="card-head"><h2>Scene preview</h2><span class="chip">${draft.followLive?'FOLLOWING LIVE':'PRIVATE PREVIEW'}</span></div><div id="preview" class="preview">${stage(previewCue(),true)}</div><p class="smalltext muted" style="margin-top:12px">Draws prepare a stationary wheel here. Take live starts its spin; the selected contestant appears automatically afterward.</p><label>Scene<select id="scene">${Object.entries(scenes).map(([k,v]) => `<option value="${k}" ${draft.scene===k?'selected':''}>${v}</option>`).join('')}</select></label><label>Message<textarea id="scene-message" maxlength="1000" placeholder="Optional announcement or closing message">${esc(draft.message)}</textarea></label><div class="row between"><span class="not-saved" id="draft-status">${draft.followLive?'Following automatic draw':'Draft only'}</span>${button('Take live →','take-live',{},'gold')}</div></section>
    <section class="card"><div class="card-head"><h2>Audience screens</h2><span class="chip live">${state.live ? 'SAVED LIVE SCENE' : 'STANDBY'}</span></div><p data-live-scene>${esc(state.live ? sceneNames[window.ContestWheel.resolve(state.live,now()).scene] : 'No scene taken live yet')}</p>${state.live ? `<small>Division ${esc(state.live.division)}</small>` : '<small>The school title appears until the first scene is taken live.</small>'}<hr class="sep"><a class="button" href="${link('audience')}" target="_blank" rel="noopener">Open audience screen ↗</a></section></div></div>`;
}
function previewCue() {
  if (!state || !draft) return null;
  if(draft.followLive)return state.live;
  if(['participant_wheel','topic_wheel'].includes(draft.scene)&&state.pendingWheel?.scene===draft.scene)return state.pendingWheel;
  const d = state.divisions[selectedDivision], t = active();
  const cue = {scene:draft.scene, division:selectedDivision, label:d.label, message:draft.message};
  if (draft.scene === 'introduction') Object.assign(cue,{emcee:d.emcee,judges:panel(selectedDivision).map(j=>j.name)});
  if (draft.scene === 'participants') cue.participants = d.participants;
  if (['contestant','participant_draw','topic_draw','preparation','speech'].includes(draft.scene) && t) {
    cue.participant = participant(t); cue.turnId = t.id;
    if (draft.scene !== 'participant_draw') cue.topic = t.topic?.text;
    if (['preparation','speech'].includes(draft.scene)) cue.timer = t.timer;
  }
  if (['leaderboard','awards'].includes(draft.scene)) cue.results = d.published?.rows?.filter(r=>draft.scene !== 'awards'||r.rank<=3);
  return cue;
}
function stage(cue, preview = false) {
  const settings = state?.settings || {title:'2nd Impromptu Speech Contest',stageLogo:'assets/logo-white.svg'};
  const c = window.ContestWheel.resolve(cue,now()) || {scene:'standby'};
  const kicker = c.division ? `Division ${c.division} · ${c.label}` : 'Unidad Educativa Leonardo Da Vinci';
  let content = '';
  if (c.scene === 'standby') content = `<h1>${esc(settings.title)}</h1><p class="stage-sub">Unidad Educativa Leonardo Da Vinci<br>Manta, Ecuador</p>`;
  if (c.scene === 'introduction') content = `<h1>Division ${esc(c.division)}</h1><h2>${esc(c.label)}</h2><p class="stage-sub">Master of Ceremony · ${esc(c.emcee)}<br>${(c.judges||[]).map(esc).join(' · ')}</p>`;
  if (c.scene === 'participants') content = `<h2>Our participants</h2><div class="stage-rows">${(c.participants||[]).map(p=>`<div>${esc(p.name)}<small>${esc(p.group)}</small></div>`).join('')}</div>`;
  if(c.wheel){
    const revealed=!c.wheel.pending&&now()>=c.wheel.endsAt;
    content=`<div class="wheel-layout" data-wheel-cue="${esc(JSON.stringify(c))}"><div class="wheel-frame"><canvas class="wheel-canvas" width="1000" height="1000" aria-label="${c.wheel.kind==='participant'?'Participant names':'Numbered topic slots'}"></canvas><div class="wheel-pointer"></div><div class="wheel-hub"><img src="${esc(settings.stageLogo)}" alt=""></div></div><div class="wheel-detail"><div class="stage-kicker">${c.wheel.kind==='participant'?'Participant draw':'Topic draw'}</div><h1 data-wheel-name>${esc(revealed?c.after.participant.name:c.wheel.pending?'Ready to draw':'Drawing…')}</h1><div class="stage-topic" data-wheel-topic>${esc(revealed?(c.after.topic||c.after.participant.group):'')}</div></div></div>`;
  }
  if (['contestant','participant_draw','topic_draw','preparation','speech'].includes(c.scene)) {
    if (c.scene === 'participant_draw') content += '<div class="draw-ring">◎</div><div class="stage-kicker">Participant draw</div>';
    if (c.scene === 'topic_draw') content += '<div class="stage-kicker">Topic draw</div>';
    const bigName=c.scene==='participant_draw'||(c.scene==='contestant'&&!c.topic);
    content += `<${bigName?'h1':'h2'}>${esc(c.participant?.name || 'Draw a participant first')}</${bigName?'h1':'h2'}>`;
    if (c.scene === 'participant_draw'||(c.scene==='contestant'&&!c.topic)) content += `<p class="stage-sub">${esc(c.participant?.group)}</p>`;
    else content += `<div class="stage-topic">${esc(c.topic || 'Draw a topic first')}</div>`;
    if (['preparation','speech'].includes(c.scene) && c.timer) content += `<div class="stage-timer" data-timer="${esc(JSON.stringify(c.timer))}">${timerText(remaining(c.timer))}</div><p class="stage-sub">${c.scene === 'preparation' ? 'Preparation' : 'Speech'}</p>`;
  }
  if (c.scene === 'announcement') content = `<div class="stage-topic">${esc(c.message || 'Announcement')}</div>`;
  if (c.scene === 'closing') content = `<h1>${esc(c.message || settings.title)}</h1>`;
  if (['leaderboard','awards'].includes(c.scene)) content = `<h2>${c.scene==='awards'?'Awards':'Published results'}</h2>${c.results ? `<div class="stage-rows results ${c.results.length>6?'results-grid':''}">${c.results.map(r=>`<div><b>${r.rank}</b><b>${esc(r.name)}</b><span>${r.average.toFixed(2)} / 10</span></div>`).join('')}</div>` : '<p class="stage-sub">Results have not been published.</p>'}`;
  return `<section class="stage" data-turn="${esc(c.turnId||'')}" data-wheel-id="${esc(c.wheel?.id||'')}"><header class="stage-header"><img class="stage-logo" src="${esc(settings.stageLogo)}" alt="Leonardo Da Vinci"><div class="stage-kicker">${esc(kicker)}</div></header><div class="stage-body">${content}</div><div class="stage-footer">${preview ? 'PREVIEW · ' : ''}${esc(settings.title)}</div></section>`;
}
function setup() {
  const d = state.divisions[selectedDivision], locked = state.turns.some(t=>t.division===selectedDivision);
  return `${title('Participants & topics','Review the program details before the first draw.')}${divisionTabs()}<div class="notice">The program uses short names; score sheets use full names with some spelling differences. Both are retained below for review.</div><div class="grid"><section class="card"><h2>Division ${selectedDivision} · ${d.participants.length} participants</h2><div class="scroll"><table><thead><tr><th>Display name</th><th>Score-sheet name</th><th>Grade</th></tr></thead><tbody>${d.participants.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.fullName)}</td><td>${esc(p.group)}</td></tr>`).join('')}</tbody></table></div><hr class="sep"><details><summary>Edit participant list</summary><form id="roster-form"><p class="smalltext muted">One per line: Display name | Full name | Grade. Saving replaces this division’s roster.</p><label>Participants<textarea name="rows" rows="12" ${locked?'disabled':''}>${esc(d.participants.map(p=>`${p.name} | ${p.fullName} | ${p.group}`).join('\n'))}</textarea></label><button type="submit" class="primary" ${locked?'disabled':''}>Save participant list</button></form></details></section>
    <section class="card"><h2>Private topic pool</h2><p class="smalltext muted">These topics are available only to Admin. Each topic can be drawn once in its division.</p><form id="topics-form"><label>One topic per line<textarea name="rows" rows="17" ${locked?'disabled':''}>${esc(d.topics.map(t=>t.text).join('\n'))}</textarea></label><button type="submit" class="primary" ${locked?'disabled':''}>Save topic pool</button></form></section></div><section class="card"><h2>Review before starting</h2><p>Master of Ceremony: <strong>${esc(d.emcee)}</strong></p><p>Judges: <strong>${panel(selectedDivision).map(j=>esc(j.name)).join(' · ')}</strong></p>${selectedDivision==='C'?'<div class="notice">Division C’s program lists two judges. Confirm this two-judge panel deliberately, or add the third judge in Judging panel before the first draw.</div>':''}${d.confirmed?'<span class="chip live">Roster and panel confirmed</span>':button(`Confirm Division ${selectedDivision} roster & panel`,'confirm-panel',{},'primary',locked)}</section>`;
}
function judges() {
  return `${title('Judging panel')}<div class="notice">Confirm each judge’s identity and division assignment before scoring.</div><section class="card"><div class="scroll"><table><thead><tr><th>Judge</th><th>Assigned divisions</th><th>Direct score sheet</th></tr></thead><tbody>${state.judges.map(j=>`<tr><td><strong>${esc(j.name)}</strong><small>${esc(j.description)}</small></td><td>${j.divisions.join(' · ')}</td><td><a class="button" href="${link('judge',{judge:j.id})}" target="_blank" rel="noopener">Open ${esc(j.name)} ↗</a></td></tr>`).join('')}</tbody></table></div></section><section class="card"><h2>Edit panel assignments</h2><p class="smalltext muted">One per line: ID | Judge name | Role | Divisions (e.g. A,B,C). A division’s panel is fixed after its first draw.</p><form id="judges-form"><label>Judges<textarea name="rows" rows="8">${esc(state.judges.map(j=>`${j.id} | ${j.name} | ${j.description} | ${j.divisions.join(',')}`).join('\n'))}</textarea></label><button class="primary" type="submit">Save judges & assignments</button></form></section>`;
}
function program() {
  return `${title('Program flow')}<div class="grid">${Object.entries(state.divisions).map(([key,d])=>`<section class="card"><div class="card-head"><h2>Division ${key}</h2><span class="chip">${d.participants.length} participants</span></div><p>${esc(d.label)}<br><small>Master of Ceremony · ${esc(d.emcee)}</small></p>${['Opening & introductions','Contest proper','Judges finalize scores · participation certificates','Awarding of winners'].map((a,i)=>`<div class="schedule-row"><time>${d.schedule[i]} – ${d.schedule[i+1]}</time><span>${a}</span></div>`).join('')}<p class="smalltext muted" style="margin-top:16px">Announce 3rd place, 2nd place, then 1st place.</p></section>`).join('')}<section class="card"><h2>Contest mechanics</h2><p>Draw one participant, then one topic. Allow one minute of preparation and a two-to-three-minute speech. Show the timer to the participant.</p><p class="smalltext muted">The program supplies cue cards and pens for preparation. The rubric discourages reading notes during the speech; this remains a judge-assessed criterion. Timing never applies automatic penalties.</p><p>Ten criteria · 0.25, 0.50, 0.75 or 1.00 each · total /10. Division results are the average of all assigned judges’ totals.</p></section></div>`;
}
function results() {
  const d = state.divisions[selectedDivision], rows = state.standings[selectedDivision];
  const ties = rows.some((r,i)=>i&&r.average===rows[i-1].average);
  return `${title('Scores & awards','Review all judge submissions before publishing.')}${divisionTabs()}<div class="row" style="margin-bottom:20px">${button('Export event JSON','export-json')}${button('Export score CSV','export-csv')}</div>${ties?'<div class="notice">There is a tied average. Tied participants share a place; no automatic tiebreak rule was supplied. Review before publishing awards.</div>':''}<section class="card"><div class="card-head"><h2>Division ${selectedDivision}</h2><span class="chip ${d.published?'live':''}">${d.published?'PUBLISHED':'UNPUBLISHED'}</span></div><div class="scroll"><table><thead><tr><th>Place</th><th>Participant</th>${panel(selectedDivision).map(j=>`<th>${esc(j.name)}</th>`).join('')}<th>Average / 10</th></tr></thead><tbody>${d.participants.map(p=>{
    const t=state.turns.find(t=>t.participantId===p.id&&t.division===selectedDivision&&t.status!=='cancelled'); const rank=rows.find(r=>r.participantId===p.id);
    return `<tr><td>${rank?.rank||'—'}</td><td><strong>${esc(p.name)}</strong><small>${t?.status==='complete'?(rank?'Scored':'Speech complete · awaiting scores'):t?'In progress':'Not drawn'}</small></td>${panel(selectedDivision).map(j=>`<td>${t?.scores[j.id]?t.scores[j.id].values.reduce((a,b)=>a+b,0).toFixed(2):'—'}</td>`).join('')}<td class="admin-results">${rank?rank.average.toFixed(2):'—'}</td></tr>`;
  }).join('')}</tbody></table></div><hr class="sep"><p class="smalltext muted">Publishing makes an immutable result snapshot available for leaderboard and awards scenes. You still choose when to take those scenes live.</p>${button(d.published?'Results published':`Publish Division ${selectedDivision} results`,'publish',{},'primary',!!d.published||rows.length!==d.participants.length)}</section><section class="card"><h2>Submitted score sheets</h2>${state.turns.filter(t=>t.division===selectedDivision&&Object.keys(t.scores).length).map(t=>`<details style="margin-bottom:14px"><summary>${esc(participant(t).name)} · ${Object.keys(t.scores).length} score sheets</summary>${Object.entries(t.scores).map(([id,score])=>`<p><strong>${esc(state.judges.find(j=>j.id===id)?.name)}</strong><br>${score.values.map((v,i)=>`${i+1}: ${v.toFixed(2)}`).join(' · ')}<br><small>${esc(score.note)}</small></p>`).join('')}</details>`).join('')||'<p class="muted">No submitted score sheets yet.</p>'}</section>`;
}
function settings() {
  const s=state.settings;
  return `${title('School settings')}<div class="setup-section"><section class="card"><h2>School appearance</h2><form id="settings-form"><label>Contest title<input name="title" value="${esc(s.title)}" maxlength="120" required></label><div class="form-grid"><label>Control-page logo<select name="logo"><option value="assets/logo-blue.svg" ${s.logo==='assets/logo-blue.svg'?'selected':''}>Official blue logo</option><option value="assets/anniversary.png" ${s.logo==='assets/anniversary.png'?'selected':''}>Official 30th anniversary</option>${s.logo.startsWith('data:')?'<option value="custom" selected>Uploaded logo</option>':''}</select></label><label>Audience logo<select name="stageLogo"><option value="assets/logo-white.svg" ${s.stageLogo==='assets/logo-white.svg'?'selected':''}>Official white logo</option><option value="assets/anniversary.png" ${s.stageLogo==='assets/anniversary.png'?'selected':''}>Official 30th anniversary</option>${s.stageLogo.startsWith('data:')?'<option value="custom" selected>Uploaded logo</option>':''}</select></label><label>Upload control-page logo<input type="file" name="logoFile" accept="image/png,image/jpeg,image/webp"></label><label>Upload audience logo<input type="file" name="stageLogoFile" accept="image/png,image/jpeg,image/webp"></label><label>Primary colour<input type="color" name="accent" value="${esc(s.accent)}"></label><label>Highlight colour<input type="color" name="highlight" value="${esc(s.highlight)}"></label></div><label>Scene transitions<select name="transition">${[['none','None · best for older displays'],['fade','Restrained fade'],['logo','School-logo transition']].map(([k,v])=>`<option value="${k}" ${s.transition===k?'selected':''}>${v}</option>`).join('')}</select></label><h3>Contest timing</h3><p class="smalltext muted">From the program: 60 seconds preparation; 120–180 seconds speech. Timing rules lock after the first draw.</p><div class="form-grid">${[['prepSeconds','Preparation seconds'],['minimumSeconds','Minimum speech seconds'],['speechSeconds','Maximum speech seconds']].map(([k,v])=>`<label>${v}<input type="number" name="${k}" min="1" max="3600" value="${s[k]}" ${state.turns.length?'disabled':''}></label>`).join('')}</div><button type="submit" class="primary">Save settings</button></form></section><section class="card"><h2>Connection</h2><p class="smalltext muted">Use the same event code on every screen.</p>${connectionForm()}</section><section class="card"><h2>Archive & reset</h2><p class="smalltext muted">Reset archives the full current event on the server, then restores the supplied roster, topic pools and panels for a future event. School appearance is retained. Every connected screen must reconnect.</p><div class="row">${button('Export current event','export-json')}${button('View archived events','archives')}${button('Archive & reset event','reset',{},'danger')}</div><div id="archives"></div></section></div>`;
}
function judgeView() {
  const j=state.judges.find(j=>j.id===judgeId), t=state.current;
  if (!j) return `<h1>Choose your judging identity</h1><p class="muted">Select your name. This identifies the score sheet you submit.</p><div class="card">${state.judges.map(j=>`<a class="button" style="margin:7px" href="${link('judge',{judge:j.id})}">${esc(j.name)} · ${j.divisions.join(', ')}</a>`).join('')}</div>`;
  const queue=state.queue||[],waiting=queue.filter(row=>!row.submitted).length;
  const identity=`<div class="judge-identity"><div class="eyebrow" style="color:#F2C94C">YOUR JUDGING IDENTITY</div><h2>${esc(j.name)}</h2><small>${esc(j.description)} · Divisions ${j.divisions.join(', ')} · Event ${esc(code)}</small></div><a class="top-link" href="${link('judge',{judge:''})}">Change selected judge</a>${queue.length?`<section class="card judge-queue"><label>Participant score sheet<select id="judge-turn">${queue.map(row=>`<option value="${esc(row.id)}" ${t?.id===row.id?'selected':''}>Division ${esc(row.division)} · ${esc(row.name)} · ${row.submitted?'Submitted':row.status==='complete'?'Awaiting your score':row.status==='paused'?'Paused':'On stage'}</option>`).join('')}</select></label><small>${waiting} score sheet${waiting===1?'':'s'} awaiting your score. Completed speeches remain available.</small></section>`:''}`;
  if (!t) return `${identity}<section class="card" style="margin-top:20px"><div class="empty"><span class="symbol">◷</span>Waiting for a participant assigned to your panel.</div></section>`;
  if (!t.topic) return `${identity}<section class="card"><div class="eyebrow">DIVISION ${t.division}</div><div class="hero-name">${esc(t.participant.name)}</div><p class="muted">Waiting for the topic draw.</p></section>`;
  if (t.myScore) return `${identity}<section class="card" style="margin-top:20px"><div class="notice good">Your score is submitted and locked.</div><h2>${esc(t.participant.name)}</h2><p>${esc(t.topic.text)}</p><div class="hero-name">${t.myScore.values.reduce((a,b)=>a+b,0).toFixed(2)} / 10</div><p class="muted">Waiting for the next participant. Do not submit another score for this speech.</p></section>`;
  let saved={}; try{saved=JSON.parse(readLocal(`davinci-score-${state.generation}-${t.id}-${judgeId}`,'{}'));}catch{}
  return `${identity}<section class="card" style="margin-top:20px">${t.status==='complete'?'<div class="notice">Speech completed. Your score sheet remains open while the contest continues.</div>':''}<div class="eyebrow">DIVISION ${t.division} · ${esc(t.participant.group)}</div><div class="hero-name">${esc(t.participant.name)}</div><small>${esc(t.participant.fullName)}</small><p class="topic">${esc(t.topic.text)}</p>${phaseClock(t.timer)}<p class="smalltext muted">Timer: ${esc(t.timer.phase)}. Judge time management using the rubric.</p><form id="score-form" data-turn="${t.id}"><h2>Score sheet</h2><p class="smalltext muted">Select one score for every criterion. Expand a criterion to see the program’s descriptors.</p>${state.criteria.map((c,i)=>`<div class="criterion"><div class="criterion-head"><span class="number">${String(i+1).padStart(2,'0')}</span><h3>${esc(c.name)}</h3></div><div class="score-options">${[[1,'Excellent'],[.75,'Good'],[.5,'Fair'],[.25,'Needs improvement']].map(([v,l])=>`<label><input type="radio" name="criterion-${i}" value="${v}" required ${Number(saved[i])===v?'checked':''}><span>${v.toFixed(2)}<small>${l}</small></span></label>`).join('')}</div><details><summary>Rubric descriptors</summary>${[[1,'Excellent'],[.75,'Good'],[.5,'Fair'],[.25,'Needs improvement']].map(([v,l])=>`<p><strong>${v.toFixed(2)} · ${l}:</strong> ${esc(c.descriptors[String(v)])}</p>`).join('')}</details></div>`).join('')}<label style="margin-top:20px">Private judge notes (optional)<textarea name="note" maxlength="1000">${esc(saved.note||'')}</textarea></label><div class="judge-total row between"><strong id="score-total">${scoreSummary(saved)}</strong><button type="submit" class="primary" ${busy?'disabled':''}>Review & submit score</button></div></form></section>`;
}
function scoreSummary(values) {
  const selected=Array.from({length:10},(_,i)=>Number(values[i])).filter(v=>[.25,.5,.75,1].includes(v));
  return `${selected.reduce((a,b)=>a+b,0).toFixed(2)} / 10 · ${selected.length}/10 criteria`;
}
function emceeView() {
  const t=state.current,d=state.divisions[state.division];
  return `${title('Emcee desk')}<section class="card"><div class="eyebrow">DIVISION ${state.division} · ${esc(d.label)}</div><h2>Master of Ceremony · ${esc(d.emcee)}</h2>${t?`<div class="hero-name">${esc(t.participant.name)}</div><p class="topic">${esc(t.topic?.text||'Waiting for topic draw')}</p>${phaseClock(t.timer)}<p class="muted">${esc(t.timer.phase)} · ${t.submitted}/${t.expected} judges submitted</p>`:'<p class="muted">Waiting for the next participant.</p>'}</section><section class="card"><h2>Program cues</h2>${['Welcome, participant announcement, mechanics and judges','Contest proper','Judges finalize scores; distribute participation certificates','Announce third place, second place, then first place'].map((a,i)=>`<div class="schedule-row"><time>${d.schedule[i]} – ${d.schedule[i+1]}</time><span>${a}</span></div>`).join('')}</section>${d.published?`<section class="card"><h2>Published awards</h2>${d.published.rows.filter(r=>r.rank<=3).sort((a,b)=>b.rank-a.rank).map(r=>`<p><strong>Place ${r.rank} · ${esc(r.name)}</strong> · ${r.average.toFixed(2)} /10</p>`).join('')}</section>`:''}<small>Contest control and publication are operated from Admin.</small>`;
}
function render(force=false) {
  if (!state) return;
  if (role==='audience') {
    const cue=window.ContestWheel.resolve(state.live,now());
    const cueId=cue?.id||'standby';
    const settingsKey=JSON.stringify(state.settings);
    if (displayedCue!==cueId || force || displayedSettings!==settingsKey) {
      displayedSettings=settingsKey;
      const first=!displayedCue; displayedCue=cueId;
      app.innerHTML=`${stage(cue)}<div class="screen-tools">${button('Fullscreen','fullscreen')}</div>`;
      if(!first&&state.settings.transition==='fade') document.querySelector('.stage').classList.add('fade-in');
      if(!first&&state.settings.transition==='logo'&&!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const overlay=document.createElement('div');overlay.className='logo-transition';overlay.innerHTML=`<img src="${esc(state.settings.stageLogo)}" alt="">`;document.body.append(overlay);setTimeout(()=>overlay.remove(),900);
      }
    } else {
      const n=document.querySelector('[data-timer]');
      if(n&&cue?.timer)n.dataset.timer=JSON.stringify(cue.timer);
    }
    connection();tick();return;
  }
  if(!force&&(editing||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)||state.revision===lastRendered))return;
  lastRendered=state.revision;
  if(role==='admin') shell(({control,setup,judges,program,results,settings}[tab])());
  if(role==='judge') shell(judgeView());
  if(role==='emcee') shell(emceeView());
  if(busy)document.querySelectorAll('button[data-action],button[type=submit]').forEach(b=>b.disabled=true);
}
function tick() {
  mountWheels();
  if(role==='admin'){
    document.querySelectorAll('[data-wheel-wait]').forEach(button=>button.disabled=busy||!!pending||!!state.live?.wheel&&now()<state.live.wheel.finishAt);
    const label=document.querySelector('[data-live-scene]');if(label&&state?.live)label.textContent=sceneNames[window.ContestWheel.resolve(state.live,now()).scene];
  }
  document.querySelectorAll('[data-timer]').forEach(n=>{
    let t=JSON.parse(n.dataset.timer);
    if(n.dataset.clockTurn){const current=role==='admin'?active():state?.current;if(current?.id===n.dataset.clockTurn)t=current.timer;}
    const value=remaining(t);
    n.textContent=timerText(value);
    const min=state?.settings?.minimumSeconds||120;
    n.classList.toggle('overtime',value<0);
    n.classList.toggle('ready',t.phase==='speech'&&value>=0&&t.duration-value>=min);
  });
}
let wheelFrame=0;
const wheelModels=new WeakMap();
function mountWheels(){
  const nodes=document.querySelectorAll('[data-wheel-cue]');
  nodes.forEach(node=>{if(!wheelModels.has(node)){const cue=JSON.parse(node.dataset.wheelCue);wheelModels.set(node,cue);window.ContestWheel.paint(node.querySelector('canvas'),cue.wheel);}});
  if([...nodes].some(node=>!wheelModels.get(node)?.wheel.pending)&&!wheelFrame)wheelFrame=requestAnimationFrame(animateWheels);
}
function animateWheels(){
  wheelFrame=0;
  const nodes=document.querySelectorAll('[data-wheel-cue]');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  nodes.forEach(node=>{
    const cue=wheelModels.get(node);if(!cue)return;
    const at=now(),wheel=cue.wheel;
    if(wheel.pending)return;
    if(at>=wheel.finishAt){
      const preview=!!node.closest('#preview');
      node.closest('.stage').outerHTML=stage(cue.after,preview);
      if(role==='audience')displayedCue=cue.after.id;
      return;
    }
    node.querySelector('canvas').style.transform=`rotate(${window.ContestWheel.rotation(wheel,at,reduced)}deg)`;
    if(at>=wheel.endsAt&&!node.dataset.revealed){
      node.dataset.revealed='true';node.querySelector('[data-wheel-name]').textContent=cue.after.participant.name;
      node.querySelector('[data-wheel-topic]').textContent=cue.after.topic||cue.after.participant.group;
    }
  });
  if([...document.querySelectorAll('[data-wheel-cue]')].some(node=>!wheelModels.get(node)?.wheel.pending))wheelFrame=requestAnimationFrame(animateWheels);
}
function connectionForm() {
  return `<form id="connection-form"><label>Event code<input name="code" value="${esc(code)}" placeholder="E.g. DAVINCI26" pattern="[A-Za-z0-9-]{4,12}" maxlength="12" required></label><details ${!apiBase?'open':''}><summary>Connection settings</summary><label>Public server URL<input name="server" value="${esc(apiBase)}" type="url" placeholder="https://contest-server.example.org"></label><small>Leave blank only when the server and preview use the same address.</small></details><button type="submit" class="primary" style="margin-top:16px">Connect to event</button></form>`;
}
function showConnection(message='') {
  app.innerHTML=`${header()}<main class="home"><h1>Impromptu Speech Contest</h1><p class="intro">Unidad Educativa Leonardo Da Vinci · Manta, Ecuador</p>${message?`<div class="notice error">${esc(message)}</div>`:''}<section class="card connect-box"><h2>Connect this ${role==='home'?'device':role+' screen'}</h2>${connectionForm()}</section>${role==='admin'?'<section class="card connect-box"><h2>Initialize the school event</h2><p class="smalltext muted">Create the persistent event with Divisions A, B and C from the supplied program. An existing event will not be replaced.</p><form id="initialize-form"><label>New event code<input name="code" value="DAVINCI26" pattern="[A-Za-z0-9-]{4,12}" maxlength="12" required></label><button type="submit" class="primary">Initialize event</button></form></section>':''}</main>`;
}
function home() {
  app.innerHTML=`${header()}<main class="home"><div class="eyebrow">UNIDAD EDUCATIVA LEONARDO DA VINCI</div><h1>2nd Impromptu<br>Speech Contest</h1><div class="role-grid">${[['admin','Contest control'],['judge','Judging panel'],['emcee','Emcee desk'],['audience','Audience display']].map(([key,name],i)=>`<a class="role-card" href="${link(key)}"><span class="role-number">0${i+1} / ${key.toUpperCase()}</span><h2>${name}</h2><b>Open screen ↗</b></a>`).join('')}</div><section class="card connect-box"><h2>Event connection ${code?`· ${esc(code)}`:''}</h2>${connectionForm()}</section></main>`;
}
function confirmDialog(titleText, body, expected, callback) {
  const dialog=document.createElement('dialog');
  dialog.innerHTML=`<form method="dialog"><h2>${esc(titleText)}</h2><p>${esc(body)}</p>${expected?`<label>Type ${esc(expected)}<input name="confirmation" autocomplete="off" required></label>`:''}<div class="row"><button value="cancel" formnovalidate>Cancel</button><button value="confirm" class="primary">Confirm</button></div></form>`;
  document.body.append(dialog);
  dialog.addEventListener('close',()=>{const value=dialog.querySelector('input')?.value;const ok=dialog.returnValue==='confirm';dialog.remove();if(ok){if(expected&&value!==expected)return toast('The confirmation text did not match.',true);callback(value);}});
  dialog.showModal();
}
function download(name,data,type='application/json') {
  const blob=new Blob([data],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function exportEvent(csv=false, archiveId) {
  const data=await request(`${archiveId?'archive':'export'}?code=${encodeURIComponent(code)}${archiveId?'&id='+encodeURIComponent(archiveId):''}`);
  const base=`davinci-${code}-${archiveId?'archive-'+archiveId:new Date().toISOString().slice(0,10)}`;
  if(!csv)return download(base+'.json',JSON.stringify(data,null,2));
  const rows=[['Division','Attempt status','Participant','Full name','Judge','Topic',...data.criteria.map(c=>c.name),'Total /10','Private notes']];
  for(const t of data.turns)for(const [id,score]of Object.entries(t.scores)){
    const p=data.divisions[t.division].participants.find(p=>p.id===t.participantId);
    rows.push([t.division,t.status,p.name,p.fullName,data.judges.find(j=>j.id===id)?.name,t.topic?.text,...score.values,score.values.reduce((a,b)=>a+b,0),score.note]);
  }
  const cell=v=>`"${String(v??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')}"`;
  download(base+'.csv','\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n'),'text/csv;charset=utf-8');
}
async function clickAction(target) {
  const action=target.dataset.action,t=active();
  if(action==='retry')return sendPending();
  if(action==='tab'){
    if(editing&&!['control'].includes(tab)) return confirmDialog('Leave unsaved edits?','Your unsaved edits on this page will be discarded.','',()=>{editing=false;tab=target.dataset.tab;render(true);});
    editing=false;tab=target.dataset.tab;render(true);return;
  }
  if(action==='division'){draft.division=target.dataset.division;return mutate('division',{division:target.dataset.division});}
  if(action==='confirm-panel')return confirmDialog('Confirm roster and judging panel',`Division ${selectedDivision}: ${panel(selectedDivision).map(j=>j.name).join(', ')}. Confirm you have reviewed the roster and this panel.`,'',()=>mutate('confirm_panel',{division:selectedDivision}));
  if(action==='draw-participant')return mutate('draw_participant',{division:selectedDivision});
  if(action==='draw-topic')return mutate('draw_topic',{division:selectedDivision,turnId:t.id});
  if(action==='phase')return mutate('timer',{operation:'phase',phase:target.dataset.phase,turnId:t.id});
  if(action==='timer')return mutate('timer',{operation:target.dataset.operation,turnId:t.id});
  if(action==='timer-reset')return confirmDialog('Reset this timer?','This sets the current phase back to its full duration.','',()=>mutate('timer',{operation:'reset',confirm:true,turnId:t.id}));
  if(action==='undo-participant')return confirmDialog('Undo participant draw?','This cancels the current attempt, returns the participant and topic to their pools, and retains its scores in history.','',()=>mutate('undo_participant',{division:selectedDivision,turnId:t.id,confirm:true}));
  if(action==='undo-topic')return confirmDialog('Undo topic draw?','The topic will return to its pool. This is available before any judge has submitted a score.','',()=>mutate('undo_topic',{division:selectedDivision,turnId:t.id,confirm:true}));
  if(action==='undo-complete')return confirmDialog('Undo last completion?','Reopen this division’s last completed speech, preserving its topic and scores. Any other current contestant will be paused.','',()=>mutate('undo_complete',{division:selectedDivision,turnId:target.dataset.turn,confirm:true}));
  if(action==='complete')return mutate('complete',{turnId:t.id});
  if(action==='take-live')return mutate('take_live',{...draft,division:selectedDivision,turnId:document.querySelector('#preview .stage')?.dataset.turn||null,wheelId:document.querySelector('#preview .stage')?.dataset.wheelId||null});
  if(action==='publish')return confirmDialog('Publish division results',`Publish the reviewed Division ${selectedDivision} result snapshot. It can then be shown on the audience display.`,`PUBLISH ${selectedDivision}`,confirm=>mutate('publish',{division:selectedDivision,confirm}));
  if(action==='reset')return confirmDialog('Archive and reset this event','The server will save an archive, then clear all draws, scores and published results for a future event. Export first if you also want a local copy.',`RESET ${code}`,confirm=>mutate('reset',{confirm}));
  if(action==='export-json')return exportEvent();
  if(action==='export-csv')return exportEvent(true);
  if(action==='archive-download')return exportEvent(false,target.dataset.id);
  if(action==='archives'){
    const rows=await request(`archives?code=${encodeURIComponent(code)}`);
    document.querySelector('#archives').innerHTML=rows.length?rows.map(r=>`<div class="row between" style="margin-top:15px"><span>${esc(new Date(r.created*1000).toLocaleString('en-GB',{timeZone:'America/Guayaquil'}))}</span>${button('Download archive','archive-download',{id:r.id})}</div>`).join(''):'<p class="muted" style="margin-top:15px">No archived events yet.</p>';return;
  }
  if(action==='fullscreen')return document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();
}
document.addEventListener('click',event=>{
  const b=event.target.closest('[data-action]');
  if(b&&!b.disabled)clickAction(b).catch(e=>toast(e.message,true));
});
document.addEventListener('input',event=>{
  if(event.target.closest('#scene-message')||event.target.id==='scene'){
    draft.followLive=false;
    draft.scene=document.querySelector('#scene').value;draft.message=document.querySelector('#scene-message').value;draft.division=selectedDivision;
    saveLocal(`davinci-draft-${state.generation}`,JSON.stringify(draft));
    document.querySelector('#preview').innerHTML=stage(previewCue(),true);tick();return;
  }
  const f=event.target.closest('form');
  if(f&&f.id!=='connection-form')editing=true;
  if(f?.id==='score-form'){
    const values=Object.fromEntries(new FormData(f));
    const saved={note:values.note};for(let i=0;i<10;i++)if(values[`criterion-${i}`])saved[i]=Number(values[`criterion-${i}`]);
    saveLocal(`davinci-score-${state.generation}-${f.dataset.turn}-${judgeId}`,JSON.stringify(saved));
    document.querySelector('#score-total').textContent=scoreSummary(saved);
  }
});
document.addEventListener('change',event=>{
  if(event.target.id==='scene')event.target.dispatchEvent(new Event('input',{bubbles:true}));
  if(event.target.id==='judge-turn'){judgeTurnId=event.target.value;editing=false;refresh(true);}
});
document.addEventListener('submit',event=>{
  const form=event.target;if(!form.id)return;event.preventDefault();submitForm(form).catch(e=>toast(e.message,true));
});
async function fileData(file) {
  if(!file||!file.size)return null;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>32000)throw new Error('Use a PNG, JPEG or WebP logo smaller than 32 KB, or choose a bundled official logo.');
  return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
}
async function submitForm(form) {
  const f=new FormData(form),rows=()=>String(f.get('rows')).split(/\r?\n/).map(r=>r.trim()).filter(Boolean);
  if(form.id==='connection-form'){
    apiBase=String(f.get('server')||'').replace(/\/$/,'');code=String(f.get('code')).toUpperCase();
    if(apiBase){const u=new URL(apiBase);if(!['https:','http:'].includes(u.protocol))throw new Error('Use an HTTPS server address.');if(location.protocol==='https:'&&u.protocol!=='https:')throw new Error('GitHub Pages needs an HTTPS contest server.');}
    saveLocal('davinci-server',apiBase);saveLocal('davinci-code',code);
    location.href=link(role==='home'?'index':role,role==='judge'?{judge:judgeId}:{});return;
  }
  if(form.id==='initialize-form'){
    code=String(f.get('code')).toUpperCase();const data=await request('initialize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});
    saveLocal('davinci-code',code);accept(data);editing=false;render(true);return;
  }
  if(form.id==='contestant-form')return confirmDialog('Change current contestant?','The selected contestant becomes current. Existing topics and scores stay with their original contestant; the other attempt can be resumed later.','',()=>mutate('select_participant',{division:selectedDivision,participantId:String(f.get('participantId')),confirm:true}));
  if(form.id==='roster-form')return mutate('roster',{division:selectedDivision,participants:rows().map(r=>{const [name,fullName,group]=r.split('|').map(s=>s.trim());return{name,fullName:fullName||name,group:group||''};})});
  if(form.id==='topics-form')return mutate('topics',{division:selectedDivision,topics:rows()});
  if(form.id==='judges-form')return mutate('judges',{judges:rows().map(r=>{const [id,name,description,divs]=r.split('|').map(s=>s.trim());return{id,name,description:description||'',divisions:(divs||'').split(',').map(s=>s.trim().toUpperCase()).filter(Boolean)};})});
  if(form.id==='settings-form'){
    const settings={};for(const k of ['title','logo','stageLogo','accent','highlight','transition'])settings[k]=f.get(k)==='custom'?state.settings[k]:f.get(k);
    for(const k of ['prepSeconds','minimumSeconds','speechSeconds'])if(f.has(k))settings[k]=Number(f.get(k));
    const logo=await fileData(f.get('logoFile')),stageLogo=await fileData(f.get('stageLogoFile'));if(logo)settings.logo=logo;if(stageLogo)settings.stageLogo=stageLogo;
    return mutate('settings',{settings});
  }
  if(form.id==='score-form'){
    const values=Array.from({length:10},(_,i)=>Number(f.get(`criterion-${i}`)));
    const data={turnId:form.dataset.turn,judgeId,confirmIdentity:judgeId,values,note:String(f.get('note')||'')};
    const judge=state.judges.find(j=>j.id===judgeId);
    const participantName=state.current?.participant.name;
    return confirmDialog('Submit and lock this score?',`${judge.name} · ${participantName} · ${values.reduce((a,b)=>a+b,0).toFixed(2)} /10. Review your selections before confirming.`,'',()=>mutate('score',data));
  }
}
async function start() {
  if(role==='home'){
    if(!code)try{const info=await request('session');if(info.initialized){code=info.code;saveLocal('davinci-code',code);}}catch{}
    home();return;
  }
  if(role==='admin'&&!code)try{const info=await request('session');if(info.initialized){code=info.code;saveLocal('davinci-code',code);}}catch{}
  if(role==='judge')saveLocal('davinci-judge',judgeId);
  try{pending=JSON.parse(readLocal(`davinci-pending-${role}-${code}`,'null'));}catch{}
  showConnection();
  if(code)await refresh(true);
  const poll=async()=>{if(!busy)await refresh();setTimeout(poll,failures?Math.min(30000,2000*2**Math.min(failures,4)):2000+Math.random()*300);};
  setTimeout(poll,2000);
}
setInterval(tick,100);
start();
