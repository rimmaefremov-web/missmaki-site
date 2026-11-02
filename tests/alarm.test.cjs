const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function setup(saved){
 let now=0,next=0,active=0,maxActive=0;const jobs=new Map(),clips=[],storage=new Map(saved?Object.entries(saved):[]);
 const parameter=()=>({value:0,setValueAtTime(value){this.value=value;},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
 class Context{
  constructor(){this.state='suspended';this.destination={};this.currentTime=0;}
  resume(){this.state='running';this.onstatechange?.();return Promise.resolve();}
  createGain(){return {gain:parameter(),connect(){},disconnect(){}};}
  createOscillator(){const ctx=this;let endJob,stopped=false;const osc={frequency:parameter(),connect(){},disconnect(){},start(){active++;maxActive=Math.max(maxActive,active);clips.push({time:now,osc});},stop(at){if(at!==undefined){endJob=++next;jobs.set(endJob,{at:now+(at-ctx.currentTime)*1000,fn:()=>finish()});}else finish();}};function finish(){if(stopped)return;stopped=true;active--;if(endJob)jobs.delete(endJob);osc.onended?.();}return osc;}
 }
 const window={AudioContext:Context},elements=Object.fromEntries(['button','signal','volume','output','status'].map(k=>[k,{textContent:'',value:''}]));
 vm.runInNewContext(fs.readFileSync('kitchen/alarm.js','utf8'),{window,Date:{now:()=>now},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},setTimeout:(fn,ms)=>{const id=++next;jobs.set(id,{at:now+ms,fn});return id;},clearTimeout:id=>jobs.delete(id)});
 const alarm=new window.MMKitchenAlarm(elements);
 function advance(ms){const target=now+ms;let n=0;while(true){const due=[...jobs].filter(([,job])=>job.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;if(n++>1000)throw Error('Timer loop');now=due[1].at;jobs.delete(due[0]);due[1].fn();}now=target;}
 return {alarm,elements,clips,advance,storage,active:()=>active,maxActive:()=>maxActive};
}
test('new orders ring immediately after permission, every 30 seconds, with no overlap or dismissal',async()=>{
 const s=setup();s.alarm.setPending(['a']);assert.equal(s.clips.length,0);await s.alarm.enable(true);assert.equal(s.clips.length,1);
 s.alarm.setPending(['a','b']);await s.alarm.enable(true);assert.equal(s.clips.length,1);s.advance(29999);assert.equal(s.clips.length,1);s.advance(1);assert.equal(s.clips.length,2);
 s.alarm.resolved('a');s.advance(30000);assert.equal(s.clips.length,3);assert.equal(s.maxActive(),1);
 s.alarm.resolved('b');assert.equal(s.active(),0);s.advance(90000);assert.equal(s.clips.length,3);
});
test('queue reads and connectivity recovery preserve pending; authoritative removal cancels immediately',async()=>{
 const s=setup();await s.alarm.enable(true);s.advance(2000);s.alarm.setPending(['order']);assert.equal(s.clips.length,2);
 s.advance(29000);s.alarm.setPending(['order']);s.advance(1000);assert.equal(s.clips.length,3);
 s.alarm.recover();assert.equal(s.maxActive(),1);s.alarm.setPending([]);assert.equal(s.active(),0);s.advance(60000);assert.equal(s.clips.length,3);
});
test('saved settings do not restore order data; suspended sound resumes for freshly loaded pending orders',async()=>{
 const s=setup({'mm-kitchen-alarm-v1':JSON.stringify({enabled:true,signal:'double',volume:75})});await Promise.resolve();assert.equal(s.clips.length,0);assert.equal(s.alarm.preference.signal,'double');assert.equal(s.alarm.preference.volume,75);
 s.alarm.setPending(['restored']);assert.equal(s.clips.length,1);s.advance(2000);s.alarm.context.state='suspended';s.alarm.context.onstatechange();s.advance(60000);assert.equal(s.clips.length,1);
 await s.alarm.enable(false);assert.equal(s.clips.length,2);assert.equal(s.alarm.pending.size,1);
 s.elements.volume.value='40';s.elements.volume.oninput();assert.equal(s.alarm.master.gain.value,.4);assert.equal(JSON.parse(s.storage.get('mm-kitchen-alarm-v1')).volume,40);
});
test('all three signals create bounded clips; invalid preferences and failed audio cannot break queue tracking',async()=>{
 const s=setup({'mm-kitchen-alarm-v1':JSON.stringify({enabled:false,signal:'unknown',volume:1000})});assert.equal(s.alarm.preference.signal,'bell');assert.equal(s.alarm.preference.volume,100);
 await s.alarm.enable(true);s.advance(2000);for(const signal of ['bell','double','urgent']){s.elements.signal.value=signal;s.elements.signal.onchange();s.alarm.ring();assert.equal(s.active(),1);s.advance(2000);assert.equal(s.active(),0);}
 s.alarm.context.createOscillator=()=>{throw Error('Audio unavailable');};assert.doesNotThrow(()=>s.alarm.setPending(['still-pending']));assert.equal(s.alarm.pending.size,1);
});
