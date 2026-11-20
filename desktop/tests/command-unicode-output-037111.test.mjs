import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runCommand,utf16Prefix,utf16Suffix} from '../runtime/command.mjs';

function command(script){return {executable:process.execPath,args:['-e',script],cwd:process.cwd(),timeoutMs:3000};}
test('CLI output limit preserves a whole Chinese character and reports original bytes',async()=>{
 let observed='';
 const result=await runCommand(command("process.stdout.write('abc中文🙂')"),{maxBytes:7,onOutput:({text})=>{observed+=text;}});
 assert.equal(result.status,'output_limit');
 assert.equal(result.stdout,'abc中');assert.equal(observed,'abc中');
 assert.ok(!result.stdout.includes('\uFFFD'));assert.ok(Buffer.byteLength(result.stdout)<=7);
 assert.ok(result.outputBytes>7);
});
test('long-running service tail keeps bounded complete UTF-8 characters',async()=>{
 const result=await runCommand(command("process.stdout.write('X中文🙂')"),{maxBytes:10,outputMode:'tail'});
 assert.equal(result.status,'succeeded');assert.equal(result.stdout,'🙂');
 assert.ok(!result.stdout.includes('\uFFFD'));assert.ok(Buffer.byteLength(result.stdout)<=5);
 assert.equal(result.truncated,true);
});
test('stdout and stderr retain separate valid tails under a shared byte budget',async()=>{
 const result=await runCommand(command("process.stdout.write('abc中文');process.stderr.write('xyz🙂')"),{maxBytes:8,outputMode:'tail'});
 assert.ok(Buffer.byteLength(result.stdout)<=4);assert.ok(Buffer.byteLength(result.stderr)<=4);
 assert.ok(!result.stdout.includes('\uFFFD'));assert.ok(!result.stderr.includes('\uFFFD'));
 assert.equal(result.truncated,true);
});
test('a UTF-8 sequence split across child writes is decoded before limiting',async()=>{
 const source="const b=Buffer.from('中文🙂');process.stdout.write(b.subarray(0,2));setTimeout(()=>process.stdout.write(b.subarray(2)),30)";
 let observed='';
 const result=await runCommand(command(source),{maxBytes:7,onOutput:({text})=>{observed+=text;}});
 assert.equal(result.status,'output_limit');
 assert.equal(result.stdout,'中文');assert.equal(observed,'中文');
 assert.ok(!result.stdout.includes('\uFFFD'));
});
test('checkpoint boundaries do not split UTF-16 surrogate pairs',()=>{
 assert.equal(utf16Prefix('a🙂tail',2),'a');
 assert.equal(utf16Prefix('a🙂tail',3),'a🙂');
 assert.equal(utf16Suffix('head🙂b',2),'b');
 assert.equal(utf16Suffix('head🙂b',3),'🙂b');
});
