import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createOfficeAdapter, webhookUrl, feishuText } from '../services/connector-office.mjs';
import { createConnectorService } from '../services/connectors.mjs';
import { kindInfo, CONNECTOR_KINDS } from '../src/shared/connectors.js';
import { connectorForm, connectorsPage, officeMessageForm, officeMessagePayload } from '../src/ui/connectors.js';

const NOW = Date.UTC(2026, 10, 19, 4);
const FS_HOOK = 'https://open.feishu.cn/open-apis/bot/v2/hook/0a1b2c3d-4e5f-6789';
const DD_HOOK = 'https://oapi.dingtalk.com/robot/send?access_token=abc123';
const WX_HOOK = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=k-1';
const jres = (obj, status = 200) => { const r = new Response(JSON.stringify(obj), {status, headers: {'content-type': 'application/json'}}); Object.defineProperty(r, 'url', {value: ''}); return r; };
const memStore = () => ({data: {activity: []}, async save() {}, log(t, d) { this.data.activity.unshift({title: t, detail: d}); }});
const codec = {seal: s => 'S:' + Buffer.from(s).toString('base64'), open: c => Buffer.from(c.slice(2), 'base64').toString()};

function server(routes) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    const call = {url, method: init.method || 'GET', headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : null};
    calls.push(call);
    for (const [re, fn] of routes) if (re.test(url)) return jres(fn(call));
    return jres({code: 404, msg: 'no route'}, 404);
  };
  return {calls, fetcher};
}
const svcWith = (fetcher, confirm = async () => true) => { const store = memStore(); return {store, svc: createConnectorService({store, adapters: [createOfficeAdapter()], fetcher, secrets: codec, now: () => NOW, confirm})}; };

test('webhookUrl accepts only the official robot endpoint of the chosen platform', () => {
  assert.equal(webhookUrl('feishu', FS_HOOK).hostname, 'open.feishu.cn');
  assert.equal(webhookUrl('dingtalk', DD_HOOK).searchParams.get('access_token'), 'abc123');
  assert.equal(webhookUrl('wecom', WX_HOOK).searchParams.get('key'), 'k-1');
  for (const [p, bad] of [['feishu', FS_HOOK.replace('https', 'http')], ['feishu', 'https://evil.com/open-apis/bot/v2/hook/0a1b2c3d-4e5f'], ['feishu', 'https://open.feishu.cn.evil.com/open-apis/bot/v2/hook/0a1b2c3d'],
    ['feishu', 'https://open.feishu.cn/open-apis/im/v1/messages'], ['dingtalk', 'https://oapi.dingtalk.com/robot/send'], ['wecom', DD_HOOK], ['dingtalk', 'https://u:p@oapi.dingtalk.com/robot/send?access_token=a'], ['feishu', 'not a url']])
    assert.throws(() => webhookUrl(p, bad), /Webhook/, bad);
});

test('feishuText renders text, post, mentions and placeholders', () => {
  assert.equal(feishuText({msg_type: 'text', body: {content: JSON.stringify({text: '明天<at user_id="x">张三</at>开会'})}}), '明天@张三开会');
  const post = {zh_cn: {title: '周报', content: [[{tag: 'text', text: '进度 '}, {tag: 'at', user_name: '李四'}], [{tag: 'img'}]]}};
  assert.equal(feishuText({msg_type: 'post', body: {content: JSON.stringify(post)}}), '周报\n进度 @李四\n[图片]');
  assert.equal(feishuText({msg_type: 'post', body: {content: JSON.stringify(post.zh_cn)}}), '周报\n进度 @李四\n[图片]');
  assert.equal(feishuText({msg_type: 'image', body: {content: '{}'}}), '[图片]');
  assert.equal(feishuText({msg_type: 'text', body: {content: 'broken'}}), '');
});

const feishuRoutes = (log = {}) => [
  [/tenant_access_token\/internal$/, c => c.body.app_secret === 'sec' ? {code: 0, tenant_access_token: 't-1', expire: 7200} : {code: 10014, msg: 'app secret invalid'}],
  [/\/im\/v1\/chats\?/, c => (c.headers.authorization === 'Bearer t-1' ? {code: 0, data: {items: [{chat_id: 'oc_1', name: '项目群'}, {chat_id: 'oc_2', name: '无权限群'}]}} : {code: 99991663, msg: 'bad token'})],
  [/container_id=oc_1/, c => { log.start = /start_time=(\d+)/.exec(c.url)[1]; return {code: 0, data: {items: log.items || [
    {message_id: 'om_1', msg_type: 'text', create_time: String(NOW - 36e5), body: {content: JSON.stringify({text: '通威样品今天到'})}},
    {message_id: 'om_2', msg_type: 'image', create_time: String(NOW - 72e5), body: {content: '{}'}},
    {message_id: 'om_3', msg_type: 'text', deleted: true, create_time: String(NOW), body: {content: '{"text":"x"}'}}]}}; }],
  [/container_id=oc_2/, () => ({code: 230027, msg: 'Lack of necessary permissions'})],
];

