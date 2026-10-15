/* A durable, ordered outbox scoped to the configured API. No images/vectors/PINs. */
const NovaContinuous=(()=>{
  const key=()=> 'nova_continuous_v1:'+NovaApi.url();
  const read=()=>{const raw=localStorage.getItem(key());if(!raw)return [];const rows=JSON.parse(raw);if(!Array.isArray(rows))throw new Error('คิวลงเวลาอ่านไม่ได้ กรุณาติดต่อ Admin');return rows;};
  const supported=()=>!!navigator.locks?.request;
  const mutate=fn=>{if(!supported())return Promise.reject(new Error('เบราว์เซอร์นี้ไม่รองรับคิวสแกนต่อเนื่อง กรุณาอัปเดตเบราว์เซอร์'));return navigator.locks.request(key()+':storage',()=>{const rows=read(),result=fn(rows);localStorage.setItem(key(),JSON.stringify(rows));return result;});};
  const pending=()=>read().filter(r=>r.status!=='saved');
  let listener=()=>{},working=false;
  function changed(){try{listener();}catch{}}
  async function enqueue(job){
    if(NovaApi.outbox())throw new Error('กรุณาส่งรายการเดิมให้สำเร็จก่อนเปิดคิวต่อเนื่อง');
    await mutate(rows=>{if(rows.some(r=>r.status!=='saved'&&r.employeeId===job.employeeId))throw new Error('พนักงานคนนี้ยังมีรายการรอส่ง กรุณารอผลรายการเดิม');if(rows.filter(r=>r.status!=='saved').length>=200)throw new Error('คิวเต็ม กรุณาตรวจสอบการเชื่อมต่อก่อนสแกนต่อ');rows.push({...job,status:'waiting'});});
    changed();void drain();
  }
  async function drain(){
    if(working||!supported()||!NovaApi.url())return;
    working=true;
    try{await navigator.locks.request(key()+':sender',{ifAvailable:true},async lock=>{
      if(!lock)return;
      while(true){
        const job=pending()[0];if(!job)return;
        if(NovaApi.outbox())return;
        try{
          const result=await NovaApi.call('continuousConfirm',job);
          await mutate(rows=>{const item=rows.find(r=>r.idempotencyKey===job.idempotencyKey);if(item){item.status='saved';item.result=result;item.savedAt=new Date().toISOString();delete item.ticket;delete item.location;}const done=rows.filter(r=>r.status==='saved');if(done.length>20){const remove=new Set(done.slice(0,done.length-20).map(r=>r.idempotencyKey));for(let i=rows.length-1;i>=0;i--)if(remove.has(rows[i].idempotencyKey))rows.splice(i,1);}});
          changed();
        }catch(error){await mutate(rows=>{const item=rows.find(r=>r.idempotencyKey===job.idempotencyKey);if(item){item.status='waiting';item.lastError=error.message;}});changed();return;}
      }
    });}catch(error){console.error('Attendance queue:',error.message);}finally{working=false;}
  }
  async function resolve(job){
    await navigator.locks.request(key()+':sender',async()=>{
      const result=await NovaApi.call('continuousCancel',{idempotencyKey:job.idempotencyKey,employeeId:job.employeeId});
      await mutate(rows=>{const row=rows.find(r=>r.idempotencyKey===job.idempotencyKey);if(row){row.status='saved';row.result=result;delete row.ticket;delete row.location;}});changed();
    });void drain();
  }
  window.addEventListener('online' ,()=>void drain());
  window.addEventListener('storage',event=>{if(event.key===key()){changed();void drain();}});
  window.setInterval(()=>void drain(),15000);
  return {supported,read,pending,enqueue,drain,resolve,onChange:fn=>{listener=fn;}};
})();
