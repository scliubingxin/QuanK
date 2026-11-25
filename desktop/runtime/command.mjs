import {bundledExecutable} from './bundled-runtime.mjs';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { stat, access, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolveGranted } from '../core.mjs';
// Truncate UTF-8 only between code points so Chinese and emoji are not turned
// into replacement characters when the CLI output budget is reached.
function utf8Prefix(text,limit){
 const b=Buffer.from(text);let end=Math.min(b.length,limit);
 while(end>0&&end<b.length&&(b[end]&0xc0)===0x80)end--;
 return b.subarray(0,end).toString('utf8');
}
function utf8Suffix(text,limit){
 const b=Buffer.from(text);let start=Math.max(0,b.length-limit);
 while(start<b.length&&(b[start]&0xc0)===0x80)start++;
 return b.subarray(start).toString('utf8');
}
// Streaming checkpoints use a UTF-16 character budget, not a byte budget.
// Keep both halves of surrogate pairs together at either boundary.
export function utf16Prefix(text,limit){
 let end=Math.max(0,Math.min(text.length,limit));
 if(end>0&&end<text.length&&text.charCodeAt(end-1)>=0xd800&&text.charCodeAt(end-1)<=0xdbff&&text.charCodeAt(end)>=0xdc00&&text.charCodeAt(end)<=0xdfff)end--;
 return text.slice(0,end);
}
export function utf16Suffix(text,limit){
 let start=Math.max(0,text.length-limit);
 if(start>0&&start<text.length&&text.charCodeAt(start)>=0xdc00&&text.charCodeAt(start)<=0xdfff&&text.charCodeAt(start-1)>=0xd800&&text.charCodeAt(start-1)<=0xdbff)start++;
 return text.slice(start);
}
export function commandEnvironment(source=process.env) {
  const env={};
  for(const name of ['HOME','USERPROFILE','APPDATA','LOCALAPPDATA','SystemRoot','WINDIR','TEMP','TMP','TMPDIR','LANG','LC_ALL','SHELL','COMSPEC','PATHEXT','USER','LOGNAME'])if(source[name])env[name]=source[name];
  const home=source.HOME||source.USERPROFILE||homedir();
  const extras=process.platform==='win32'?[path.join(home,'AppData','Roaming','npm')]:['/opt/homebrew/bin','/usr/local/bin',path.join(home,'.local','bin'),path.join(home,'.cargo','bin'),path.join(home,'.npm-global','bin'),'/usr/bin','/bin'];
  env.PATH=[source.PATH||'',...extras].filter(Boolean).join(path.delimiter);
  // Electron is the Node runtime used by the app; node children must run as Node.
  env.ELECTRON_RUN_AS_NODE='1';if(!env.PYTHONDONTWRITEBYTECODE)env.PYTHONDONTWRITEBYTECODE=source.PYTHONDONTWRITEBYTECODE||'1';return env;
}
async function resolveExecutable(executable) {
  if(['python','python3','python3.12'].includes(executable)){const builtin=await bundledExecutable('python');if(builtin)return builtin;}

  if(executable==='node'&&process.versions.electron)return process.execPath;
  if(path.isAbsolute(executable)){await access(executable,constants.X_OK);return executable;}
  if(executable.includes('/')||executable.includes('\\'))throw new Error('程序路径请使用绝对路径');
  const directories=commandEnvironment().PATH.split(path.delimiter);
  if(process.platform!=='win32'){
    try{const base=path.join(homedir(),'.nvm','versions','node');for(const version of (await readdir(base)).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true})))directories.push(path.join(base,version,'bin'));}catch{}
    directories.push(path.join(homedir(),'.volta','bin'));
  }
  const extensions=process.platform==='win32'?['','.exe','.com']:[''];
  for(const directory of directories.filter(Boolean))for(const extension of extensions){const target=path.resolve(directory,executable+extension);try{await access(target,constants.X_OK);if((await stat(target)).isFile())return target;}catch{}}
  throw new Error(`找不到命令 ${executable}。请先安装此 CLI，或填写其绝对路径。`);
}
export async function prepareCommand(folders,p) {
  if(typeof p.executable!=='string'||!p.executable.trim()||p.executable.length>1024||/[\0\r\n]/.test(p.executable))throw new Error('请输入可执行文件名或绝对路径');
  if(!Array.isArray(p.args)||p.args.length>100||p.args.some(a=>typeof a!=='string'||a.length>10000||a.includes('\0')))throw new Error('参数必须是字符串数组，最多 100 项');
  const cwd=await resolveGranted(folders,p.folderId,p.relative||'');if(!(await stat(cwd)).isDirectory())throw new Error('工作目录必须是文件夹');
  const timeoutMs=p.timeoutMs===undefined?120000:p.timeoutMs;if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>300000)throw new Error('超时必须在 100 到 300000 毫秒之间');
  return {executable:await resolveExecutable(p.executable.trim()),requestedExecutable:p.executable.trim(),args:[...p.args],cwd,timeoutMs};
}
function missingPythonPackage(stderr) {
    const module = stderr.match(/^ModuleNotFoundError: No module named ['"]([a-zA-Z_][\w.]*)['"]/m)?.[1];
    if (!module) return '';
    const root = module.split('.')[0];
    const distributions = {docx: 'python-docx', pptx: 'python-pptx', PIL: 'Pillow'};
    const packageName = Object.hasOwn(distributions, root) ? distributions[root] : root;
    return `缺少 Python 模块 ${module}。QuankSight 0.56 起不再内置这些包。可在系统 Python 中运行 pip install ${packageName}，或在技能设置中改用系统 Python。`;
}

export function runCommand(command,{signal,onOutput=()=>{},maxBytes=1024*1024,outputMode='stop',environment}={}) {
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new Error('执行已取消'));return;}
    const started=Date.now();let child,stdout='',stderr='',bytes=0,stopped='',forceTimer,settled=false,pipeTimer,outputError;
    let timer;
    function kill(){
      if(!child?.pid)return;
      if(process.platform==='win32'){const killer=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>child.kill());}
      else{try{process.kill(-child.pid,'SIGTERM');}catch{try{child.kill('SIGTERM');}catch{}}forceTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},800);forceTimer.unref();}
    }
    function stop(reason){if(!stopped){stopped=reason;kill();}}
    const abort=()=>stop('cancelled');
    function finish(exitCode,exitSignal,error){if(settled)return;settled=true;clearTimeout(timer);clearTimeout(pipeTimer);if(!stopped)clearTimeout(forceTimer);signal?.removeEventListener('abort',abort);if(outputError){reject(new Error('处理命令输出失败，已请求停止进程；请检查实际执行状态',{cause:outputError}));return;}if(error){reject(new Error(error.code==='ENOENT'?`找不到命令 ${command.executable}。请安装此 CLI，或填写其绝对路径。`:error.code==='EACCES'||error.code==='EPERM'?`无法执行命令 ${command.executable}：没有执行权限，或者它没有安装而 PATH 里有无权访问的目录。请确认已安装并可执行，或填写其绝对路径。`:error.message));return;}const hint = !stopped && exitCode !== 0 ? missingPythonPackage(stderr) : ''; if (hint) stderr = hint + '\n' + stderr; resolve({stdout,stderr,exitCode,signal:exitSignal,elapsedMs:Date.now()-started,status:stopped||(exitCode===0?'succeeded':'failed'),truncated:outputMode==='tail'?bytes>maxBytes:stopped==='output_limit',outputBytes:bytes});}
    try{child=spawn(command.executable,command.args,{cwd:command.cwd,env:environment||commandEnvironment(),shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});}catch(e){finish(null,null,e);return;}
    for(const [stream,field] of [[child.stdout,'stdout'],[child.stderr,'stderr']]){
      stream.setEncoding('utf8');stream.on('data',chunk=>{
        const received=Buffer.byteLength(chunk),remaining=Math.max(0,maxBytes-bytes);
        const part=outputMode==='tail'?chunk:utf8Prefix(chunk,remaining);
        bytes+=received;
        const append=previous=>outputMode==='tail'?utf8Suffix(previous+part,Math.floor(maxBytes/2)):previous+part;
        if(field==='stdout')stdout=append(stdout);else stderr=append(stderr);
        if(!outputError)try{onOutput({stream:field,text:part});}catch(error){outputError=error||Error('输出处理失败');stop('output_error');}
        if(outputMode!=='tail'&&bytes>maxBytes)stop('output_limit');
      });
    }
    child.once('error',e=>finish(null,null,e));
    child.once('exit',(code,sig)=>{pipeTimer=setTimeout(()=>{stop('inherited_pipes');child.stdout.destroy();child.stderr.destroy();finish(code,sig);},1000);pipeTimer.unref();});
    child.once('close',(code,sig)=>finish(code,sig));
    timer=setTimeout(()=>stop('timed_out'),command.timeoutMs);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  });
}