test('feishu: reads recent group messages incrementally; one failing chat does not fail the sync', async () => {
  const log = {};
  const {calls, fetcher} = server(feishuRoutes(log));
  const {store, svc} = svcWith(fetcher);
  const {id, added} = await svc.handle({action: 'add', kind: 'office', config: {platform: 'feishu', appId: 'cli_a1'}, secrets: {appSecret: 'sec'}});
  assert.equal(added, 2);
  assert.deepEqual(calls[0].body, {app_id: 'cli_a1', app_secret: 'sec'});
  assert.equal(Number(log.start), Math.floor((NOW - 3 * 864e5) / 1000));
  assert.deepEqual(store.data.connectorItems.map(i => [i.title, i.kind, i.author]), [['项目群：通威样品今天到', 'message', '项目群'], ['项目群：[图片]', 'message', '项目群']]);
  const v = svc.view().connectors[0];
  assert.equal(v.name, '飞书 · 应用');
  assert.match(v.sourceTitle, /2 个群（1 个群读取失败）/);
  assert.ok(!JSON.stringify(svc.view()).includes('sec"'));
  log.items = [{message_id: 'om_4', msg_type: 'text', create_time: String(NOW - 1000), body: {content: '{"text":"新消息"}'}}];
  assert.equal((await svc.sync(id)).added, 1);
  assert.equal(Number(log.start), Math.floor((NOW - 36e5 - 60e3) / 1000));
});

test('feishu: invalid secret and missing App ID are reported clearly', async () => {
  const {fetcher} = server(feishuRoutes());
  const {svc} = svcWith(fetcher);
  assert.match((await svc.handle({action: 'add', kind: 'office', config: {platform: 'feishu', appId: 'cli_a1'}, secrets: {appSecret: 'wrong'}})).error, /飞书应用凭证无效：app secret invalid/);
  assert.match((await svc.handle({action: 'add', kind: 'office', config: {platform: 'feishu'}, secrets: {appSecret: 'x'}})).error, /App ID/);
  assert.match((await svc.handle({action: 'add', kind: 'office', config: {platform: 'dingtalk'}})).error, /至少填写/);
  assert.match((await svc.handle({action: 'add', kind: 'office', config: {platform: 'wecom'}, secrets: {webhook: DD_HOOK}})).error, /企业微信群机器人/);
  await assert.rejects(svc.handle({action: 'add', kind: 'office', config: {platform: 'slack'}}), /请选择平台/);
});

test('feishu robot send: confirmed first, signed body, error codes surfaced', async () => {
  let reply = {code: 0, msg: 'success'};
  const {calls, fetcher} = server([[/bot\/v2\/hook/, () => reply]]);
  let answer = false;
  const asks = [];
  const {store, svc} = svcWith(fetcher, async q => { asks.push(q); return answer; });
  const {id} = await svc.handle({action: 'add', kind: 'office', config: {platform: 'feishu'}, secrets: {webhook: FS_HOOK, signSecret: 'sig'}});
  assert.equal(svc.view().connectors[0].sourceTitle, '仅发送群消息');
  assert.equal(calls.length, 0);
  await assert.rejects(svc.handle({action: 'send', id, message: {text: '  '}}), /消息内容/);
  assert.deepEqual(await svc.handle({action: 'send', id, message: {text: '今天 3 点评审'}}), {sent: false, cancelled: true});
  assert.equal(asks[0].title, '发送到飞书群机器人？');
  assert.equal(calls.length, 0);
  answer = true;
  assert.deepEqual(await svc.handle({action: 'send', id, message: {text: '今天 3 点评审'}}), {sent: true});
  const t = Math.floor(NOW / 1000);
  assert.deepEqual(calls[0].body, {timestamp: String(t), sign: createHmac('sha256', `${t}\nsig`).update('').digest('base64'), msg_type: 'text', content: {text: '今天 3 点评审'}});
  assert.equal(calls[0].url, FS_HOOK);
  assert.deepEqual([store.data.activity[0].title, store.data.activity[0].detail], ['已发送群消息', '飞书：今天 3 点评审']);
  reply = {code: 19021, msg: 'sign match fail'};
  await assert.rejects(svc.handle({action: 'send', id, message: {text: 'x'}}), /加签校验失败/);
});

