import {sha256} from './vendor/noble/sha256.js';
export function solveChallenge(challenge,max=10000000){
 if(challenge.bits!==18||!/^([a-f0-9]{64})$/.test(challenge.seal))throw Error('Неизвестная проверка отправки');
 const encoder=new TextEncoder();
 for(let n=0;n<max;n++){
  const h=sha256(encoder.encode(challenge.seal+':'+n));
  if(h[0]===0&&h[1]===0&&h[2]<64)return String(n);
 }
 throw Error('Проверка не завершилась. Повторите попытку');
}
if(typeof self!=='undefined'&&typeof self.postMessage==='function')self.onmessage=event=>{
 try{self.postMessage({solution:solveChallenge(event.data)});}catch(e){self.postMessage({error:e.message});}
};
