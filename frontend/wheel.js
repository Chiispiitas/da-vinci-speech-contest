/* One synchronized wheel timeline for Admin and audience. The server chooses the result. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ContestWheel=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const TAU=Math.PI*2;
  function resolve(cue,now){return cue?.wheel&&!cue.wheel.pending&&now>=cue.wheel.finishAt?cue.after:cue;}
  function rotation(wheel,now,reduced=false){
    if(wheel.pending)return 0;
    const count=wheel.entries.length;
    const center=(wheel.selectedIndex+.5)*TAU/count;
    const landing=(((-Math.PI/2-center)%TAU)+TAU)%TAU;
    const end=(wheel.rotations||6)*TAU+landing;
    const progress=Math.max(0,Math.min(1,(now-wheel.startedAt)/(wheel.endsAt-wheel.startedAt)));
    return (reduced?end:end*(1-Math.pow(1-progress,4)))*180/Math.PI;
  }
  // A scene preview must be useful before a server-selected draw exists.
  // This private pool has no selected result and can never start an animation.
  function poolPreview(state,division,kind){
    const d=state.divisions[division];if(!d||!['participant','topic'].includes(kind))return null;
    const turns=state.turns.filter(t=>t.division===division&&t.status!=='cancelled');
    const used=new Set(turns.map(t=>kind==='participant'?t.participantId:t.topic?.id).filter(Boolean));
    const pool=(kind==='participant'?d.participants:d.topics).filter(row=>!used.has(row.id));
    const entries=pool.map(row=>({id:row.id,label:kind==='participant'?row.name:`Topic ${String(d.topics.findIndex(topic=>topic.id===row.id)+1).padStart(2,'0')}`}));
    return {id:`pool-${kind}-${division}`,scene:kind+'_wheel',division,label:d.label,
      wheel:entries.length?{id:`pool-${kind}-${division}`,kind,entries,previewOnly:true,pending:true,selectedIndex:-1,startedAt:null,endsAt:null,finishAt:null}:null};
  }
  function paint(canvas,wheel){
    const ctx=canvas.getContext('2d');if(!ctx)return;
    const size=1000,center=size/2,radius=474,n=wheel.entries.length;
    const colors=['#2159A6','#123B75','#3579B9','#0E2C55','#A77F1F','#407C9A'];
    ctx.clearRect(0,0,size,size);
    for(let i=0;i<n;i++){
      const a=i*TAU/n,b=(i+1)*TAU/n;
      ctx.beginPath();ctx.moveTo(center,center);ctx.arc(center,center,radius,a,b);ctx.closePath();
      ctx.fillStyle=colors[i%colors.length];ctx.fill();ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=2;ctx.stroke();
      ctx.save();ctx.translate(center,center);ctx.rotate((a+b)/2);ctx.textAlign='right';ctx.textBaseline='middle';
      ctx.fillStyle='#FFFFFF';ctx.font=`600 ${Math.max(12,Math.min(31,42-n))}px Arial, sans-serif`;
      const name=wheel.entries[i].label;
      ctx.fillText(name.length>27?name.slice(0,26)+'…':name,radius-30,0,radius-130);ctx.restore();
    }
    ctx.beginPath();ctx.arc(center,center,radius,0,TAU);ctx.strokeStyle='#F2C94C';ctx.lineWidth=12;ctx.stroke();
  }
  return {resolve,rotation,paint,poolPreview};
});
