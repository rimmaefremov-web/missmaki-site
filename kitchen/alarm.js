/* One shared alarm for the server-confirmed queue. No dismissal/mute state per order. */
(()=>{
 const KEY='mm-kitchen-alarm-v1',INTERVAL=30000;
 const signals={bell:{type:'triangle',notes:[1480,980,1480,980],step:.42},double:{type:'square',notes:[1046,1046,1318,1318],step:.38},urgent:{type:'sawtooth',notes:[880,1320,880,1320,880,1320],step:.28}};
 window.MMKitchenAlarm=class {
  constructor({button,signal,volume,output,status}){
   Object.assign(this,{button,signal,volume,output,status});this.pending=new Set();this.lastRing=-Infinity;this.timer=null;this.voice=null;this.context=null;
   let saved;try{saved=JSON.parse(localStorage.getItem(KEY));}catch{}
   this.preference={signal:signals[saved?.signal]?saved.signal:'bell',volume:Number.isFinite(saved?.volume)?Math.max(10,Math.min(100,saved.volume)):90,enabled:saved?.enabled===true};
   signal.value=this.preference.signal;volume.value=this.preference.volume;this.updateVolume();
   button.onclick=()=>this.enable(true);
   signal.onchange=()=>{this.preference.signal=signals[signal.value]?signal.value:'bell';this.save();};
   volume.oninput=()=>{this.preference.volume=Math.max(10,Math.min(100,Number(volume.value)||10));this.updateVolume();this.save();};
   this.paint();
   // A stored preference is not an autoplay permission. A suspended context asks for a tap.
   if(this.preference.enabled)this.enable(false);
  }
  save(){try{localStorage.setItem(KEY,JSON.stringify(this.preference));}catch{}}
  updateVolume(){this.output.textContent=this.preference.volume+'%';if(this.master)this.master.gain.setValueAtTime(this.preference.volume/100,this.context.currentTime);}
  paint(){
   const running=this.context?.state==='running';
   this.button.textContent=running?'Проверить звонок':'Включить звук';
   this.status.textContent=!running?'Нажмите «Включить звук». Громкость устройства настройте отдельно.':this.pending.size?`Необработанных заказов: ${this.pending.size}. Звонок повторяется каждые 30 секунд.`:'Звук включён. Ждём новые заказы.';
  }
  async enable(preview){
   try{
    if(!this.context||this.context.state==='closed'){
     this.context=new(window.AudioContext||window.webkitAudioContext)();this.master=this.context.createGain();this.master.connect(this.context.destination);this.updateVolume();
     this.context.onstatechange=()=>{if(this.context.state!=='running')this.clearTimer();else if(this.pending.size)this.ring();this.paint();};
    }
    this.preference.enabled=true;this.save();
    await this.context.resume();
    if(this.pending.size||preview)this.ring();this.paint();
   }catch{this.status.textContent='Звук недоступен. Держите очередь на экране и попробуйте «Включить звук».';}
  }
  clearTimer(){if(this.timer!==null)clearTimeout(this.timer);this.timer=null;}
  arm(){
   this.clearTimer();if(!this.pending.size||this.context?.state!=='running')return;
   this.timer=setTimeout(()=>{this.timer=null;this.ring();},Math.max(this.voice?250:1,INTERVAL-(Date.now()-this.lastRing)));
  }
  ring(){
   if(this.context?.state!=='running')return false;
   if(this.voice){this.arm();return false;}
   try{
    const ctx=this.context,pattern=signals[this.preference.signal],osc=ctx.createOscillator(),gain=ctx.createGain(),start=ctx.currentTime;
    osc.type=pattern.type;osc.connect(gain);gain.connect(this.master);gain.gain.setValueAtTime(0,start);
    pattern.notes.forEach((frequency,i)=>{const t=start+i*pattern.step;osc.frequency.setValueAtTime(frequency,t);gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.65,t+.012);gain.gain.exponentialRampToValueAtTime(.001,t+pattern.step-.025);});
    const voice={osc,gain};this.voice=voice;
    osc.onended=()=>{osc.disconnect();gain.disconnect();if(this.voice===voice)this.voice=null;};
    osc.start(start);osc.stop(start+pattern.notes.length*pattern.step);this.lastRing=Date.now();this.arm();return true;
   }catch{this.cancelVoice();this.clearTimer();this.status.textContent='Не удалось воспроизвести звонок. Нажмите «Включить звук».';return false;}
  }
  cancelVoice(){const voice=this.voice;this.voice=null;if(voice){try{voice.osc.stop();}catch{}try{voice.osc.disconnect();voice.gain.disconnect();}catch{}}}
  setPending(ids){
   const next=new Set(ids),arrived=[...next].some(id=>!this.pending.has(id));this.pending=next;
   if(!next.size){this.clearTimer();this.cancelVoice();}
   else if(arrived)this.ring();
   else if(this.context?.state==='running'&&Date.now()-this.lastRing>=INTERVAL)this.ring();
   this.paint();
  }
  resolved(id){const remaining=[...this.pending].filter(value=>value!==id);this.setPending(remaining);}
  recover(){if(this.preference.enabled)this.enable(false);}
 };
})();
