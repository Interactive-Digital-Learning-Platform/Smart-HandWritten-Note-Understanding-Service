import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import path from 'node:path';
import {unlink} from 'node:fs/promises';
import {upload} from './upload';
import {errorHandler} from './errorHandler';
import {config} from '../config/config';

test('Notes uploads accept supported images and reject SVG or more than twenty pages with actionable errors',async()=>{
  const app=express(),created:string[]=[];
  app.post('/upload',upload.any(),(req,res)=>{const files=req.files as Express.Multer.File[];created.push(...files.map(f=>f.path));res.json({count:files.length});});
  app.use(errorHandler);const server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const url=`http://127.0.0.1:${(server.address() as any).port}/upload`;
  try{
    const image=new FormData();image.append('images',new Blob(['synthetic fixture'],{type:'image/png'}),'fixture.png');
    assert.equal((await fetch(url,{method:'POST',body:image})).status,200);
    const unsupported=new FormData();unsupported.append('images',new Blob(['<svg/>'],{type:'image/svg+xml'}),'fixture.svg');
    assert.equal((await fetch(url,{method:'POST',body:unsupported})).status,400);
    const excess=new FormData();for(let i=0;i<21;i++)excess.append('images',new Blob(['synthetic fixture'],{type:'image/png'}),`fixture-${i}.png`);
    const response=await fetch(url,{method:'POST',body:excess});assert.equal(response.status,400);
    assert.match((await response.json() as any).error,/20 note pages/);
  }finally{
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    for(const file of created){assert.ok(path.resolve(file).startsWith(path.resolve(config.uploads.uploadDir)+path.sep));await unlink(file);}
  }
});
