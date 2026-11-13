import test from 'node:test';
import assert from 'node:assert/strict';
import {ContestService,Problem,project,active,remaining} from '../wix-backend/src/contest/core.mjs';

const fixture=()=>({source:'Synthetic test fixture',notes:[],criteria:Array.from({length:10},(_,i)=>({id:String(i+1),name:`Criterion ${i+1}`,descriptors:{}})),judges:[{id:'one',name:'Judge One',description:'Test',divisions:['A','B','C']},{id:'two',name:'Judge Two',description:'Test',divisions:['A','B','C']}],divisions:Object.fromEntries(['A','B','C'].map(d=>[d,{label:`Division ${d}`,emcee:'Test Emcee',schedule:['08:00','08:10','08:55','09:00','09:10'],participants:[{id:d+'1',name:'First '+d,fullName:'First Student '+d,group:'Grade 8'},{id:d+'2',name:'Second '+d,fullName:'Second Student '+d,group:'Grade 9'}],topics:[{id:d+'T1',text:'PRIVATE FUTURE TOPIC '+d+' ONE'},{id:d+'T2',text:'PRIVATE FUTURE TOPIC '+d+' TWO'}]}]))});
class MemoryRepo{
  rows=new Map();failAfterSave=false;
  async latest(){await Promise.resolve();return this.rows.size?structuredClone(this.rows.get(Math.max(...this.rows.keys()))):null;}
  async program(){return fixture();}
  async revision(id){return structuredClone(this.rows.get(id));}
  async insert(s){await Promise.resolve();if(this.rows.has(s.revision))throw new Error('Duplicate revision ID');this.rows.set(s.revision,structuredClone(s));if(this.failAfterSave){this.failAfterSave=false;throw new Error('Network lost after commit');}}
}
async function context(){const repo=new MemoryRepo(),service=new ContestService(repo);await service.initialize('TEST26');return {repo,service};}
async function payload(service,action,data={}){const s=await service.read('TEST26');return {requestId:crypto.randomUUID(),revision:s.revision,generation:s.generation,action,data};}
async function command(service,action,data={}){return service.command('TEST26',await payload(service,action,data));}
async function draw(service){await command(service,'confirm_panel');await command(service,'draw_participant');const s=await service.read('TEST26');await command(service,'draw_topic',{turnId:s.active});return active(await service.read('TEST26'));}
const score=(t,judgeId,value=1)=>({turnId:t.id,judgeId,confirmIdentity:judgeId,values:Array(10).fill(value),note:'Private judge note'});
async function complete(service,t){await command(service,'score',score(t,'one'));await command(service,'score',score(t,'two',.75));await command(service,'complete',{turnId:t.id});}

