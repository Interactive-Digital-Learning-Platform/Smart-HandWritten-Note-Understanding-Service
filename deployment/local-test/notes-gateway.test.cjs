const test=require('node:test');const assert=require('node:assert/strict');const http=require('node:http');
const {createNotesGateway}=require('./notes-gateway.cjs');
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
test('Notes test gateway preserves authenticated requests and rewrites only the gateway prefix',async()=>{
  const upstream=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;res.setHeader('Content-Type','application/json');res.setHeader('Access-Control-Allow-Origin','*');res.end(JSON.stringify({path:req.url,method:req.method,auth:req.headers.authorization,body}));});
  const upstreamPort=await listen(upstream),gateway=createNotesGateway(upstreamPort),port=await listen(gateway),base=`http://127.0.0.1:${port}`;
  try{
    const response=await fetch(base+'/api/notes/api/notes/fixture?x=1',{method:'POST',headers:{Origin:'http://127.0.0.1:8082',Authorization:'Bearer synthetic-fixture','Content-Type':'application/json'},body:'{"synthetic":true}'});
    assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),'http://127.0.0.1:8082');
    assert.deepEqual(await response.json(),{path:'/api/notes/fixture?x=1',method:'POST',auth:'Bearer synthetic-fixture',body:'{"synthetic":true}'});
    const native=await fetch(base+'/api/notes/api/notes',{headers:{Authorization:'Bearer synthetic-native-fixture'}});
    assert.equal(native.status,200);
    assert.equal(native.headers.get('access-control-allow-origin'),null);
    assert.deepEqual(await native.json(),{path:'/api/notes',method:'GET',auth:'Bearer synthetic-native-fixture',body:''});
    assert.equal((await fetch(base+'/api/quiz/test')).status,404);
    assert.equal((await fetch(base+'/api/notes/api/health',{headers:{Origin:'https://untrusted.invalid'}})).status,403);
    assert.equal((await fetch(base+'/api/notes/uploads/fixture.png',{method:'OPTIONS',headers:{Origin:'http://localhost:8082'}})).status,204);
  }finally{await Promise.all([new Promise(resolve=>gateway.close(resolve)),new Promise(resolve=>upstream.close(resolve))]);}
});
