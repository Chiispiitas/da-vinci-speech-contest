import {check,clone,text,timestamp} from './core.mjs';
export const SPECIAL_AWARDS={pronunciation:'Best pronunciation',creative:'Most creative',presence:'Best stage presence'};
export const specialState=s=>s.specialAwards||{panel:[],divisions:Object.fromEntries(['A','B','C'].map(d=>[d,{votes:{},published:null}]))};
export const completedParticipants=(s,division)=>s.divisions[division].participants.filter(p=>s.turns.some(t=>t.division===division&&t.participantId===p.id&&t.status==='complete'));
export function specialTally(s,division){
 const special=specialState(s),v=special.divisions[division],people=s.divisions[division].participants;
 return Object.fromEntries(Object.keys(SPECIAL_AWARDS).map(award=>[award,people.map(p=>({participantId:p.id,name:p.name,votes:Object.values(v.votes).filter(ballot=>ballot.choices[award]===p.id).length})).sort((a,b)=>b.votes-a.votes||a.name.localeCompare(b.name))]));
}
export function specialProjection(s,judgeId){
 const special=specialState(s);
 return {judges:clone(special.panel),awards:SPECIAL_AWARDS,divisions:Object.fromEntries(Object.entries(s.divisions).map(([division,d])=>[division,{label:d.label,ready:completedParticipants(s,division).length===d.participants.length,participants:d.participants.map(({id,name,group})=>({id,name,group})),myVote:clone(special.divisions[division].votes[judgeId]||null),published:clone(special.divisions[division].published)}]))};
}
export function applySpecial(s,action,data){
 const division=data.division||s.division;check(['A','B','C'].includes(division),'Choose Division A, B or C.');
 const special=clone(specialState(s)),d=special.divisions[division];
 if(action==='special_panel'){
  check(Array.isArray(data.judges)&&data.judges.length<=20,'Use up to 20 special-award judges.');
  const parsed=data.judges.map(j=>{
   check(Array.isArray(j.divisions)&&j.divisions.length&&j.divisions.every(d=>['A','B','C'].includes(d)),'Assign each judge to A, B and/or C.');
   const id=text(j.id,80,'Judge ID');check(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(id)&&!['constructor','prototype'].includes(id),'Use letters, numbers and hyphens for judge IDs.');
   return {id,name:text(j.name,120,'Judge name'),description:text(j.description||'',120,'Role',true),divisions:[...new Set(j.divisions)].sort()};
  });
  check(new Set(parsed.map(j=>j.id)).size===parsed.length&&new Set(parsed.map(j=>j.name.toLowerCase())).size===parsed.length,'Judge names and IDs must be distinct.');
  for(const key of ['A','B','C'])if(Object.keys(special.divisions[key].votes).length||special.divisions[key].published){
   const rows=panel=>panel.filter(j=>j.divisions.includes(key)).sort((a,b)=>a.id.localeCompare(b.id));
   check(JSON.stringify(rows(parsed))===JSON.stringify(rows(special.panel)),`Division ${key} special-award panel is fixed after its first vote.`);
  }
  special.panel=parsed;
 }else if(action==='special_vote'){
  check(data.confirmIdentity===data.judgeId,'Confirm your judging identity.');
  check(special.panel.some(j=>j.id===data.judgeId&&j.divisions.includes(division)),'This judge is not assigned to this special-award panel.');
  check(!d.published,'Special awards are already published.',409);check(!Object.hasOwn(d.votes,data.judgeId),'Your special-award votes are already submitted.',409);
  check(completedParticipants(s,division).length===s.divisions[division].participants.length,'Complete all speeches in this division before voting.');
  check(data.choices&&typeof data.choices==='object'&&!Array.isArray(data.choices)&&Object.keys(data.choices).length===3,'Choose one participant for each of the three awards.');
  const choices={};for(const award of Object.keys(SPECIAL_AWARDS)){check(s.divisions[division].participants.some(p=>p.id===data.choices[award]),'Choose a valid participant for every award.');choices[award]=data.choices[award];}
  d.votes[data.judgeId]={choices,at:timestamp()};
 }else if(action==='special_publish'){
  check(data.confirm===`PUBLISH SPECIAL ${division}`,'Confirm publication of the special awards.');check(!d.published,'Special awards are already published.',409);
  const panel=special.panel.filter(j=>j.divisions.includes(division));check(panel.length&&panel.every(j=>Object.hasOwn(d.votes,j.id)),'Every assigned special-award judge must submit their votes.');
  const tally=specialTally({...s,specialAwards:special},division),winners={};
  for(const award of Object.keys(SPECIAL_AWARDS)){
   const top=tally[award][0].votes,candidates=tally[award].filter(p=>p.votes===top),id=data.winners?.[award]||(candidates.length===1?candidates[0].participantId:null);
   check(candidates.some(p=>p.participantId===id),`Resolve the tie for ${SPECIAL_AWARDS[award]} with the panel before publishing.`);
   winners[award]={...clone(candidates.find(p=>p.participantId===id)),label:SPECIAL_AWARDS[award],tied:candidates.length>1};
  }
  d.published={at:timestamp(),winners};
 }else return false;
 s.specialAwards=special;return true;
}
