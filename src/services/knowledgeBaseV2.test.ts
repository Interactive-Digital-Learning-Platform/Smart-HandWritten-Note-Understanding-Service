import test, { mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import { config } from "../config/config";
import { qdrantService } from "./qdrantService";
import { embeddingService } from "./embeddingService";
import { curriculumDbService } from "./curriculumDbService";
import { knowledgeBasePdfPages } from "./knowledgeBaseV2";
import { ICTCoverageReviewService } from "./ictCoverageReviewService";
const originalPageBase=config.qdrant.payloadPageBase;
beforeEach(()=>{config.qdrant.payloadPageBase=0;});
afterEach(()=>{config.qdrant.payloadPageBase=originalPageBase;});

const info = (size = 768) => ({ data: { result: { points_count: 20, status: "green", config: { params: { vectors: { dense: { size, distance: "Cosine" } } } } } } });
test("the real upstream v2 page convention stays one-based with no off-by-one conversion",()=>{
  config.qdrant.payloadPageBase=1;
  assert.deepEqual(knowledgeBasePdfPages({pages:[1,53],page_start:1}),[1,53]);
  assert.deepEqual(knowledgeBasePdfPages({pages:[0]}),[]);
});
test("v2 stats, dense query and indexed grade/subject filters include auth without changing query text", async () => {
  const key = config.qdrant.apiKey; config.qdrant.apiKey = "test-secret";
  const calls: any[] = [];
  const get = mock.method(axios, "get", async (url: string, options: any) => { calls.push({url, options}); return info(); });
  const embed = mock.method(embeddingService, "embedRetrievalQuery", async (text: string) => {assert.equal(text, "carbohydrates");return Array(768).fill(.1);});
  const post = mock.method(axios, "post", async (url: string, body: any, options: any) => {
    calls.push({url, body, options}); return {data: {result: {points: [{id: "p", score: .8, payload: {text: "Carbohydrates provide energy.",filename: "science.pdf",pages: [0,1],page_start: 0,grade:10,subject:"Science"}}]}}};
  });
  try {
    const stats = await qdrantService.getCollectionStats(); assert.equal(stats.vectorDim, 768); assert.equal(stats.distance,"Cosine");
    const rows = await qdrantService.searchKnowledgeBase("carbohydrates", 3, {subject:"Science",grade:10});
    const query = calls.find(r => r.body);
    assert.match(query.url,/pdf_knowledge_base_v2\/points\/query$/);
    assert.equal(query.body.using,"dense"); assert.equal(query.body.query.length,768);
    assert.deepEqual(query.body.filter.must,[{key:"subject",match:{value:"Science"}},{key:"grade",match:{value:10}}]);
    assert.ok(calls.every(r=>r.options.headers["api-key"]==="test-secret"));
    assert.deepEqual(rows[0].pages,[1,2]); assert.equal(rows[0].page_start,1);
    assert.deepEqual(rows[0].payload?.pages,[0,1]); // raw source metadata stays intact
  } finally { get.mock.restore();embed.mock.restore();post.mock.restore();config.qdrant.apiKey=key; }
});

test("a named-vector dimension mismatch fails before sending a query", async () => {
  const get=mock.method(axios,"get",async()=>info(384));
  const embed=mock.method(embeddingService,"embedRetrievalQuery",async()=>Array(768).fill(.1));
  const post=mock.method(axios,"post",async()=>{throw Error("must not query");});
  try {await assert.rejects(qdrantService.searchKnowledgeBase("science"),/384.*768/);assert.equal(post.mock.callCount(),0);}
  finally {get.mock.restore();embed.mock.restore();post.mock.restore();}
});

test("configured vector names and explicit unnamed vectors retain validation, auth and fallback filters", async () => {
  const originalName = config.qdrant.vectorName;
  const originalKey = config.qdrant.apiKey;
  const embed = mock.method(embeddingService, "embedRetrievalQuery", async () => Array(768).fill(.1));
  try {
    config.qdrant.apiKey = "test-secret";
    for (const name of ["text_dense", ""]) {
      config.qdrant.vectorName = name;
      const get = mock.method(axios, "get", async () => ({ data: { result: {
        status: "green", points_count: 20,
        config: { params: { vectors: name ? { [name]: { size: 768, distance: "Cosine" } } : { size: 768, distance: "Cosine" } } },
      } } }));
      const calls: any[] = [];
      const post = mock.method(axios, "post", async (url: string, body: any, options: any) => {
        calls.push({ url, body, options });
        if (calls.length === 1) throw { response: { status: 405 } };
        return { data: { result: [] } };
      });
      try {
        await qdrantService.searchKnowledgeBase("science", 2, { grade: 10 });
        assert.equal(calls[0].body.using, name || undefined);
        assert.deepEqual(calls[1].body.vector, name ? { name, vector: Array(768).fill(.1) } : Array(768).fill(.1));
        assert.deepEqual(calls[1].body.filter, calls[0].body.filter);
        assert.ok(calls.every(call => call.options.headers["api-key"] === "test-secret"));
      } finally { get.mock.restore(); post.mock.restore(); }
    }
  } finally { embed.mock.restore(); config.qdrant.vectorName = originalName; config.qdrant.apiKey = originalKey; }
});

test("unnamed v1 collection metadata is rejected rather than silently skipping compatibility checks", async()=>{
  const get=mock.method(axios,"get",async()=>({data:{result:{status:"green",points_count:10,config:{params:{vectors:{size:768,distance:"Cosine"}}}}}}));
  const embed=mock.method(embeddingService,"embedRetrievalQuery",async()=>{throw Error("must not embed");});
  try {assert.equal((await qdrantService.getCollectionStats()).isAvailable,false);await assert.rejects(qdrantService.searchKnowledgeBase("science"),/unavailable/);assert.equal(embed.mock.callCount(),0);}
  finally {get.mock.restore();embed.mock.restore();}
});

test("legacy endpoint fallback still uses the named dense vector and identical indexed filters",async()=>{
  const key=config.qdrant.apiKey;config.qdrant.apiKey="test-secret";
  const get=mock.method(axios,"get",async()=>info());
  const embed=mock.method(embeddingService,"embedRetrievalQuery",async()=>Array(768).fill(.1));
  const calls:any[]=[];const post=mock.method(axios,"post",async(url: string,body: any,options: any)=>{
    calls.push({url,body,options});if(calls.length===1)throw {response:{status:405}};
    return {data:{result:[]}};
  });
  try {await qdrantService.searchKnowledgeBase("science",2,{grade:10});assert.equal(calls.length,2);
    assert.equal(calls[1].body.vector.name,"dense");assert.equal(calls[1].body.query,undefined);assert.equal(calls[1].body.using,undefined);
    assert.deepEqual(calls[1].body.filter,calls[0].body.filter);assert.equal(calls[1].options.headers["api-key"],"test-secret");
  } finally {get.mock.restore();embed.mock.restore();post.mock.restore();config.qdrant.apiKey=key;}
});

test("auth, strict-mode, rate-limit and server errors do not cause a second query or leak the key",async()=>{
  const get=mock.method(axios,"get",async()=>info());
  const embed=mock.method(embeddingService,"embedRetrievalQuery",async()=>Array(768).fill(.1));
  try {for(const status of [400,401,403,429,500]){
    const post=mock.method(axios,"post",async()=>{throw {response:{status},config:{headers:{"api-key":"private"}},message:"private provider body"};});
    try {await assert.rejects(qdrantService.searchKnowledgeBase("science"),error=>{assert.match((error as Error).message,new RegExp(`HTTP ${status}`));assert.ok(!JSON.stringify(error).includes("private"));return true;});assert.equal(post.mock.callCount(),1);}
    finally {post.mock.restore();}
  }} finally {get.mock.restore();embed.mock.restore();}
});

test("every scroll reader includes auth and retains page zero as PDF page one",async()=>{
  const key=config.qdrant.apiKey;config.qdrant.apiKey="test-secret";
  const requests:any[]=[];const post=mock.method(axios,"post",async(url: string,body: any,options: any)=>{requests.push({url,body,options});return {data:{result:{points:[{id:"p",payload:{filename:"science.pdf",text:"First page",pages:[0],page_start:0}}]}}};});
  try {await qdrantService.scrollPoints();const rows=await qdrantService.searchByKeywordPayload("First page",5,{filename:"science.pdf",minPage:1,maxPage:1});assert.equal(rows.length,1);assert.deepEqual(rows[0].pages,[1]);assert.ok(requests.every(r=>r.options.headers["api-key"]==="test-secret"));}
  finally {post.mock.restore();config.qdrant.apiKey=key;}
  assert.deepEqual(knowledgeBasePdfPages({}),[]);assert.deepEqual(knowledgeBasePdfPages({pages:[-1,"0",null,0,2,2]}),[1,3]);
});

test("document inventory excludes completed jobs from retired collections",async()=>{
  const queries:any[]=[];
  const stub=mock.method(curriculumDbService as any,"getPool",()=>({query:async(sql:string,values:unknown[])=>{queries.push({sql,values});return {rows:[]};}}));
  try {await curriculumDbService.getUniqueCurriculumTextbooks();await curriculumDbService.getCompletedCurriculumJobs();await curriculumDbService.checkDatabaseHealth();
    assert.equal(queries.length,3);assert.ok(queries.every(q=>/qdrant_collection = \$1/.test(q.sql)));assert.ok(queries.every(q=>q.values[0]==="pdf_knowledge_base_v2"));
  }finally{stub.mock.restore();}
});

test("fallback inventory follows all scroll pages instead of listing just the first textbook",async()=>{
  const db=mock.method(curriculumDbService,"getUniqueCurriculumTextbooks",async()=>[]);
  const requests:any[]=[];const post=mock.method(axios,"post",async(_url:string,body:any)=>{
    requests.push(body);return {data:{result:{points:[{id:String(requests.length),payload:{filename:requests.length===1?"science.pdf":"history.pdf",job_id:"new-job",text:"textbook",pages:[0],total_chunks:1}}],...(requests.length===1?{next_page_offset:"next"}:{})}}};
  });
  try {const docs=await qdrantService.getIngestedDocuments();assert.equal(docs.length,2);assert.equal(requests[1].offset,"next");assert.deepEqual(docs[0].pages,[1]);}
  finally {db.mock.restore();post.mock.restore();}
});

test("ICT references paginate by indexed job, send auth and convert v2 pages without accepting replacement jobs",async()=>{
  const key=config.qdrant.apiKey;config.qdrant.apiKey="test-secret";
  const calls:any[]=[];
  const service: ICTCoverageReviewService=new ICTCoverageReviewService(async()=>{throw Error("inference must not run");},async(_url,init)=>{
    const body=JSON.parse(String(init?.body));calls.push({body,headers:init?.headers});
    const source=service.catalog().concepts[0].textbook;
    const points=calls.length===1 ? [{payload:{job_id:"unverified-replacement",filename:source.filename,pages:[52],text:"Unverified source"}}]
      : [{payload:{job_id:source.jobId,filename:source.filename,pages:[52],text:"CPU instructions and execution"}}];
    return new Response(JSON.stringify({result:{points,...(calls.length===1?{next_page_offset:"later"}:{})}}));
  });
  try {const result=await service.reference("ict-g10-u02-cpu");assert.equal(calls.length,2);assert.equal(calls[1].body.offset,"later");
    assert.ok(calls.every(c=>c.body.filter.must.length===1&&c.body.filter.must[0].key==="job_id"));
    assert.ok(calls.every(c=>c.headers["api-key"]==="test-secret"));assert.equal(result.passages.length,1);assert.deepEqual(result.passages[0].pdfPages,[53]);
  }finally {service.dispose();config.qdrant.apiKey=key;}
});
