let csrf='';
export const setCsrf=value=>{csrf=value||'';};
function fallbackMessage(status){
  if(status===413)return 'The upload is too large for the server limit (HTTP 413). Please try a smaller photo.';
  if(status===403)return 'The request was blocked by the server security check (HTTP 403). Refresh the page and try again.';
  if(status===429)return 'Too many requests were sent in a short time (HTTP 429). Wait a few seconds and try again.';
  if(status===502||status===503||status===504)return `The server is temporarily busy or restarting (HTTP ${status}). Please try again.`;
  return status?`The server returned an unexpected response (HTTP ${status}).`:'The server returned an unexpected response.';
}
function retryAfterMs(response){
  const raw=response.headers?.get?.('Retry-After');
  const sec=Number(raw);
  return Number.isFinite(sec)&&sec>0?Math.min(15000,Math.ceil(sec*1000)):0;
}
export async function api(path,options={}) {
  const form=options.body instanceof FormData;
  const response=await fetch('/api'+path,{credentials:'same-origin',...options,headers:{...(form?{}:{'Content-Type':'application/json'}),...(csrf?{'X-CSRF-Token':csrf}:{}),...options.headers},body:options.body?(form?options.body:JSON.stringify(options.body)):undefined});
  const text=await response.text();
  let data=null,parsed=false;
  if(text){try{data=JSON.parse(text);parsed=true;}catch{}}
  else if(response.ok){data={};parsed=true;}
  if(!parsed||data===null||typeof data!=='object'){
    const error=new Error(fallbackMessage(response.status));
    error.status=response.status;
    error.retryAfter=retryAfterMs(response);
    throw error;
  }
  if(!response.ok){const error=new Error(data.message||'Unable to complete this request.');error.status=response.status;error.retryAfter=retryAfterMs(response);throw error;}
  return data;
}
export const money=value=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:0,maximumFractionDigits:2}).format(value||0);
export const day=value=>value?new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value)):'—';
export const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Europe/London'});
