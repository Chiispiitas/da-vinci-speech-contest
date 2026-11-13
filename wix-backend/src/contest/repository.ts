// This module is server-only. Collection IDs and queries are fixed, never supplied by browsers.
// SDK contracts: docs/api-reference/business-solutions/cms/data-items/{query-data-items,insert-data-item}
import { items } from '@wix/data';
import { auth } from '@wix/essentials';
const REVISIONS='DaVinciContestRevisions';
const PROGRAM='DaVinciContestProgram';
const query=auth.elevate(items.query);
const insert=auth.elevate(items.insert);
export class WixRepository{
  async latest(){
    const result=await query(REVISIONS,{sort:[{fieldName:'revision',order:'DESC'}],paging:{limit:1}},{consistentRead:true});
    const row=result.items?.[0] as any;return row?JSON.parse(row.stateJson):null;
  }
  async program(){
    const result=await query(PROGRAM,{filter:{_id:{$eq:'program'}},paging:{limit:1}},{consistentRead:true});
    const row=result.items?.[0] as any;if(!row)throw new Error('The school program has not been loaded into Wix CMS.');return JSON.parse(row.stateJson);
  }
  async revision(id:number){
    const result=await query(REVISIONS,{filter:{revision:{$eq:id}},paging:{limit:1}},{consistentRead:true});
    const row=result.items?.[0] as any;return row?JSON.parse(row.stateJson):null;
  }
  async insert(state:any,action:string){
    // Create-only insert with deterministic _id is the atomic compare-and-swap.
    // A duplicate ID fails; no update/upsert or in-memory mutex is used.
    return insert(REVISIONS,{_id:`dv-${String(state.revision).padStart(12,'0')}`,revision:state.revision,
      stateJson:JSON.stringify(state),generation:state.generation,action,createdAt:Date.now()/1000});
  }
}
