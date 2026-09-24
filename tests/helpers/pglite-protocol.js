// PGlite 0.5.8 emits ReadyForQuery after an extended-protocol error AND again
// when pg's queued Sync arrives. Native PostgreSQL waits for Sync. Forwarding
// both can make pg associate an empty result with the following query.
// Correct only this test transport framing; SQL, errors and assertions are
// unchanged. The production application connects directly to PostgreSQL.
export function normalisePgliteProtocol(db) {
  const execute=db.execProtocolRawStream.bind(db);
  const extended=new Set([0x50,0x42,0x44,0x45,0x43,0x48]); // Parse/Bind/Describe/Execute/Close/Flush
  db.execProtocolRawStream=async(message,options={})=>{
    if(!extended.has(message[0]))return execute(message,options);
    const chunks=[];
    await execute(message,{...options,onRawData:chunk=>chunks.push(Buffer.from(chunk))});
    const bytes=Buffer.concat(chunks);let offset=0;
    while(offset<bytes.length){
      if(offset+5>bytes.length)throw new Error('Incomplete PGlite response frame.');
      const end=offset+1+bytes.readUInt32BE(offset+1);
      if(end>bytes.length||end<=offset+4)throw new Error('Invalid PGlite response frame.');
      if(bytes[offset]!==0x5a)options.onRawData?.(bytes.subarray(offset,end));
      offset=end;
    }
  };
}
