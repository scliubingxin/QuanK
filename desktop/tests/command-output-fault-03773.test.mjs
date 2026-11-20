import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {runCommand} from '../runtime/command.mjs';
import {Store} from '../core.mjs';
import {ToolRuntime} from '../runtime/tools.mjs';

test('CLI output callback failure terminates the real child and rejects the result',{timeout:10000},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'wb-output-error-'));
 try{
  const code="require('fs').writeFileSync(process.argv[1],String(process.pid));console.log('output');setTimeout(()=>{},10000)";
  let calls=0;
  await assert.rejects(runCommand({executable:process.execPath,args:['-e',code,path.join(dir,'pid')],cwd:dir,timeoutMs:5000},{onOutput(){calls++;throw Error('observer failed')}}),/处理命令输出失败.*检查实际执行状态/);
  assert.equal(calls,1);const pid=Number(await readFile(path.join(dir,'pid'),'utf8'));assert.throws(()=>process.kill(pid,0));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('ToolRuntime records output notification failure after terminating its real CLI child',{timeout:10000},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'wb-output-runtime-'));
 try{
  const store=new Store(dir);await store.load();store.data.folders=[{id:'f',path:dir}];let notifications=0;
  const runtime=new ToolRuntime({store,browser:{},approve:async()=>true,notify:()=>{if(++notifications===3)throw Error('notification unavailable')}});
  const code="require('fs').writeFileSync(process.argv[1],String(process.pid));console.log('output');setTimeout(()=>{},10000)";
  const result=await runtime.execute('cli_execute',{executable:process.execPath,args:['-e',code,path.join(dir,'pid')],folderId:'f',timeoutMs:5000});
  assert.equal(result.status,'failed');assert.match(result.error,/处理命令输出失败/);assert.equal(store.data.executions[0].status,'failed');
  const pid=Number(await readFile(path.join(dir,'pid'),'utf8'));assert.throws(()=>process.kill(pid,0));
 }finally{await rm(dir,{recursive:true,force:true});}
});
