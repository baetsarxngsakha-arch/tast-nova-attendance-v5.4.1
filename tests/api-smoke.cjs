const fs=require('fs'),vm=require('vm'),assert=require('assert');
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k),raw:values};};
const localStorage=storage(),sessionStorage=storage(),requests=[];let nextFetch=async()=>({json:async()=>({ok:true,data:{ack:true}})});
const context=vm.createContext({window:{NOVA_APPS_SCRIPT_URL:'https://script.google.com/macros/s/mock/exec'},localStorage,sessionStorage,crypto:{randomUUID:(()=>{let n=0;return()=>`key-${++n}-1234567890123456`;})()},Date,fetch:async(url,request)=>{requests.push({url,request});return nextFetch(url,request);}});
vm.runInContext(fs.readFileSync('public/js/api.js','utf8'),context);
const api=vm.runInContext('NovaApi',context),outboxKey='nova_attendance_outbox_v541';
const postBody=()=>JSON.parse(requests.at(-1).request.body);
(async()=>{
 api.setToken('remembered',true);assert.strictEqual(localStorage.getItem('nova_hr_token'),'remembered');
 sessionStorage.removeItem('nova_hr_token');assert.strictEqual(api.token(),'remembered');
 api.setToken('temporary',false);assert.strictEqual(api.token(),'temporary');assert.strictEqual(localStorage.getItem('nova_hr_token'),null);
 api.clearToken();assert.strictEqual(api.token(),'');
 // An uncertain kiosk write persists its route and key. Conflicting actions cannot overwrite it.
 nextFetch=async()=>{throw new Error('network down');};await assert.rejects(()=>api.call('publicConfirm',{pendingToken:'public-pending-1',employeeId:'NV001',name:'พนักงาน',nickname:'นัท'}));
 const publicIntent=api.outbox();assert.strictEqual(publicIntent.action,'publicConfirm');assert.strictEqual(publicIntent.status,'waiting');assert(!JSON.stringify(publicIntent).includes('temporary'));
 const key1=publicIntent.idempotencyKey,requestCount=requests.length;
 await assert.rejects(()=>api.call('publicIdentify',{descriptor:[]}),e=>e.code==='OUTBOX_LOCKED');
 await assert.rejects(()=>api.call('publicCancel',{pendingToken:'public-pending-1'}),e=>e.code==='OUTBOX_LOCKED');
 await assert.rejects(()=>api.call('publicConfirm',{pendingToken:'public-pending-2',employeeId:'NV002'}),e=>e.code==='OUTBOX_LOCKED');
 assert.strictEqual(requests.length,requestCount);assert.strictEqual(api.outbox().idempotencyKey,key1);
 // Reporting and Developer recovery remain available while a clock write is unresolved.
 nextFetch=async()=>({json:async()=>({ok:true,data:{allowed:true}})});
 assert((await api.call('attendanceRange',{start:'2026-10-01',end:'2026-10-02'})).allowed);
 assert((await api.call('developerSetEnabled',{developerToken:'developer-session',enabled:true})).allowed);
 assert.strictEqual(api.outbox().idempotencyKey,key1);
 // Retry reuses the original key; acknowledgement removes only its own intent.
 nextFetch=async()=>{const unrelated={action:'confirmFace',pendingToken:'other-pending',idempotencyKey:'other-key',employeeId:'NV002'};localStorage.setItem(outboxKey,JSON.stringify(unrelated));return {json:async()=>({ok:true,data:{ack:true}})};};
 assert((await api.call('publicConfirm',{pendingToken:'public-pending-1',employeeId:'NV001'})).ack);
 assert.strictEqual(postBody().payload.idempotencyKey,key1);assert.strictEqual(api.outbox().pendingToken,'other-pending');
 // Session-bound writes record route and employee, never the session token or PIN.
 localStorage.removeItem(outboxKey);nextFetch=async()=>{throw new Error('network down');};
 api.setToken('employee-session',false);await assert.rejects(()=>api.call('confirmFace',{pendingToken:'signed-pending',employeeId:'NV001',name:'พนักงาน',nickname:'นัท'}));
 const signedIntent=api.outbox();assert.strictEqual(signedIntent.action,'confirmFace');assert.strictEqual(signedIntent.employeeId,'NV001');assert(!Object.keys(signedIntent).some(k=>/token|pin/i.test(k)&&k!=='pendingToken'));assert(!JSON.stringify(signedIntent).includes('employee-session'));
 await assert.rejects(()=>api.call('publicConfirm',{pendingToken:'signed-pending',employeeId:'NV001'}),e=>e.code==='OUTBOX_ROUTE_MISMATCH');
 nextFetch=async()=>({json:async()=>({ok:true,data:{ack:true}})});assert((await api.call('confirmFace',{pendingToken:'signed-pending'})).ack);assert.strictEqual(postBody().action,'confirmFace');assert.strictEqual(postBody().payload.idempotencyKey,signedIntent.idempotencyKey);assert.strictEqual(api.outbox(),null);
 // A deterministic server rejection proves there was no attendance write and unlocks the next scan.
 nextFetch=async()=>({json:async()=>({ok:false,error:'มีคำขอลงเวลาแทนที่รอผู้ดูแลอนุมัติ จึงยังไม่สามารถเริ่มรายการลงเวลาใหม่ได้'})});
 await assert.rejects(()=>api.call('publicConfirm',{pendingToken:'pending-denied',employeeId:'NV001'}),e=>e.code==='DEFINITIVE_NO_WRITE');assert.strictEqual(api.outbox(),null);
 nextFetch=async()=>({json:async()=>({ok:true,data:{pendingToken:'fresh'}})});assert((await api.call('publicIdentify',{descriptor:[]})).pendingToken==='fresh');
 // Expiration safely releases an unsaved intent; ambiguous session-route errors retain it for recovery.
 nextFetch=async()=>({json:async()=>({ok:false,error:'การยืนยันหมดอายุ กรุณาสแกนใหม่'})});await assert.rejects(()=>api.call('publicConfirm',{pendingToken:'expired-pending',employeeId:'NV001'}),e=>e.code==='PENDING_EXPIRED');assert.strictEqual(api.outbox(),null);
 nextFetch=async()=>({json:async()=>({ok:false,error:'บัญชีผู้ยืนยันไม่ตรงกับผู้สแกน'})});await assert.rejects(()=>api.call('publicConfirm',{pendingToken:'legacy-signed-pending',employeeId:'NV001'}));const recovered=api.outbox();assert.strictEqual(recovered.action,'confirmFace');assert.strictEqual(recovered.employeeId,'NV001');assert(recovered.idempotencyKey);
 console.log('PASS login sessions, serial durable outbox, idempotent retry, route recovery, and nonattendance APIs');
})().catch(e=>{console.error(e);process.exit(1);});
