// Explicit read-only destination check. Downloads only public retrieval-model
// files if the cache is empty. Does not call Groq, generate materials or train.
const mongoose = require('/app/node_modules/mongoose');
const {config} = require('/app/dist/config/config');
const {curriculumDbService} = require('/app/dist/services/curriculumDbService');
const {qdrantService} = require('/app/dist/services/qdrantService');
const {embeddingService} = require('/app/dist/services/embeddingService');
const report = {mongo:false,curriculumDatabase:false,textbookCollection:false,clerkKeys:false,retrievalEmbedding:false};
const deadline = setTimeout(()=>{console.error('Dependency check exceeded 120 seconds; '+JSON.stringify(report));process.exit(1);},120000);
async function main() {
  try {
    // Initialize the retrieval encoder before starting short network deadlines.
    // Cold native-runtime loading can block the event loop and otherwise make
    // healthy databases appear to time out during this explicit preflight.
    await embeddingService.embedRetrievalQuery('Science and History textbook retrieval release check')
      .then(vector=>{report.retrievalEmbedding=vector.length===config.embedding.expectedDimension;report.embeddingDimension=vector.length;})
      .catch(()=>{});
    const checks = [
      mongoose.connect(config.mongodb.uri,{serverSelectionTimeoutMS:10000}).then(()=>{report.mongo=true;}),
      curriculumDbService.checkDatabaseHealth().then(result=>{report.curriculumDatabase=result.isConnected;report.completedIngestionJobs=result.doneJobs;}),
      qdrantService.getCollectionStats().then(result=>{report.textbookCollection=result.isAvailable && result.totalPoints>0 && result.vectorDim===config.embedding.expectedDimension;report.textbookChunks=result.totalPoints;}),
      fetch(new URL('/.well-known/jwks.json',process.env.CLERK_ISSUER_URL),{signal:AbortSignal.timeout(10000)})
        .then(async response=>{if(response.ok){const body=await response.json();report.clerkKeys=Array.isArray(body.keys)&&body.keys.length>0;}}),
    ];
    await Promise.allSettled(checks);
    report.ready = ['mongo','curriculumDatabase','textbookCollection','clerkKeys','retrievalEmbedding'].every(key=>report[key]===true);
    console.log(JSON.stringify(report,null,2));
    if(!report.ready) process.exitCode=1;
  } finally {clearTimeout(deadline);await Promise.allSettled([mongoose.disconnect(),curriculumDbService.closePool()]);}
}
main().catch(()=>{console.error('Notes dependency check failed; '+JSON.stringify(report));process.exitCode=1;});