// CLI-Anything style structured stdout, independent of exit status.
export function commandJson(text){
 if(typeof text!=='string'||Buffer.byteLength(text)>32768)return;
 try{const data=JSON.parse(text);if(!data||typeof data!=='object')return;let nodes=0;function visit(x,depth){if(++nodes>2000||depth>32)throw Error('JSON budget');if(x&&typeof x==='object')for(const v of Object.values(x))visit(v,depth+1);}visit(data,0);return data;}catch{return;}
}

// Automatic consent is limited to a fixed system `find` with a read-only expression
// rooted at the already-authorized working directory. No shell or side-effect action.
export async function isReadOnlyFind(command) {
  if (!['darwin','linux'].includes(process.platform) || !['/usr/bin/find','/bin/find'].includes(command?.executable) || !Array.isArray(command.args) || command.args.length>60) return false;
  const {realpath}=await import('node:fs/promises');let resolved;try{resolved=await realpath(command.executable);}catch{return false;}
  if (!['/usr/bin/find','/bin/find'].includes(resolved)) return false;
  const args=command.args;let i=0;if(args[0]==='.')i++;else if(args[0]&&!args[0].startsWith('-')&&!['!','('].includes(args[0]))return false;
  const flags=new Set(['-name','-iname','-path','-ipath','-type','-maxdepth','-mindepth']);
  const operators=new Set(['-a','-and','-o','-or','!','-not','(',')','-print','-print0','-prune','-depth']);
  for(;i<args.length;i++){
    const a=args[i];if(operators.has(a))continue;if(!flags.has(a)||++i>=args.length)return false;const value=args[i];
    if(typeof value!=='string'||value.length>256||/[\x00-\x1f\x7f]/.test(value))return false;
    if(a==='-type'&&!['f','d','l'].includes(value))return false;
    if(['-maxdepth','-mindepth'].includes(a)&&(!/^\d{1,2}$/.test(value)||Number(value)>20))return false;
  }
  return true;
}
