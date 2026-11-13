// Pure contest rules; shared by the Wix endpoint and the concurrency test suite.
export class Problem extends Error { constructor(message, status=422){super(message);this.status=status;} }
export const check=(condition,message,status=422)=>{if(!condition)throw new Problem(message,status);};
export const clone=value=>structuredClone(value);
export const timestamp=()=>Date.now()/1000;
const uid=()=>crypto.randomUUID();
export function text(value,max,label='Text',empty=false){check(typeof value==='string',`${label} must be text.`);value=value.trim();check((empty||value)&&value.length<=max,`${label} needs 1–${max} characters.`);return value;}
const number=(v,min,max,label)=>{check(Number.isInteger(v)&&v>=min&&v<=max,`${label} must be ${min}–${max}.`);return v;};
export const SCENES=['standby','introduction','participants','participant_draw','topic_draw','preparation','speech','announcement','leaderboard','awards','closing'];
export const panel=(s,d)=>s.judges.filter(j=>j.divisions.includes(d));
export const active=s=>s.turns.find(t=>t.id===s.active);
export const participant=(s,t)=>s.divisions[t.division].participants.find(p=>p.id===t.participantId);
export const remaining=(t,now=timestamp())=>t.running?t.endsAt-now:t.remaining;
const randomPick=rows=>{
  // Rejection sampling avoids modulo bias.
  const max=Math.floor(0x100000000/rows.length)*rows.length;
  let n;do{n=crypto.getRandomValues(new Uint32Array(1))[0];}while(n>=max);
  return rows[n%rows.length];
};
export function initial(seed,code){
  const source=clone(seed);
  for(const d of Object.values(source.divisions))Object.assign(d,{confirmed:false,published:null});
  return {...source,code,generation:uid(),revision:1,createdAt:timestamp(),division:'A',turns:[],active:null,live:null,receipts:{},archives:[],audit:[],settings:{
    title:'2nd Impromptu Speech Contest',school:'Unidad Educativa Leonardo Da Vinci',logo:'assets/logo-blue.svg',stageLogo:'assets/logo-white.svg',
    accent:'#2159A6',highlight:'#F2C94C',transition:'fade',prepSeconds:60,minimumSeconds:120,speechSeconds:180
  }};
}
export function standings(s,d){
  const rows=s.turns.filter(t=>t.division===d&&t.status==='complete').map(t=>{
    const p=participant(s,t);return {participantId:p.id,name:p.name,fullName:p.fullName,group:p.group,average:Object.values(t.scores).reduce((sum,v)=>sum+v.values.reduce((a,b)=>a+b,0),0)/t.panel.length};
  }).sort((a,b)=>b.average-a.average||a.name.localeCompare(b.name));
  let last=null,rank=0;rows.forEach((r,i)=>{if(r.average!==last)rank=i+1;r.rank=rank;last=r.average;});return rows;
}
export function scene(s,data){
  const name=data.scene,div=data.division||s.division,d=s.divisions[div];
  check(SCENES.includes(name)&&d,'Choose a valid scene and division.');
  const cue={id:uid(),scene:name,division:div,label:d.label,message:text(data.message||'',1000,'Message',true)};
  if(name==='introduction')Object.assign(cue,{emcee:d.emcee,judges:panel(s,div).map(j=>j.name)});
  if(name==='participants')cue.participants=d.participants.map(p=>({name:p.name,group:p.group}));
  if(['participant_draw','topic_draw','preparation','speech'].includes(name)){
    const t=active(s);check(t&&t.division===div,'Draw a participant in this division first.');
    check(data.turnId===t.id,'The participant changed since this preview. Review it before taking live.',409);
    const p=participant(s,t);Object.assign(cue,{turnId:t.id,participant:{name:p.name,group:p.group}});
    if(name!=='participant_draw'){check(t.topic,'Draw the topic first.');cue.topic=t.topic.text;}
    if(['preparation','speech'].includes(name)){check(t.timer.phase===name,'Select the matching timer phase first.');cue.timer=clone(t.timer);}
  }
  if(['leaderboard','awards'].includes(name)){
    check(d.published,'Publish the reviewed results first.');cue.results=clone(d.published.rows);cue.publishedAt=d.published.at;
    if(name==='awards')cue.results=cue.results.filter(r=>r.rank<=3);
  }
  return cue;
}
export function audience(s){
  const settings=Object.fromEntries(['school','title','stageLogo','accent','highlight','transition','minimumSeconds','speechSeconds'].map(k=>[k,s.settings[k]]));
  const cue=clone(s.live);
  if(cue&&['preparation','speech'].includes(cue.scene)){
    const t=s.turns.find(t=>t.id===cue.turnId);
    if(t?.timer.phase===cue.scene)cue.timer=clone(t.timer);
  }
  return {revision:s.revision,generation:s.generation,serverNow:timestamp(),settings,live:cue};
}
export function project(s,role='admin',judgeId){
  if(role==='audience')return audience(s);
  const base={code:s.code,generation:s.generation,revision:s.revision,serverNow:timestamp(),settings:clone(s.settings)};
  if(role==='judge'){
    const t=active(s);return {...base,criteria:clone(s.criteria),judges:clone(s.judges),current:t&&t.panel.includes(judgeId)?{
      id:t.id,division:t.division,participant:clone(participant(s,t)),topic:clone(t.topic),timer:clone(t.timer),myScore:clone(t.scores[judgeId]||null),status:t.status
    }:null};
  }
  if(role==='emcee'){
    const t=active(s);return {...base,division:s.division,current:t?{id:t.id,division:t.division,participant:clone(participant(s,t)),topic:clone(t.topic),timer:clone(t.timer),submitted:Object.keys(t.scores).length,expected:t.panel.length}:null,
      live:audience(s).live,judges:clone(s.judges),divisions:Object.fromEntries(Object.entries(s.divisions).map(([k,d])=>[k,Object.fromEntries(['label','emcee','schedule','published'].map(f=>[f,clone(d[f])]))]))};
  }
  check(role==='admin','Unknown role.',404);
  const view=clone(s);delete view.receipts;
  return {...view,serverNow:timestamp(),standings:Object.fromEntries(['A','B','C'].map(d=>[d,standings(s,d)]))};
}
export function apply(s,action,data,seed){
  const div=data.division||s.division,d=s.divisions[div],t=active(s);check(d,'Choose Division A, B or C.');
  const started=key=>s.turns.some(t=>t.division===key);
  if(action==='division'){check(!t,'Complete the current participant before changing divisions.');s.division=div;}
  else if(action==='confirm_panel'){check(!started(div),'Panel is fixed after the first draw.');check(panel(s,div).length>=2,'Assign at least two judges.');d.confirmed=true;}
  else if(action==='roster'){
    check(!started(div),'Roster is fixed after the first draw.');const rows=data.participants;check(Array.isArray(rows)&&rows.length>=1&&rows.length<=100,'Use 1–100 participants.');
    const parsed=rows.map(p=>({id:uid(),name:text(p?.name,120,'Name'),fullName:text(p?.fullName||p?.name,180,'Full name'),group:text(p?.group||'',80,'Grade',true)}));
    check(new Set(parsed.map(p=>p.name.toLowerCase())).size===parsed.length,'Participant names must be distinct.');d.participants=parsed;d.confirmed=false;
  }else if(action==='topics'){
    check(!started(div),'Topic pool is fixed after the first draw.');const rows=data.topics;check(Array.isArray(rows)&&rows.length>=d.participants.length&&rows.length<=200,'Provide at least one topic per participant (maximum 200).');
    const parsed=rows.map(r=>text(r,1000,'Topic'));check(new Set(parsed).size===parsed.length,'Topics must be distinct.');d.topics=parsed.map(v=>({id:uid(),text:v}));
  }else if(action==='judges'){
    const rows=data.judges;check(Array.isArray(rows)&&rows.length>=2&&rows.length<=20,'Use 2–20 judges.');
    const parsed=rows.map(j=>{
      check(j&&Array.isArray(j.divisions)&&j.divisions.length&&j.divisions.every(x=>['A','B','C'].includes(x)),'Assign each judge to A, B and/or C.');
      return {id:text(j.id||uid(),80,'Judge ID'),name:text(j.name,120,'Judge name'),description:text(j.description||'',120,'Role',true),divisions:[...new Set(j.divisions)].sort()};
    });
    check(new Set(parsed.map(j=>j.id)).size===parsed.length&&new Set(parsed.map(j=>j.name.toLowerCase())).size===parsed.length,'Judge names and IDs must be distinct.');
    for(const k of ['A','B','C']){
      const summarize=rows=>rows.filter(j=>j.divisions.includes(k)).map(({id,name,description})=>({id,name,description})).sort((a,b)=>a.id.localeCompare(b.id));
      if(started(k))check(JSON.stringify(summarize(parsed))===JSON.stringify(summarize(s.judges)),`Division ${k} panel is fixed after its first draw.`);
      else s.divisions[k].confirmed=false;
    }s.judges=parsed;
  }else if(action==='draw_participant'){
    check(!t,'A participant is already active. Complete that turn first.',409);check(div===s.division,'Select this division first.');check(d.confirmed,'Review names and confirm this panel first.');check(!d.published,'This division’s results are already published.');
    const used=new Set(s.turns.filter(t=>t.division===div).map(t=>t.participantId)),pool=d.participants.filter(p=>!used.has(p.id));check(pool.length,'All participants in this division have spoken.');
    const turn={id:uid(),division:div,participantId:randomPick(pool).id,topic:null,scores:{},panel:panel(s,div).map(j=>j.id),status:'active',drawnAt:timestamp(),timer:{phase:'preparation',duration:s.settings.prepSeconds,remaining:s.settings.prepSeconds,running:false,endsAt:null}};
    s.turns.push(turn);s.active=turn.id;
  }else if(action==='draw_topic'){
    check(t&&t.division===div&&!t.topic,'Draw one topic for the current participant only.',409);
    check(data.turnId===t.id,'The active participant changed.',409);
    const used=new Set(s.turns.filter(x=>x.division===div&&x.topic).map(x=>x.topic.id)),pool=d.topics.filter(x=>!used.has(x.id));check(pool.length,'No unused topics remain.');t.topic=clone(randomPick(pool));
  }else if(action==='timer'){
    check(t&&t.topic,'Draw the topic before operating the timer.');check(data.turnId===t.id,'The active participant changed.',409);const timer=t.timer,op=data.operation;
    if(op==='phase'){
      check(['preparation','speech'].includes(data.phase),'Choose a timer phase.');check(!timer.running,'Pause before changing the timer phase.');
      if(s.live?.turnId===t.id&&s.live.scene===timer.phase)s.live.timer={...clone(timer),remaining:remaining(timer),running:false,endsAt:null};
      const duration=s.settings[data.phase==='speech'?'speechSeconds':'prepSeconds'];t.timer={phase:data.phase,duration,remaining:duration,running:false,endsAt:null};
    }else if(op==='start'){check(!timer.running,'Timer is already running.',409);Object.assign(timer,{running:true,endsAt:timestamp()+timer.remaining});}
    else if(op==='pause'){check(timer.running,'Timer is already paused.',409);Object.assign(timer,{remaining:remaining(timer),running:false,endsAt:null});}
    else if(op==='reset'){check(data.confirm===true,'Confirm resetting the timer.');Object.assign(timer,{remaining:timer.duration,running:false,endsAt:null});}
    else throw new Problem('Unknown timer operation.');
  }else if(action==='score'){
    check(t&&data.turnId===t.id&&t.topic,'This participant is no longer accepting scores.',409);check(t.panel.includes(data.judgeId),'This judge is not on the current panel.');check(!t.scores[data.judgeId],'This judge’s score is already submitted and locked.',409);
    const values=data.values;check(Array.isArray(values)&&values.length===10&&values.every(v=>typeof v==='number'&&[.25,.5,.75,1].includes(v)),'Select 0.25, 0.50, 0.75 or 1.00 for each of the ten criteria.');
    check(data.confirmIdentity===data.judgeId,'Confirm the selected judging identity before submitting.');
    t.scores[data.judgeId]={values:[...values],note:text(data.note||'',1000,'Notes',true),at:timestamp()};
  }else if(action==='complete'){
    check(t&&data.turnId===t.id,'The active participant changed.',409);check(Object.keys(t.scores).length===t.panel.length,'Wait until every assigned judge has submitted.');
    if(t.timer.running)Object.assign(t.timer,{remaining:remaining(t.timer),running:false,endsAt:null});Object.assign(t,{status:'complete',completedAt:timestamp()});s.active=null;
  }else if(action==='take_live')s.live=scene(s,data);
  else if(action==='publish'){
    check(data.confirm===`PUBLISH ${div}`,`Type PUBLISH ${div} to publish results.`);check(!t||t.division!==div,'Complete the current participant first.');const rows=standings(s,div);
    check(rows.length===d.participants.length&&rows.length,'Every participant needs all panel scores before publication.');check(!d.published,'Results are already published.',409);d.published={at:timestamp(),rows};
  }else if(action==='settings'){
    const settings=data.settings;check(settings&&typeof settings==='object'&&!Array.isArray(settings),'Settings must be an object.');
    const allowed=['title','logo','stageLogo','accent','highlight','transition','prepSeconds','speechSeconds','minimumSeconds'];check(Object.keys(settings).every(k=>allowed.includes(k)),'Unknown setting.');
    for(const[k,v]of Object.entries(settings)){
      if(['prepSeconds','speechSeconds','minimumSeconds'].includes(k)){check(!s.turns.length,'Timing rules are fixed after the first draw.');s.settings[k]=number(v,1,3600,'Duration');}
      else if(['accent','highlight'].includes(k)){check(typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v),'Choose a six-digit colour.');s.settings[k]=v;}
      else if(k==='transition'){check(['none','fade','logo'].includes(v),'Choose none, fade or logo.');s.settings[k]=v;}
      else{const v2=text(v,k==='title'?120:200000,k);if(k!=='title')check(['assets/logo-blue.svg','assets/logo-white.svg','assets/anniversary.png'].includes(v2)||/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v2),'Use a bundled logo or upload a PNG, JPEG or WebP.');s.settings[k]=v2;}
    }check(s.settings.minimumSeconds<=s.settings.speechSeconds,'Minimum speech time cannot exceed the maximum.');
  }else if(action==='reset'){
    check(data.confirm==='RESET '+s.code,'Type RESET followed by the current event code.');
    const replacement=initial(seed,s.code);replacement.revision=s.revision;replacement.settings=clone(s.settings);replacement.receipts=clone(s.receipts);
    replacement.archives=[...s.archives,{id:String(s.revision),created:timestamp(),generation:s.generation}];
    for(const key of Object.keys(s))delete s[key];Object.assign(s,replacement);
  }else throw new Problem('Unknown action.',404);
  return s;
}
export async function fingerprint(value){
  // Canonical JSON prevents key-order differences in an identical retry.
  const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(stable(value))));return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
}
export class ContestService{
  constructor(repository){this.repo=repository;}
  async read(code){const s=await this.repo.latest();check(s,'Initialize the event in Admin first.',404);check(!code||s.code===code,'This event code is not current.',404);return s;}
  async initialize(code){
    code=text(code,12,'Event code').toUpperCase();check(/^[A-Z0-9-]{4,12}$/.test(code),'Use 4–12 letters, digits or hyphens.');check(!await this.repo.latest(),'An event already exists. Resume it in Admin.',409);
    const s=initial(await this.repo.program(),code);try{await this.repo.insert(s,'initialize');}catch(e){if(await this.repo.latest())throw new Problem('An event already exists. Resume it in Admin.',409);throw e;}return s;
  }
  async command(code,payload){
    check(payload&&typeof payload==='object'&&!Array.isArray(payload),'A JSON object is required.');const requestId=text(payload.requestId,80,'Request ID');check(/^[A-Za-z0-9-]{8,80}$/.test(requestId),'Invalid request ID.');
    const hash=await fingerprint([code,payload]);
    for(let attempt=0;attempt<6;attempt++){
      const s=await this.read(code);
      if(Object.hasOwn(s.receipts,requestId)){check(s.receipts[requestId]===hash,'This request ID was already used for another action.',409);return s;}
      check(payload.generation===s.generation,'This is a different event. Reconnect before continuing.',409);
      if(payload.action!=='score')check(Number.isInteger(payload.revision)&&payload.revision===s.revision,'The event changed on another screen. Review the latest state and try again.',409);
      check(payload.data&&typeof payload.data==='object'&&!Array.isArray(payload.data),'Action data must be an object.');
      const seed=payload.action==='reset'?await this.repo.program():null;
      apply(s,payload.action,payload.data,seed);s.revision++;s.receipts[requestId]=hash;
      s.audit.push({at:timestamp(),action:payload.action,requestId,judge:payload.action==='score'?payload.data.judgeId:null});
      check(new TextEncoder().encode(JSON.stringify(s)).length<450000,'This event snapshot is too large. Use smaller logo images or shorter notes.');
      try{await this.repo.insert(s,payload.action);return s;}catch(e){
        const latest=await this.repo.latest();
        if(!latest||latest.revision<s.revision)throw e;
        if(payload.action!=='score'&&!Object.hasOwn(latest.receipts,requestId))throw new Problem('Another screen saved first. Review the latest state before trying again.',409);
      }
    }throw new Problem('Other judges are saving at the same time. Retry this same submission.',503);
  }
}
