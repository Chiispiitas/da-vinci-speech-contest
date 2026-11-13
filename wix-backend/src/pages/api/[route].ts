import type { APIRoute } from 'astro';
import { ContestService, Problem, check, project } from '../../contest/core.mjs';
import { WixRepository } from '../../contest/repository';
export const prerender=false;
const repository=new WixRepository();
const service=new ContestService(repository);
const ALLOWED_ORIGINS=new Set(['https://chiispiitas.github.io','http://127.0.0.1:8765','http://localhost:8765']);
export const ALL:APIRoute=async({request,params,url})=>{
  const origin=request.headers.get('Origin');
  const headers:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  if(origin&&ALLOWED_ORIGINS.has(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'});
  const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
  try{
    check(!origin||ALLOWED_ORIGINS.has(origin)||origin===url.origin,'This origin is not configured for the contest.',403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    const route=params.route,code=(url.searchParams.get('code')||'').toUpperCase();
    if(request.method==='GET'){
      if(route==='session'){const state=await repository.latest();return response(state?{initialized:true,code:state.code}:{initialized:false});}
      const state=await service.read(code);
      if(['admin','judge','emcee','audience'].includes(route||''))return response(project(state,route,url.searchParams.get('judge')));
      if(route==='export')return response(project(state));
      if(route==='archives')return response(state.archives.map(({id,created}:any)=>({id,created})));
      if(route==='archive'){
        const id=url.searchParams.get('id');check(state.archives.some((a:any)=>a.id===id),'Archive not found.',404);
        const archived=await repository.revision(Number(id));check(archived,'Archive not found.',404);return response(project(archived));
      }
    }
    if(request.method==='POST'&&['initialize','command'].includes(route||'')){
      check(request.headers.get('Content-Type')?.split(';')[0]==='application/json','Use application/json.',415);
      const length=request.headers.get('Content-Length');if(length)check(Number(length)<=600000,'Request is too large.',413);
      const raw=await request.text();check(raw.length<=600000,'Request is too large.',413);
      let payload;try{payload=JSON.parse(raw);}catch{throw new Problem('Invalid JSON.');}
      const state=route==='initialize'?await service.initialize(payload?.code):await service.command(code,payload);
      return response(payload.action==='score'?project(state,'judge',payload.data.judgeId):project(state));
    }
    throw new Problem('Route not found.',404);
  }catch(error){
    if(error instanceof Problem)return response({error:error.message},error.status);
    console.error('Contest API error',error);
    return response({error:'The server could not confirm this change. Retry the same request.'},500);
  }
};