test('initialization is persistent, singleton, and codes are validated',async()=>{
  const {service,repo}=await context();assert.equal((await new ContestService(repo).read('TEST26')).turns.length,0);
  await assert.rejects(service.initialize('OTHER'),{status:409});await assert.rejects(service.initialize('<bad>'),{status:422});
});
test('concurrent initialization creates just one event',async()=>{
  const repo=new MemoryRepo(),service=new ContestService(repo);const r=await Promise.allSettled([service.initialize('TEST26'),service.initialize('DIFFERENT')]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(repo.rows.size,1);
});
test('a draw requires an explicit reviewed panel',async()=>{
  const {service}=await context();await assert.rejects(command(service,'draw_participant'),{status:422});assert.equal((await service.read('TEST26')).turns.length,0);
});
test('two simultaneous participant draws commit only one',async()=>{
  const {service}=await context();await command(service,'confirm_panel');const a=await payload(service,'draw_participant'),b=await payload(service,'draw_participant');const r=await Promise.allSettled([service.command('TEST26',a),service.command('TEST26',b)]);
  assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal((await service.read('TEST26')).turns.length,1);assert.equal(r.find(x=>x.status==='rejected').reason.status,409);
});
test('identical retry is idempotent, conflicting reuse fails',async()=>{
  const {service}=await context();await command(service,'confirm_panel');const p=await payload(service,'draw_participant');const first=await service.command('TEST26',p),second=await service.command('TEST26',p);assert.equal(first.active,second.active);assert.equal(first.revision,second.revision);
  await assert.rejects(service.command('TEST26',{...p,action:'division'}),{status:409});
});
test('a lost response after commit is safely recovered',async()=>{
  const {service,repo}=await context();await command(service,'confirm_panel');const p=await payload(service,'draw_participant');repo.failAfterSave=true;await service.command('TEST26',p);await service.command('TEST26',p);assert.equal((await service.read('TEST26')).turns.length,1);
});
test('stale control updates cannot overwrite newer state',async()=>{
  const {service}=await context();const p=await payload(service,'settings',{settings:{title:'Old title'}});await command(service,'settings',{settings:{title:'New title'}});await assert.rejects(service.command('TEST26',p),{status:409});assert.equal((await service.read('TEST26')).settings.title,'New title');
});
test('topic draws do not repeat and a turn cannot draw twice',async()=>{
  const {service}=await context(),t=await draw(service);await assert.rejects(command(service,'draw_topic',{turnId:t.id}),{status:409});await complete(service,t);await command(service,'draw_participant');let s=await service.read('TEST26');await command(service,'draw_topic',{turnId:s.active});s=await service.read('TEST26');assert.notEqual(s.turns[0].topic.id,s.turns[1].topic.id);assert.notEqual(s.turns[0].participantId,s.turns[1].participantId);
});
test('scores validate all ten exact rubric increments and reject fabricated judges',async()=>{
  const {service}=await context(),t=await draw(service);
  for(const values of [[],Array(10).fill(0),Array(10).fill(1.25),Array(10).fill('1'),Array(10).fill(NaN),Array(9).fill(1),Array(10).fill(true)])await assert.rejects(command(service,'score',{...score(t,'one'),values}),{status:422});
  await assert.rejects(command(service,'score',score(t,'not-on-panel')),{status:422});assert.deepEqual(active(await service.read('TEST26')).scores,{});
});
test('same judge cannot submit twice, even with different request IDs',async()=>{
  const {service}=await context(),t=await draw(service);await command(service,'score',score(t,'one'));await assert.rejects(command(service,'score',score(t,'one',.25)),{status:409});assert.equal(active(await service.read('TEST26')).scores.one.values[0],1);
});
test('judges can submit concurrently without losing a score',async()=>{
  const {service}=await context(),t=await draw(service),p1=await payload(service,'score',score(t,'one')),p2=await payload(service,'score',score(t,'two'));
  await Promise.all([service.command('TEST26',p1),service.command('TEST26',p2)]);assert.equal(Object.keys(active(await service.read('TEST26')).scores).length,2);
});
test('score retries tolerate unrelated scene and timer revisions',async()=>{
  const {service}=await context(),t=await draw(service),p=await payload(service,'score',score(t,'one'));await command(service,'timer',{operation:'start',turnId:t.id});await service.command('TEST26',p);assert.ok(active(await service.read('TEST26')).scores.one);
});
test('an old turn cannot receive a score after completion',async()=>{
  const {service}=await context(),t=await draw(service);await complete(service,t);await command(service,'draw_participant');await assert.rejects(command(service,'score',score(t,'one')),{status:409});
});
test('panel changes and roster changes are locked after first draw',async()=>{
  const {service}=await context();await draw(service);await assert.rejects(command(service,'roster',{participants:[{name:'Changed'}]}),{status:422});const s=await service.read('TEST26');s.judges[0].name='Changed judge';await assert.rejects(command(service,'judges',{judges:s.judges}),{status:422});
});
test('completion requires every assigned judge; average is the mean of judge totals',async()=>{
  const {service}=await context(),t=await draw(service);await assert.rejects(command(service,'complete',{turnId:t.id}),{status:422});await complete(service,t);assert.equal(project(await service.read('TEST26')).standings.A[0].average,8.75);
});
test('audience payload excludes future topics, roster full names, scores and notes',async()=>{
  const {service}=await context(),t=await draw(service);await command(service,'score',score(t,'one'));let s=await service.read('TEST26');assert.equal(JSON.stringify(project(s,'audience')).includes('PRIVATE FUTURE'),false);
  await command(service,'take_live',{scene:'participant_draw',division:'A',turnId:t.id});s=await service.read('TEST26');assert.equal(JSON.stringify(project(s,'audience')).includes('PRIVATE FUTURE'),false);
  await command(service,'take_live',{scene:'topic_draw',division:'A',turnId:t.id});s=await service.read('TEST26');const view=project(s,'audience'),serialized=JSON.stringify(view);assert.equal(view.live.topic,t.topic.text);assert.ok(!serialized.includes('Private judge note'));assert.ok(!serialized.includes('scores'));assert.ok(!serialized.includes('fullName'));const other=s.divisions.A.topics.find(x=>x.id!==t.topic.id);assert.ok(!serialized.includes(other.text));
});
test('judge projection includes only that judge’s own submitted score',async()=>{
  const {service}=await context(),t=await draw(service);await command(service,'score',score(t,'one'));const s=await service.read('TEST26');assert.ok(project(s,'judge','one').current.myScore);assert.equal(project(s,'judge','two').current.myScore,null);assert.ok(!JSON.stringify(project(s,'judge','two')).includes('Private judge note'));
});
test('unpublished leaderboards cannot be taken live and publish needs full scoring and explicit confirmation',async()=>{
  const {service}=await context();await assert.rejects(command(service,'take_live',{scene:'awards'}),{status:422});await assert.rejects(command(service,'publish',{confirm:'PUBLISH A'}),{status:422});await assert.rejects(command(service,'publish'),{status:422});
});
test('ties share places and published results are frozen',async()=>{
  const {service}=await context();const t=await draw(service);await complete(service,t);await command(service,'draw_participant');let s=await service.read('TEST26');await command(service,'draw_topic',{turnId:s.active});await complete(service,active(await service.read('TEST26')));await command(service,'publish',{confirm:'PUBLISH A'});s=await service.read('TEST26');assert.deepEqual(s.divisions.A.published.rows.map(r=>r.rank),[1,1]);await command(service,'take_live',{scene:'awards'});assert.equal(project(await service.read('TEST26'),'audience').live.results.length,2);await assert.rejects(command(service,'publish',{confirm:'PUBLISH A'}),{status:409});
});
test('timer uses server deadlines, pauses accurately and survives re-instantiation',async()=>{
  const {service,repo}=await context(),t=await draw(service);await command(service,'timer',{operation:'start',turnId:t.id});const s=await new ContestService(repo).read('TEST26'),timer=active(s).timer;assert.ok(remaining(timer)<=60&&remaining(timer)>58);await command(service,'timer',{operation:'pause',turnId:t.id});assert.equal(active(await service.read('TEST26')).timer.running,false);
});
test('switching to speech freezes the currently live preparation scene until Take live',async()=>{
  const {service}=await context(),t=await draw(service);await command(service,'take_live',{scene:'preparation',turnId:t.id});await command(service,'timer',{operation:'start',turnId:t.id});await command(service,'timer',{operation:'pause',turnId:t.id});await command(service,'timer',{operation:'phase',phase:'speech',turnId:t.id});const view=project(await service.read('TEST26'),'audience');assert.equal(view.live.scene,'preparation');assert.equal(view.live.timer.running,false);assert.equal(view.live.timer.phase,'preparation');
});
test('taking a stale participant preview live is rejected',async()=>{
  const {service}=await context();await draw(service);await assert.rejects(command(service,'take_live',{scene:'participant_draw',turnId:'stale'}),{status:409});
});
test('reset archives the preceding revision, rotates generation and rejects old submissions',async()=>{
  const {service,repo}=await context(),t=await draw(service),old=await payload(service,'score',score(t,'one'));await assert.rejects(command(service,'reset',{confirm:'RESET wrong'}),{status:422});const before=await service.read('TEST26');await command(service,'reset',{confirm:'RESET TEST26'});const after=await service.read('TEST26');assert.notEqual(before.generation,after.generation);assert.equal(after.turns.length,0);assert.equal(after.live,null);assert.equal(after.archives[0].id,String(before.revision));assert.equal((await repo.revision(Number(after.archives[0].id))).turns.length,1);await assert.rejects(service.command('TEST26',old),{status:409});
});
test('settings reject arbitrary URLs, scripts, unknown fields and invalid timing',async()=>{
  const {service}=await context();for(const settings of [{stageLogo:'https://attacker.example/logo.svg'},{accent:'red'},{school:'Other school'},{minimumSeconds:200,speechSeconds:180}])await assert.rejects(command(service,'settings',{settings}),{status:422});assert.equal((await service.read('TEST26')).settings.minimumSeconds,120);
});
