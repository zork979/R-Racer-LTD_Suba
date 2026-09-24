import http from 'node:http';

// HTTP test double for Supabase Storage; SQL tests use local PostgreSQL or PGlite.
export async function startStorageServer() {
  const buckets=new Map(), objects=new Map();
  let rejectUpload=false;
  const secret='sb_secret_rracer_local_test_only';
  const server=http.createServer(async(req,res)=>{
    const send=(status,data,type='application/json')=>{res.writeHead(status,{'Content-Type':type});res.end(Buffer.isBuffer(data)?data:JSON.stringify(data));};
    if(req.headers.apikey!==secret)return send(401,{statusCode:'401',message:'Invalid API key'});
    const chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks);
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const parts=pathname.replace(/^\/storage\/v1\//,'').split('/');
    if(parts[0]==='bucket'){
      if(req.method==='POST'){const b=JSON.parse(bytes);buckets.set(b.id||b.name,b);return send(200,{name:b.name});}
      const b=buckets.get(parts[1]);return b?send(200,b):send(400,{statusCode:'404',error:'not_found',message:'Bucket not found'});
    }
    if(parts[0]==='object'){
      const offset=parts[1]==='authenticated'?2:1;
      const bucket=parts[offset],key=parts.slice(offset+1).join('/'),full=bucket+'/'+key;
      if(!buckets.has(bucket))return send(400,{statusCode:'404',message:'Bucket not found'});
      if(req.method==='POST'){
        if(rejectUpload)return send(503,{statusCode:'503',message:'Simulated Storage outage'});
        if(objects.has(full))return send(409,{statusCode:'409',message:'The resource already exists'});
        objects.set(full,{bytes,mime:req.headers['content-type']});return send(200,{Key:full});
      }
      if(req.method==='GET'){
        const object=objects.get(full);return object?send(200,object.bytes,object.mime):send(404,{statusCode:'404',message:'Object not found'});
      }
      if(req.method==='DELETE'){const {prefixes}=JSON.parse(bytes);for(const p of prefixes)objects.delete(bucket+'/'+p);return send(200,prefixes.map(name=>({name})));}
    }
    send(404,{statusCode:'404',message:'Unknown test Storage endpoint'});
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  return { url:'http://127.0.0.1:'+server.address().port,secret,buckets,objects,
    set rejectUpload(value){rejectUpload=value;},
    close:()=>new Promise(r=>server.close(r)),
  };
}