test('dingtalk: credentials verified, signed webhook URL, keyword rejection explained', async () => {
  let reply = {errcode: 0, errmsg: 'ok'};
  const {calls, fetcher} = server([[/oauth2\/accessToken$/, c => c.body.appSecret === 'ds' ? {accessToken: 'a', expireIn: 7200} : {code: 'invalidClientSecret', message: '无效的 appSecret'}], [/robot\/send/, () => reply]]);
  const {svc} = svcWith(fetcher);
  const {id, error} = await svc.handle({action: 'add', kind: 'office', config: {platform: 'dingtalk', appId: 'dingkey'}, secrets: {appSecret: 'ds', webhook: DD_HOOK, signSecret: 'SEC1'}});
  assert.equal(error, undefined);
  assert.match(svc.view().connectors[0].sourceTitle, /应用凭证有效.*可发送群消息/);
  assert.deepEqual(calls[0].body, {appKey: 'dingkey', appSecret: 'ds'});
  await svc.handle({action: 'send', id, message: {text: '提醒'}});
  const u = new URL(calls[1].url);
  assert.equal(u.searchParams.get('access_token'), 'abc123');
  assert.equal(u.searchParams.get('timestamp'), String(NOW));
  assert.equal(u.searchParams.get('sign'), createHmac('sha256', 'SEC1').update(`${NOW}\nSEC1`).digest('base64'));
  assert.deepEqual(calls[1].body, {msgtype: 'text', text: {content: '提醒'}});
  reply = {errcode: 310000, errmsg: 'keywords not in content'};
  await assert.rejects(svc.handle({action: 'send', id, message: {text: '提醒'}}), /关键词或加签/);
  assert.match((await svc.handle({action: 'update', id, secrets: {appSecret: 'bad'}})).error, /钉钉应用凭证无效/);
});

test('wecom: trusted-IP error explained; webhook-only connector sends; no webhook means no send', async () => {
  const {calls, fetcher} = server([[/cgi-bin\/gettoken/, () => ({errcode: 60020, errmsg: 'not allow to access from your ip'})], [/webhook\/send/, () => ({errcode: 0, errmsg: 'ok'})]]);
  const {svc} = svcWith(fetcher);
  assert.match((await svc.handle({action: 'add', kind: 'office', config: {platform: 'wecom', appId: 'ww1'}, secrets: {appSecret: 's'}})).error, /企业可信 IP/);
  const a = svc.view().connectors[0].id;
  await assert.rejects(svc.handle({action: 'send', id: a, message: {text: 'x'}}), /没有配置群机器人 Webhook/);
  const {id} = await svc.handle({action: 'add', kind: 'office', config: {platform: 'wecom'}, secrets: {webhook: WX_HOOK}});
  assert.deepEqual(await svc.handle({action: 'send', id, message: {text: '构建完成'}}), {sent: true});
  assert.equal(calls.at(-1).url, WX_HOOK);
  assert.deepEqual(calls.at(-1).body, {msgtype: 'text', text: {content: '构建完成'}});
});

test('office UI: platform select, optional secrets, 发消息 only with saved secrets, payload', () => {
  assert.equal(kindInfo('office').available, true);
  assert.equal(CONNECTOR_KINDS.every(k => k.available), true);
  const form = connectorForm({}, null, 'office');
  assert.match(form, /<select name="cfg_platform">[\s\S]*钉钉[\s\S]*企业微信/);
  assert.match(form, /name="sec_webhook"/);
  assert.ok(!/name="sec_\w+"[^>]*required/.test(form));
  const ui = {action: (l, a, id = '') => `<button data-action="${a}" data-id="${id}">${l}</button>`, date: () => 'd', heading: (k, t) => `<h1>${t}</h1>`, empty: t => t};
  const html = connectorsPage({connectors: [{id: 'a', kind: 'office', name: 'x', status: 'ok', interval: 15, hasSecret: true}, {id: 'b', kind: 'office', name: 'y', status: 'error', interval: 15, hasSecret: false}], connectorItems: []}, ui);
  assert.equal((html.match(/connectorMessage/g) || []).length, 1);
  assert.match(officeMessageForm({name: '<b>群</b>', config: {platform: 'dingtalk'}}), /钉钉[\s\S]*&lt;b&gt;群/);
  const f = new FormData();
  f.set('text', '你好');
  assert.deepEqual(officeMessagePayload(f, 'a'), {action: 'send', id: 'a', message: {text: '你好'}});
});
