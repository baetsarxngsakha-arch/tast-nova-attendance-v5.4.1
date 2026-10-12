const NovaApi=(()=>{
  const URL_KEY='nova_hr_api_url',TOKEN_KEY='nova_hr_token';
  const url=()=>localStorage.getItem(URL_KEY)||window.NOVA_APPS_SCRIPT_URL||'';
  const setUrl=value=>{const v=String(value||'').trim();if(!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/.test(v))throw new Error('ใส่ Apps Script Web App URL ที่ลงท้าย /exec');localStorage.setItem(URL_KEY,v);};
  const token=()=>sessionStorage.getItem(TOKEN_KEY)||localStorage.getItem(TOKEN_KEY)||'';
  const setToken=(value,remember=false)=>{sessionStorage.setItem(TOKEN_KEY,value);if(remember)localStorage.setItem(TOKEN_KEY,value);else localStorage.removeItem(TOKEN_KEY);};
  const clearToken=()=>{sessionStorage.removeItem(TOKEN_KEY);localStorage.removeItem(TOKEN_KEY);};
  const OUTBOX_KEY='nova_attendance_outbox_v541';
  const outbox=()=>{try{return JSON.parse(localStorage.getItem(OUTBOX_KEY)||'null');}catch{return null;}};
  async function call(action,payload={},authToken){
    if(action==='confirmFace'||action==='publicConfirm'){
      let intent=outbox();
      if(!intent||intent.pendingToken!==payload.pendingToken)intent={pendingToken:payload.pendingToken,idempotencyKey:crypto.randomUUID(),employeeId:payload.employeeId||'',name:payload.name||'',nickname:payload.nickname||'',createdAt:new Date().toISOString(),status:'waiting'};
      payload.idempotencyKey=intent.idempotencyKey;intent.status='sending';localStorage.setItem(OUTBOX_KEY,JSON.stringify(intent));
    }
    if(!url())throw new Error('ตั้งค่า Apps Script URL ก่อน');
    let response;
    try{response=await fetch(url(),{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,payload,token:authToken===undefined?token():authToken}),redirect:'follow'});}
    catch{if(action==='confirmFace'||action==='publicConfirm'){const q=outbox();if(q){q.status='waiting';localStorage.setItem(OUTBOX_KEY,JSON.stringify(q));}}throw new Error('เชื่อมต่อ Apps Script ไม่ได้ ตรวจ URL และสิทธิ์ Web App');}
    let result;try{result=await response.json();}catch{if(action==='confirmFace'||action==='publicConfirm'){const q=outbox();if(q){q.status='waiting';localStorage.setItem(OUTBOX_KEY,JSON.stringify(q));}}throw new Error('Apps Script ตอบกลับไม่ใช่ JSON ตรวจ URL /exec และการ Deploy');}
    if(!result.ok){if(action==='confirmFace'||action==='publicConfirm'){const q=outbox();if(q){q.status='waiting';q.lastError=String(result.error||'');localStorage.setItem(OUTBOX_KEY,JSON.stringify(q));}}if(String(result.error).includes('เซสชันหมดอายุ'))clearToken();throw new Error(result.error||'คำขอไม่สำเร็จ');}
    if(action==='confirmFace'||action==='publicConfirm')localStorage.removeItem(OUTBOX_KEY);
    return result.data;
  }
  return {url,setUrl,token,setToken,clearToken,call,outbox};
})();
