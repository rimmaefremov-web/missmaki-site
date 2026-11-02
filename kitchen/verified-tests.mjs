// Exact synthetic record created by the final integration test. Never match by a name pattern.
const verified=[{id:'86fcce66-7031-4d28-bebf-1b67ddfbfedb',request_id:'c5a643cf-c8fb-484e-a907-208e04d25733',name:'АВТОТЕСТ ФИНАЛ — НЕ ГОТОВИТЬ'}];
export async function archiveVerifiedTests(data,rpc){
 let count=0;
 for(const record of verified){const row=data.orders.find(o=>o.id===record.id&&o.request_id===record.request_id&&o.name===record.name);if(!row||row.is_test)continue;await rpc('set_test_record',{p_entity:'order',p_id:record.id,p_test:true});count++;}
 return count;
}
