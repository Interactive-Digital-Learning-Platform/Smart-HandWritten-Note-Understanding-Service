// Local browser or opt-in LAN phone testing. Keeps backend JWT checks.
const http=require('node:http');
function createNotesGateway(upstreamPort=8005){
  const origins=new Set(['http://127.0.0.1:8082','http://localhost:8082']);
  return http.createServer((req,res)=>{
    res.setHeader('Cache-Control','no-store');
    const fail=(status,message)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify({success:false,error:message}));};
    const origin=req.headers.origin;
    if(origin&&!origins.has(origin)){fail(403,'This Notes test gateway does not allow this browser origin');return;}
    if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
    if(req.method==='OPTIONS'){
      res.writeHead(204,{'Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,PUT,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization,X-Expert-Id'});res.end();return;
    }
    if(!req.url?.startsWith('/api/notes/')){fail(404,'This local test gateway serves only the Notes service');return;}
    const upstream=http.request({hostname:'127.0.0.1',port:upstreamPort,method:req.method,
      path:req.url.slice('/api/notes'.length),headers:{...req.headers,host:`127.0.0.1:${upstreamPort}`}},response=>{
      const headers={...response.headers};
      for(const key of Object.keys(headers))if(key.startsWith('access-control-')||key==='vary')delete headers[key];
      res.writeHead(response.statusCode||502,headers);response.pipe(res);
    });
    upstream.setTimeout(300000,()=>upstream.destroy());
    upstream.on('error',()=>{if(!res.headersSent)fail(502,'The Notes backend is unavailable. Check Docker and port 8005.');else res.destroy();});
    req.on('aborted',()=>upstream.destroy());
    res.on('close',()=>{if(!res.writableEnded)upstream.destroy();});
    req.pipe(upstream);
  });
}
module.exports={createNotesGateway};
if(require.main===module){
  const lan=process.argv.includes('--lan');
  const server=createNotesGateway();
  server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'Port 8080 is already occupied. Check the existing gateway before starting this Notes-only helper.':'Notes test gateway failed to start.');process.exitCode=1;});
  server.listen(8080,lan?'0.0.0.0':'127.0.0.1',()=>{
    console.log(`Notes-only ${lan?'LAN':'browser'} gateway -> Notes port 8005. Keep this terminal open.`);
    if(lan){
      for(const [name,addresses] of Object.entries(require('node:os').networkInterfaces())){
        for(const address of addresses||[])if(address.family==='IPv4'&&!address.internal)console.log(`${name}: http://${address.address}:8080 (choose the interface on your phone's Wi-Fi network)`);
      }
    }else{
      console.log('Browser API: http://127.0.0.1:8080');
      console.log('Phone/Expo Go cannot reach this loopback listener. Restart this helper with --lan for phone testing.');
    }
  });
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close());
}
