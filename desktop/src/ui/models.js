const labels={fast:'快速 · 非思考',balanced:'均衡 · 日常工作',extreme:'极致 · 高强度思考'};
export function modelChoiceLabel(state,choice,effort){
 const auto={fast:'快速',balanced:'均衡',extreme:'极致'};
 if(choice.startsWith('auto:'))return auto[choice.slice(5)]||'选择模型';
 if(choice==='legacy')return state.settings.model==='尚未配置'?'选择模型':state.settings.model||'选择模型';
 const p=(state.modelProfiles||[]).find(p=>p.enabled&&'profile:'+p.id===choice);
 if(!p)return '重新选择模型';
 const strength={off:'非思考',low:'低',medium:'中',high:'高'}[effort||p.effort];
 return p.name+(strength?' · '+strength:'');
}
export function modelPicker(state,choice,effort,escape){
 return `<label>模型<select id="modelChoice" aria-label="选择模型或自动档位"><option value="legacy" ${choice==='legacy'?'selected':''}>原配置：${escape(state.settings.model)}</option><optgroup label="按已配置类型自动选择">${Object.entries(labels).map(([id,name])=>`<option value="auto:${id}" ${choice==='auto:'+id?'selected':''}>自动 · ${name}</option>`).join('')}</optgroup>${choice.startsWith('profile:')&&!(state.modelProfiles||[]).some(p=>p.enabled&&'profile:'+p.id===choice)?`<option value="${escape(choice)}" selected disabled>配置已移除/停用，请重新选择</option>`:''}<optgroup label="指定模型">${(state.modelProfiles||[]).filter(p=>p.enabled).map(p=>`<option value="profile:${escape(p.id)}" ${choice==='profile:'+p.id?'selected':''}>${escape(p.name)} · ${escape(p.model)}</option>`).join('')}</optgroup></select></label>${choice.startsWith('profile:')?`<label>思考强度<select id="modelEffort" aria-label="思考强度">${[['','按模型配置'],['off','关闭思考'],['low','低'],['medium','中'],['high','高']].map(([id,n])=>`<option value="${id}" ${effort===id?'selected':''}>${n}</option>`).join('')}</select></label>`:''}<button class="context-button" data-action="settings">模型配置</button><small>本轮资料及最近对话发送到所选模型；自动档位按配置类型选择。</small>`;
}
// [F1c] Model settings in a simple 「选供应商 → 填 API Key → 选模型」 flow; everything else under 高级设置.
export const MODEL_PROVIDERS = [
  ['deepseek', 'DeepSeek', 'https://api.deepseek.com', 'deepseek', ['deepseek-chat', 'deepseek-reasoner'], 'https://platform.deepseek.com/api_keys'],
  ['qwen', '阿里云百炼（通义千问）', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'qwen', ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen-long'], 'https://bailian.console.aliyun.com/'],
  ['moonshot', 'Kimi（月之暗面）', 'https://api.moonshot.cn/v1', 'none', ['kimi-k2-0905-preview', 'moonshot-v1-32k', 'moonshot-v1-128k'], 'https://platform.moonshot.cn/console/api-keys'],
  ['zhipu', '智谱 GLM', 'https://open.bigmodel.cn/api/paas/v4', 'none', ['glm-4.6', 'glm-4-plus', 'glm-4-flash'], 'https://open.bigmodel.cn/usercenter/apikeys'],
  ['doubao', '火山方舟（豆包）', 'https://ark.cn-beijing.volces.com/api/v3', 'none', [], 'https://console.volcengine.com/ark'],
  ['hunyuan', '腾讯混元', 'https://api.hunyuan.cloud.tencent.com/v1', 'none', ['hunyuan-turbos-latest', 'hunyuan-t1-latest'], 'https://console.cloud.tencent.com/hunyuan/api-key'],
  ['siliconflow', '硅基流动', 'https://api.siliconflow.cn/v1', 'none', ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen3-235B-A22B'], 'https://cloud.siliconflow.cn/account/ak'],
  ['openai', 'OpenAI', 'https://api.openai.com/v1', 'openai', ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o-mini'], 'https://platform.openai.com/api-keys'],
  ['ollama', '本机 Ollama', 'http://127.0.0.1:11434/v1', 'none', ['qwen3:8b', 'llama3.1:8b'], 'https://ollama.com/library'],
  ['custom', '自定义（OpenAI 兼容）', '', 'none', [], ''],
];
export const providerOf = baseUrl => { const u = String(baseUrl || '').replace(/\/+$/, ''); return (MODEL_PROVIDERS.find(p => p[2] && u === p[2].replace(/\/+$/, '')) || MODEL_PROVIDERS.at(-1))[0]; };

export function modelLibrary(state,escape){
 const rows=state.modelProfiles||[];
 const host=u=>{try{return new URL(u).host;}catch{return u||'';}};
 const card=p=>{const prov=MODEL_PROVIDERS.find(x=>x[0]===providerOf(p.baseUrl));return `<div class="ml-card${p.enabled?'':' off'}"><span class="ml-icon">${escape((prov?.[1]||p.name||'模').slice(0,1))}</span><div class="ml-main"><b>${escape(p.name)}</b><small>${escape(p.model)} · ${escape(prov&&prov[0]!=='custom'?prov[1]:host(p.baseUrl))}</small><div class="ml-tags"><span class="ml-tag">${escape(labels[p.kind]||p.kind)}</span>${p.enabled?'<span class="ml-tag on">已启用</span>':'<span class="ml-tag">已停用</span>'}${p.hasKey?`<span class="ml-tag">${p.keySaved?'密钥已加密保存':'密钥仅本次运行'}</span>`:'<span class="ml-tag warn">未填写密钥</span>'}</div></div><div class="ml-actions"><button type="button" data-action="modelEdit" data-id="${escape(p.id)}">编辑</button><button type="button" data-action="modelRemove" data-id="${escape(p.id)}">删除</button></div></div>`;};
 return `<div class="ml">${rows.length?`<div class="ml-list">${rows.map(card).join('')}</div>`:`<div class="ml-empty"><b>还没有添加模型</b><p>选择一家模型服务，填入 API Key 即可开始使用。支持所有兼容 OpenAI 接口的服务，也支持本机 Ollama。</p></div>`}
<div class="ml-bar"><button type="button" data-action="modelEdit" class="primary">＋ 添加模型</button><button type="button" class="ml-link" data-action="legacySettings">工作空间与旧版模型设置</button></div>
<details class="ml-help"><summary>自动选择是怎么工作的？</summary><p>可以保存多个模型。对话里选「自动」时，按模型的类型、是否启用、是否支持工具与图片来挑选，优先级数字越小越优先；没有合适模型时会明确提示，不会偷偷换到别的服务。</p><p>快速：能关闭思考的模型；均衡：日常对话（DeepSeek 用 low）；极致：支持深度思考的模型。实际速度、质量和费用以服务商为准。</p></details></div>`;
}
export function modelForm(p,secure,escape){
 const prov=p.id?providerOf(p.baseUrl):'deepseek', P=MODEL_PROVIDERS.find(x=>x[0]===prov);
 const field=(label,key,value,type='text',extra='')=>`<label>${label}<input name="${key}" type="${type}" value="${escape(String(value??''))}" ${extra}></label>`;
 const select=(label,key,values,current)=>`<label>${label}<select name="${key}">${values.map(([v,n])=>`<option value="${v}" ${v===current?'selected':''}>${n}</option>`).join('')}</select></label>`;
 const check=(name,label,value)=>`<label class="check"><input type="checkbox" name="${name}" ${value?'checked':''}>${label}</label>`;
 const models=(P?.[4]||[]);
 return `<div class="mf" data-model-form>
<div class="mf-row"><div class="mf-label"><span>供应商（仅支持 OpenAI 兼容协议 API）</span>${P?.[5]?`<a class="mf-doc rendered-link" href="${escape(P[5])}" data-mf-doc>获取 API Key ↗</a>`:'<span class="mf-doc" data-mf-doc></span>'}</div>
<select name="provider" data-mf-provider>${MODEL_PROVIDERS.map(([id,name])=>`<option value="${id}" ${id===prov?'selected':''}>${escape(name)}</option>`).join('')}</select></div>
<div class="mf-row mf-custom" ${prov==='custom'?'':'hidden'}><div class="mf-label"><span>接口地址（Base URL）</span></div><input name="baseUrl" data-mf-base value="${escape(p.baseUrl||P?.[2]||'https://api.deepseek.com')}" placeholder="https://example.com/v1"></div>
<div class="mf-row"><div class="mf-label"><span>API Key${p.hasKey?'（已保存，留空则保留原密钥）':''}</span></div><div class="mf-key"><input name="apiKey" type="password" autocomplete="off" placeholder="${prov==='ollama'?'本机 Ollama 无需密钥':'输入你的 API Key'}" data-mf-key><button type="button" class="secondary" data-mf-test>测试连接</button></div><small class="mf-result" data-mf-result hidden></small></div>
<div class="mf-row"><div class="mf-label"><span>模型名称</span><button type="button" class="mf-fetch" data-mf-fetch>获取模型列表</button></div><input name="model" list="mfModels" value="${escape(p.model||models[0]||'')}" placeholder="例如 deepseek-chat" data-mf-model><datalist id="mfModels">${models.map(m=>`<option value="${escape(m)}"></option>`).join('')}</datalist></div>
${check('persistKey',secure?'用系统钥匙串加密保存 API Key（推荐）':'系统加密不可用：密钥只在本次运行中使用',secure)}
<details class="mf-adv"><summary>高级设置</summary><div class="mf-adv-body">
${field('显示名称','name',p.name||(P?P[1]:''),'text','data-mf-name')}${select('自动选择类型','kind',Object.entries(labels),p.kind||'balanced')}${select('思考参数协议','protocol',[['none','不发送思考参数（非思考模型）'],['openai','OpenAI reasoning_effort'],['deepseek','DeepSeek thinking + reasoning_effort'],['qwen','Qwen enable_thinking + thinking_budget']],p.protocol||P?.[3]||'none')}${select('默认思考强度','effort',[['off','关闭'],['low','低'],['medium','中（DeepSeek 请用低/高）'],['high','高']],p.effort||'off')}
<div class="mf-checks">${check('tools','支持工具调用（tools）',p.id?p.tools:true)}${check('vision','支持图片输入',p.vision)}${check('enabled','允许选择与自动路由',p.enabled!==false)}${check('supportsOff','支持 reasoning_effort=none',p.supportsOff)}</div>
<div class="mf-grid">${field('自动选择优先级 0–100','priority',p.priority??10,'number')}${field('每次任务调用轮数 1–96','maxSteps',p.maxSteps??32,'number')}${field('文本字符预算','maxInputChars',p.maxInputChars||200000,'number')}${field('最大输出 Token 256–32768','outputTokens',p.outputTokens||4096,'number')}</div>
${select('输出预算字段','tokenParameter',[['max_tokens','max_tokens'],['max_completion_tokens','max_completion_tokens（部分思考模型需要）']],p.tokenParameter||'max_tokens')}${p.hasKey?check('clearKey','清除已保存的密钥',false):''}
<p class="muted">保存时不会自动联网；「测试连接」只向你选的服务发送一条很短的请求。密钥不回填显示，地址或模型变化时需要重新填写。</p></div></details></div>`;
}
/** Wire provider presets, custom base URL, display-name autofill, test connection and model list into an open form. */
export function bindModelForm(root,{test}={}){
 const f=root.querySelector('[data-model-form]');if(!f)return;
 const $=s=>f.querySelector(s),prov=$('[data-mf-provider]'),base=$('[data-mf-base]'),model=$('[data-mf-model]'),name=$('[data-mf-name]'),key=$('[data-mf-key]'),res=$('[data-mf-result]'),list=f.querySelector('#mfModels');
 let nameTouched=!!(name&&name.value&&!MODEL_PROVIDERS.some(p=>p[1]===name.value)&&!/ · /.test(name.value));
 name?.addEventListener('input',()=>{nameTouched=true;});
 const autoName=()=>{if(nameTouched||!name)return;const P=MODEL_PROVIDERS.find(x=>x[0]===prov.value);name.value=[P&&P[0]!=='custom'?P[1].replace(/（.*）/,''):'',model.value].filter(Boolean).join(' · ')||'自定义模型';};
 const show=(t,ok)=>{res.hidden=false;res.textContent=t;res.className='mf-result '+(ok?'ok':'bad');};
 prov?.addEventListener('change',()=>{const P=MODEL_PROVIDERS.find(x=>x[0]===prov.value);if(!P)return;
  f.querySelector('.mf-custom').hidden=P[0]!=='custom';if(P[2])base.value=P[2];
  const proto=f.querySelector('[name="protocol"]');if(proto)proto.value=P[3];
  list.innerHTML=P[4].map(m=>`<option value="${m.replace(/"/g,'&quot;')}"></option>`).join('');model.value=P[4][0]||'';
  key.placeholder=P[0]==='ollama'?'本机 Ollama 无需密钥':'输入你的 API Key';
  const doc=f.querySelector('[data-mf-doc]');if(doc){if(P[5]&&doc.tagName==='A'){doc.href=P[5];doc.hidden=false;}else doc.hidden=true;}
  res.hidden=true;autoName();});
 model?.addEventListener('input',autoName);
 const call=async(kind,btn)=>{if(!test)return;btn.disabled=true;show(kind==='models'?'正在获取模型列表…':'正在测试…',true);
  try{const r=await test({baseUrl:base.value.trim(),model:model.value.trim(),apiKey:key.value.trim(),kind});
   if(kind==='models'){const ms=(r.models||[]).slice(0,200);if(!ms.length)throw Error('服务没有返回模型列表，请手动填写模型名称');list.innerHTML=ms.map(m=>`<option value="${String(m).replace(/"/g,'&quot;')}"></option>`).join('');if(!model.value)model.value=ms[0];show(`已获取 ${ms.length} 个模型，在「模型名称」里选择`,true);}
   else show(`连接成功 · ${r.ms} ms${r.reply?` · 模型回复「${String(r.reply).slice(0,20)}」`:''}`,true);}
  catch(e){show(String(e?.message||e).replace(/^Error invoking remote method '[^']+': (Error: )?/,''),false);}finally{btn.disabled=false;}};
 $('[data-mf-test]')?.addEventListener('click',e=>call('chat',e.currentTarget));
 $('[data-mf-fetch]')?.addEventListener('click',e=>call('models',e.currentTarget));
 autoName();
}
