// Host-side, Docker-only packaging verification. No credentials or cloud access.
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const image=process.argv[2]||'smart-notes:science-v35-history-v62-r2-20261019';
const fixtureName=`notes-release-health-${process.pid}`;
function docker(args,expected=0){
  const result=spawnSync('docker',args,{encoding:'utf8',timeout:180000,maxBuffer:2*1024*1024});
  if(result.error)throw result.error;
  assert.equal(result.status,expected,`Docker check failed: ${(result.stderr||result.stdout).slice(-1200)}`);
  return result.stdout.trim();
}
async function main(){
  const metadata=JSON.parse(docker(['image','inspect',image,'--format','{{json .}}']));
  assert.equal(metadata.Os,'linux');assert.equal(metadata.Architecture,'amd64');
  assert.equal(metadata.Config.User,'node');
  const modelResult=docker(['run','--rm','--network','none','--read-only','--tmpfs','/tmp',image,'node','dist/scripts/verify-coverage-container.js']);
  assert.ok(modelResult.includes('15'),'Expected all 15 packaged model fixtures');
  const fixture={NODE_ENV:'production',NOTE_IMAGE_STORAGE:'r2',MONGODB_URI:'mongodb://mongo.internal/notes',CURRICULUM_DB_URL:'postgresql://user:secret@postgres.internal/ingestion',
    QDRANT_DB_URL:'http://qdrant:6333',QDRANT_API_KEY:'test-key',QDRANT_COLLECTION:'pdf_knowledge_base_v2',QDRANT_PAYLOAD_PAGE_BASE:'1',GROQ_API_KEY:'test-key',
    R2_ENDPOINT:`https://${'a'.repeat(32)}.r2.cloudflarestorage.com`,R2_BUCKET:'notes-private',R2_ACCESS_KEY_ID:'test-id',R2_SECRET_ACCESS_KEY:'test-secret',
    CLERK_ISSUER_URL:'https://school.clerk.accounts.dev',CLERK_AUTHORIZED_PARTIES:'https://school.edu',
    ENGLISH_COVERAGE_SUGGESTIONS_ENABLED:'true',HISTORY_COVERAGE_REVIEW_ENABLED:'true',ICT_COVERAGE_REVIEW_ENABLED:'false',ANNOTATION_REVIEW_ENABLED:'false',ENGLISH_COVERAGE_REVIEW_ENABLED:'false',
    EMBEDDING_MODEL:'nomic-ai/nomic-embed-text-v1.5',EMBEDDING_DIMENSION:'768',UPLOAD_DIR:'/app/uploads',EMBEDDING_CACHE_DIR:'/app/.cache/embeddings'};
  const preflight=docker(['run','--rm','--network','none',image,'node','-e',`Object.assign(process.env,${JSON.stringify(fixture)});require('./dist/scripts/verify-deployment.js')`]);
  assert.ok(preflight.includes('"configuration":"valid"'));
  try{
    const serverCode='const fs=require("node:fs");require("node:http").createServer((req,res)=>{res.statusCode=req.url!=="/api/health"?404:fs.existsSync("/tmp/unhealthy")?503:200;res.end("probe fixture")}).listen(Number(process.env.PORT),"0.0.0.0")';
    docker(['run','-d','--name',fixtureName,'--network','none','--read-only','--tmpfs','/tmp','-e','PORT=8765',image,'node','-e',serverCode]);
    const security=JSON.parse(docker(['exec',fixtureName,'node','-e','const fs=require("node:fs");console.log(JSON.stringify({uid:process.getuid(),envFile:fs.existsSync("/app/.env"),credentials:!!(process.env.GROQ_API_KEY||process.env.R2_SECRET_ACCESS_KEY),uploads:fs.readdirSync("/app/uploads").length}))']));
    assert.notEqual(security.uid,0);assert.equal(security.envFile,false);assert.equal(security.credentials,false);assert.equal(security.uploads,0);
    const probe=metadata.Config.Healthcheck.Test;assert.equal(probe[0],'CMD-SHELL');
    docker(['exec',fixtureName,'sh','-c',probe[1]]);
    docker(['exec',fixtureName,'node','-e','require("node:fs").writeFileSync("/tmp/unhealthy","1")']);
    docker(['exec',fixtureName,'sh','-c',probe[1]],1);
    const report={date:'2026-10-19',image,imageId:metadata.Id,platform:'linux/amd64',containerUser:security.uid,
      buildPassed:true,offlineModelFixturesPassed:15,configurationAndCatalogCheckPassed:true,
      customPortHealthCheckPassed:true,unhealthyResponseRejected:true,credentialsAbsentFromImage:true,studentUploadsAbsentFromImage:true,
      azureResourcesCreated:false,registryPushed:false,destinationConnectivityVerified:false,groqInvoked:false};
    fs.writeFileSync(path.join(__dirname,'image-verification.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
  }finally{docker(['rm','-f',fixtureName]);}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
