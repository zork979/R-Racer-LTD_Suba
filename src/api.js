let csrf='';
export const setCsrf=value=>{csrf=value||'';};
export async function api(path,options={}) {
  const form=options.body instanceof FormData;
  const response=await fetch('/api'+path,{credentials:'same-origin',...options,headers:{...(form?{}:{'Content-Type':'application/json'}),...(csrf?{'X-CSRF-Token':csrf}:{}),...options.headers},body:options.body?(form?options.body:JSON.stringify(options.body)):undefined});
  const data=await response.json().catch(()=>({message:'The server returned an unexpected response.'}));
  if(!response.ok){const error=new Error(data.message||'Unable to complete this request.');error.status=response.status;throw error;}
  return data;
}
export const money=value=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:0,maximumFractionDigits:2}).format(value||0);
export const day=value=>value?new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value)):'—';
export const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Europe/London'});
