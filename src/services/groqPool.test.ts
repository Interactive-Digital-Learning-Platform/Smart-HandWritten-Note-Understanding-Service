import test from "node:test";
import assert from "node:assert/strict";
import {groqPool} from "./groqPool";

test("all-key model quota failures are remembered while existing fallback models remain usable",async(t)=>{
  const pool=groqPool as any;
  const previous={clients:pool.clients,currentIndex:pool.currentIndex,keyCooldowns:pool.keyCooldowns,modelCooldowns:pool.modelCooldowns};
  t.after(()=>Object.assign(pool,previous));
  let limited=0,available=0;
  pool.currentIndex=0;pool.keyCooldowns=new Map();pool.modelCooldowns=new Map();
  pool.clients=[0,1].map(index=>({index,client:{chat:{completions:{create:async(request:any)=>{
    if(request.model==="exhausted") {limited++;throw Object.assign(Error("Rate limit; try again in 18m2s"),{status:429});}
    available++;return {choices:[{message:{content:"usable fallback response"}}]};
  }}}}}));
  const request={model:"exhausted",messages:[{role:"user" as const,content:"Synthetic test"}]};
  await groqPool.createChatCompletion(request,{fallbackModels:["available"]});
  assert.equal(limited,2);assert.equal(available,1);
  assert.ok(pool.modelCooldowns.get("exhausted")>Date.now()+1_000_000);
  await groqPool.createChatCompletion(request,{fallbackModels:["available"]});
  assert.equal(limited,2);assert.equal(available,2);
});

test("a vision-model cooldown does not hide usable keys for text models",t=>{
  const pool=groqPool as any;
  const previous={clients:pool.clients,currentIndex:pool.currentIndex,keyCooldowns:pool.keyCooldowns};
  t.after(()=>Object.assign(pool,previous));
  pool.clients=[{index:0,client:{}},{index:1,client:{}}];pool.currentIndex=0;pool.keyCooldowns=new Map();
  groqPool.markCooldown(0,60000,"vision");
  assert.equal(groqPool.getStatus("vision").healthyKeys,1);
  assert.equal(groqPool.getStatus("text").healthyKeys,2);
  assert.equal(groqPool.getNextClient("text").keyIndex,0);
  assert.equal(groqPool.getNextClient("vision").keyIndex,1);
});

test("ordinary text fallback preserves the configured vision model's quota",async(t)=>{
  const pool=groqPool as any;
  const previous={clients:pool.clients,currentIndex:pool.currentIndex,keyCooldowns:pool.keyCooldowns,modelCooldowns:pool.modelCooldowns};
  t.after(()=>Object.assign(pool,previous));
  pool.currentIndex=0;pool.keyCooldowns=new Map();pool.modelCooldowns=new Map();
  const models:string[]=[];
  pool.clients=[{index:0,client:{chat:{completions:{create:async(request:any)=>{
    models.push(request.model);
    if(request.model==='openai/gpt-oss-120b')throw Object.assign(Error('rate limit'),{status:429});
    return {choices:[{message:{content:'Synthetic fallback response'}}]};
  }}}}}];
  await groqPool.createChatCompletion({model:'openai/gpt-oss-120b',messages:[{role:'user',content:'Test'}]});
  assert.deepEqual(models,['openai/gpt-oss-120b','openai/gpt-oss-20b']);
});
