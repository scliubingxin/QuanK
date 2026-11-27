import json, base64, hashlib, io, os, time
from docx import Document
from docx.shared import Pt
import openpyxl
from pptx import Presentation
from pptx.util import Inches, Pt as PPt

BASE = json.load(open('/private/tmp/h11d-seed.json'))['state']
NOW = int(time.time() * 1000)
H = 3600 * 1000
D = 24 * H

st = json.loads(json.dumps(BASE))          # deep copy
st['appVersion'] = '1.0.6'
q = st.setdefault('quant', {})

# ---------- 1. stock pool: 6, new ones carry NO price (app fetches) ----------
keep = {p['code']: p for p in q.get('pool', [])}
pool = []
for code, name in [('600438','通威股份'),('300750','宁德时代'),('600519','贵州茅台'),
                   ('601012','隆基绿能'),('002594','比亚迪'),('000858','五粮液')]:
    if code in keep:
        p = keep[code]; p.pop('last', None)      # let the engine recompute from live data
        p.pop('spark', None)
        pool.append(p)
    else:
        pool.append({'code': code, 'name': name})
q['pool'] = pool
q['lastWatch'] = NOW
q['watchError'] = ''

# ---------- 2. holdings (spec costs) + cash ----------
sizes = {'600438': (5000, 12.20), '300750': (200, 238.50), '600519': (100, 1460.0)}
for code, (sh, cost) in sizes.items():
    h = q.setdefault('holdings', {}).setdefault(code, {'code': code, 'trades': 0, 'log': []})
    h['shares'] = sh; h['cost'] = cost
    h.pop('price', None); h.pop('value', None); h.pop('pnl', None); h.pop('pnlPct', None)
pf = st.setdefault('portfolio', {})
pf['manual'] = [{'code': c, 'name': n, 'shares': sizes[c][0], 'cost': sizes[c][1],
                 'stopPrice': None, 'note': '', 'at': NOW - D} for c, n in
                [('600438','通威股份'),('300750','宁德时代'),('600519','贵州茅台')]]
pf['cash'] = 52000
pf['rules'] = {'enabled': True, 'notify': True, 'notices': True, 'interval': 15, 'stopLoss': 8,
               'takeProfit': None, 'trailing': None, 'maxPosition': 30, 'maxIndustry': 50,
               'maxDrawdown': 10, 'stops': {}}
pf['rulesText'] = '亏损 8% 止损 · 单股 ≤ 30% · 单行业 ≤ 50% · 组合回撤 10% · 风险公告 · 交易时段每 15 分钟检查 · 系统通知'
pf['alerts'] = []; pf['lastCheck'] = NOW - 20 * 60 * 1000; pf['lastError'] = ''

# ---------- 3. DCA plan (global, app model has a single plan) ----------
q['plan'] = {'label': '600438 每周1次 1,000 元（智能）· 300750 每月2次 2,000 元', 'type': 'week', 'times': 1}

# ---------- 4. signals / price alerts ----------
q['alerts'] = [
 {'id':'qa1','kind':'change','time':NOW-40*60*1000,'code':'300750','name':'宁德时代','from':'BUY','to':'STRONG_BUY',
  'toText':'强烈买入','score':74.2,'multiplier':2,'reason':'放量突破 MA20，资金连续净流入'},
 {'id':'qa2','kind':'change','time':NOW-3*H,'code':'601012','name':'隆基绿能','from':'HOLD','to':'SELL',
  'toText':'卖出','score':28.6,'multiplier':0,'reason':'跌破 MA20 且放量'},
 {'id':'qa3','kind':'digest','time':NOW-5*H,'counts':{'total':6,'buy':3,'sell':1,'failed':0},
  'items':[{'code':'600438','name':'通威股份','action':'BUY','actionText':'买入'},
           {'code':'300750','name':'宁德时代','action':'STRONG_BUY','actionText':'强烈买入'},
           {'code':'600519','name':'贵州茅台','action':'HOLD','actionText':'持有'}]}]
mk = st.setdefault('market', {})
mk['alerts'] = [
 {'id':'al1','code':'600438','name':'通威股份','kind':'down','value':10.80,'text':'通威股份 跌破 10.80'},
 {'id':'al2','code':'300750','name':'宁德时代','kind':'up','value':5,'text':'宁德时代 涨超 5%'}]
mk['settings'] = {'moves': True, 'movePct': 5, 'limits': True}

# ---------- 5. memories (4 required, keep the 5 demo ones, fix the DCA weekday) ----------
st['memories'] = [
 {'id':'m1','text':'风险偏好：稳健型，单只股票仓位不超过 30%，止损线 -8%','source':'auto','time':NOW-3*D},
 {'id':'m2','text':'定投习惯：每周一定投，基准金额 5000 元，低位最多 2 倍','source':'auto','time':NOW-2*D},
 {'id':'m3','text':'关注板块：光伏、储能、新能源车；白酒只做底仓','source':'user','time':NOW-4*D},
 {'id':'m4','text':'研报偏好：Word 格式，附 K 线与回测图，结论放在第一页','source':'auto','time':NOW-5*D},
 {'id':'m5','text':'交易习惯：买卖点先在模拟盘验证，再到券商页面亲自提交','source':'auto','time':NOW-6*D}]

# ---------- 6. knowledge graph: >=12 nodes / >=15 edges ----------
g = st.setdefault('graph', {})
ents = {e['name']: e for e in g.get('entities', [])}
def ent(i, name, typ, summ, mentions):
    ents.setdefault(name, {'id': i, 'name': name, 'type': typ, 'summary': summ,
                           'mentions': mentions, 'updated': NOW - 2 * H, 'aliases': []})
for a in [('g1','通威股份','org','多晶硅与电池片龙头',18),('g2','隆基绿能','org','单晶硅片龙头',12),
          ('g5','宁德时代','org','动力与储能电池龙头',16),('g3','多晶硅价格','product','光伏产业链核心价格',15),
          ('g4','光伏产能出清','event','研究主题：减产、并购、价格',14),('g6','储能','product','大储订单、海外需求',11),
          ('g7','新能源车','product','动力电池需求端',10),('g11','我的组合','project','6 只自选，3 只持仓',13)]:
    ent(*a)
ent('g12','比亚迪','org','新能源车与刀片电池',9)
ent('g13','碳酸锂价格','product','电池成本核心变量',8)
ent('g14','刘汉元','person','通威股份董事长',6)
ent('g15','曾毓群','person','宁德时代董事长',6)
ent('g16','硅料减产','event','供给收缩，价格弹性来源',7)
g['entities'] = list(ents.values())
rels = g.get('relations', [])[:]
def rel(f, t, typ):
    fid = ents[f]['id']; tid = ents[t]['id']
    if any(r['from'] == fid and r['to'] == tid for r in rels):
        return
    rels.append({'id': 'r%02d' % len(rels), 'from': fid, 'to': tid, 'type': typ,
                 'label': typ, 'mentions': 3, 'updated': NOW - 2 * H})
for f, t, ty in [('刘汉元','通威股份','担任董事长'),('曾毓群','宁德时代','担任董事长'),
                 ('比亚迪','新能源车','属于行业'),('宁德时代','新能源车','属于行业'),
                 ('碳酸锂价格','宁德时代','受影响于'),('碳酸锂价格','比亚迪','受影响于'),
                 ('通威股份','硅料减产','参与事件'),('隆基绿能','硅料减产','参与事件'),
                 ('储能','宁德时代','受益于'),('我的组合','通威股份','持有'),
                 ('我的组合','宁德时代','持有'),('我的组合','比亚迪','关注')]:
    rel(f, t, ty)
g['relations'] = rels
g['settings'] = {'enabled': True, 'autoExtract': True, 'chats': True, 'documents': True, 'connectors': True}

# ---------- 7. chats (>=5 sidebar titles) ----------
def msg(role, content, minutes, actions=None):
    m = {'role': role, 'content': content, 'time': NOW - minutes * 60 * 1000}
    if actions: m['actions'] = actions
    return m
st['chats'] = [
 {'id':'demo-chat-1','name':'把比亚迪加入自选','time':NOW-28*H,'messages':[
   msg('user','把比亚迪加入自选',28*60),
   msg('assistant','已识别「比亚迪（002594）」，加入股票池并开始计算信号。完成后自动跳到股票池并圈出变化。',28*60-1,[{'page':'quant','label':'查看结果'}])]},
 {'id':'demo-chat-2','name':'记一笔：买入通威 2000 股','time':NOW-26*H,'messages':[
   msg('user','记一笔：买入通威 2000 股，价格 11.2',26*60),
   msg('assistant','已记入持仓：通威股份（600438）3,000 → **5,000 股**，成本由 12.86 摊薄到 12.20 元，已写入持仓明细。',26*60-1,[{'page':'quant','label':'查看持仓'}])]},
 {'id':'chat-3','name':'通威股份三季报点评','time':NOW-6*H,'messages':[
   msg('user','用我库里的公告和三季报，写一篇通威股份三季报点评，结论放第一页。',6*60),
   msg('assistant','已按你的研报偏好（Word + 图表、结论前置）生成《通威股份三季报点评》：\n\n1. 结论：多晶硅价格同比走低，公司在产线检修后维持满产，单季盈利环比改善；\n2. 现金流：经营性现金流回正，资本开支同比收缩；\n3. 风险：硅料价格二次探底、行业库存去化慢于预期。\n\n正文 6 页，含 2 张图表（营收结构、单季毛利率）。',6*60-3,[{'page':'library','label':'打开文档'}])]},
 {'id':'chat-4','name':'按我的风险偏好宁德时代该买多少','time':NOW-2*D,'messages':[
   msg('user','按我的风险偏好，宁德时代该买多少？',2*24*60),
   msg('assistant','已引用你的记忆「风险偏好：稳健型，单股仓位不超过 30%，止损线 -8%」测算：演示组合可用资金 60,000 元，单股上限 = 60,000 × 30% = 18,000 元。按 100 股一手，最多可买 70 股，占组合 26.6%，低于 30% 上限；止损参考按成本 -8% 执行。仅为演示测算，不构成投资建议。',2*24*60-2)]},
 {'id':'chat-5','name':'组合周复盘','time':NOW-4*D,'messages':[
   msg('user','把这周的组合表现复盘一下，写进成果中心。',4*24*60),
   msg('assistant','本周复盘要点：\n\n1. 组合相对沪深300 由跑赢转为基本持平，主要拖累来自光伏；\n2. 个股仓位：贵州茅台 49.1% 已超单股 30% 上限，建议分批降仓；\n3. 行业分布：食品饮料 49.1%、电气设备 33.5%，均在单行业 50% 上限内；\n4. 下周动作：光伏等硅料价格企稳信号，白酒按计划减仓。',4*24*60-4,[{'page':'library','label':'查看复盘文档'}])]},
 {'id':'chat-6','name':'每日行业研报','time':NOW-9*H,'messages':[
   msg('user','整理今天的行业研报要点，重点关注光伏和储能。',9*60),
   msg('assistant','今日行业要点（演示）：\n\n· 光伏：硅料环节减产推进，组件排产环比小幅回升；\n· 储能：海外大储订单继续落地，电芯价格趋稳；\n· 新能源车：11 月交付环比改善，电池排产上调。\n\n已归档到投研资料，可在「资料库 → 投研资料」按股票查看。',9*60-2)]}]

# ---------- 8. activity / feed >= 6 ----------
st['activity'] = [
 {'id':'a1','title':'委托单','detail':'买入 宁德时代（300750）100 股，待你确认','time':NOW-25*60*1000,'code':'300750'},
 {'id':'a2','title':'信号','detail':'宁德时代（300750）：买入 → 强烈买入，综合分 74.2','time':NOW-40*60*1000,'code':'300750'},
 {'id':'a3','title':'信号','detail':'隆基绿能（601012）：持有 → 卖出，综合分 28.6','time':NOW-3*H,'code':'601012'},
 {'id':'a4','title':'行情提醒','detail':'通威股份（600438）跌破 10.80','time':NOW-2*H,'code':'600438'},
 {'id':'a5','title':'定时任务','detail':'盘前晨报已完成：6 只自选 3 个买点，2 条风险公告','time':NOW-5*H,'code':''},
 {'id':'a6','title':'研报完成','detail':'通威股份三季报点评已生成，已保存到成果中心','time':NOW-6*H,'code':'600438'},
 {'id':'a7','title':'风控提醒','detail':'贵州茅台（600519）仓位 49.1%，超过单股 30% 上限','time':NOW-7*H,'code':'600519'}]

# ---------- 9. scheduled tasks >=4 with run records ----------
def run(i, hours_ago, status, note=''):
    return {'id': 'run' + str(i), 'at': NOW - hours_ago * H, 'trigger': 'schedule', 'status': status, 'error': '' if status == 'done' else note}
st['tasks'] = [
 {'id':'tk1','name':'盘前晨报','prompt':'汇总隔夜外盘、自选股公告与今天的买卖点，写成盘前晨报。','agentId':'fin-research','toolsEnabled':True,
  'schedule':{'kind':'weekdays','time':'09:15'},'enabled':True,'status':'done','lastRun':NOW-5*H,'nextRun':NOW+18*H,'runId':'run1','error':'',
  'runs':[run(1,5,'done'),run(2,29,'done'),run(3,53,'failed','模型请求超时'),run(4,77,'done')]},
 {'id':'tk2','name':'通威每日公告整理','prompt':'抓取通威股份（600438）今日公告，重要的归档到投研资料并给出影响判断。','agentId':'fin-research','toolsEnabled':True,
  'schedule':{'kind':'daily','time':'19:00'},'enabled':True,'status':'done','lastRun':NOW-2*H,'nextRun':NOW+22*H,'runId':'run5','error':'',
  'runs':[run(5,2,'done'),run(6,26,'done'),run(7,50,'done')]},
 {'id':'tk3','name':'组合周复盘','prompt':'复盘本周组合收益、仓位与风控规则触发情况，输出 Word 复盘。','agentId':'fin-risk','toolsEnabled':True,
  'schedule':{'kind':'weekly','time':'16:00','days':[5]},'enabled':True,'status':'done','lastRun':NOW-4*D,'nextRun':NOW+3*D,'runId':'run8','error':'',
  'runs':[run(8,4*24,'done'),run(9,11*24,'failed','导出文档失败'),run(10,18*24,'done')]},
 {'id':'tk4','name':'光伏主题周报','prompt':'整理光伏产能出清主题的最新动态，生成周报并更新研究主题。','agentId':'fin-quant','toolsEnabled':True,
  'schedule':{'kind':'weekly','time':'20:00','days':[0]},'enabled':True,'status':'done','lastRun':NOW-6*D,'nextRun':NOW+1*D,'runId':'run11','error':'',
  'runs':[run(11,6*24,'done'),run(12,13*24,'done')]}]
st['executions'] = []

# ---------- 10. documents: real docx/xlsx/pptx/md/html ----------
def docx_bytes(title, paras):
    d = Document(); d.add_heading(title, 0)
    for i, (h, body) in enumerate(paras, 1):
        d.add_heading(h, level=1)
        for p in body:
            d.add_paragraph(p)
    b = io.BytesIO(); d.save(b); return b.getvalue()
def xlsx_bytes(rows):
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = '持仓明细'
    for r in rows: ws.append(r)
    b = io.BytesIO(); wb.save(b); return b.getvalue()
def pptx_bytes(slides):
    p = Presentation()
    for title, bullets in slides:
        s = p.slides.add_slide(p.slide_layouts[1])
        s.shapes.title.text = title
        tf = s.placeholders[1].text_frame; tf.text = bullets[0]
        for bl in bullets[1:]:
            para = tf.add_paragraph(); para.text = bl; para.level = 1
    b = io.BytesIO(); p.save(b); return b.getvalue()

docs = []
def add_doc(i, name, fmt, blob, text):
    docs.append({'id': 'doc' + str(i), 'name': name, 'format': fmt, 'time': str(NOW - i * H),
                 'size': len(blob), 'revision': 1, 'sha256': hashlib.sha256(blob).hexdigest(),
                 'base64': base64.b64encode(blob).decode(), 'text': text})

add_doc(1, '通威股份研究报告', 'docx', docx_bytes('通威股份研究报告', [
 ('结论', ['多晶硅价格处于周期底部区间，公司成本曲线位于行业左侧，维持「买入」评级。',
          '关注硅料减产落地进度与电池片出口结构变化。']),
 ('业务拆分', ['多晶硅：满产运行，单位现金成本行业领先。', '电池片：TOPCon 占比提升，单瓦盈利环比改善。']),
 ('盈利预测', ['假设硅料价格企稳，2027 年归母净利同比恢复增长。']) ]),
 '通威股份研究报告\n结论：多晶硅价格处于周期底部区间，维持「买入」。\n业务拆分：多晶硅、电池片。\n盈利预测：2027 年恢复增长。')
add_doc(2, '组合周复盘', 'docx', docx_bytes('组合周复盘', [
 ('本周表现', ['组合相对沪深300 基本持平，主要拖累来自光伏。']),
 ('仓位与风控', ['贵州茅台 49.1%，超过单股 30% 上限，建议分批降仓。',
              '行业分布：食品饮料 49.1%、电气设备 33.5%，未超单行业 50% 上限。']),
 ('下周动作', ['等待硅料价格企稳信号；白酒按计划减仓。']) ]),
 '组合周复盘\n本周表现：与沪深300 基本持平。\n仓位与风控：茅台超单股上限。\n下周动作：等硅料企稳。')
add_doc(3, '通威股份三季报点评', 'docx', docx_bytes('通威股份三季报点评', [
 ('结论', ['单季收入环比改善，经营性现金流转正，维持「买入」。']),
 ('三张表要点', ['利润表：毛利率环比回升。', '现金流量表：经营现金流转正。', '资产负债表：有息负债下降。']),
 ('风险提示', ['硅料价格二次探底；行业库存去化慢于预期。']) ]),
 '通威股份三季报点评\n结论：单季收入环比改善。\n三张表要点。\n风险提示：硅料价格二次探底。')
add_doc(4, '持仓明细', 'xlsx', xlsx_bytes([
 ['股票', '代码', '行业', '持股', '成本', '仓位', '风控上限'],
 ['贵州茅台', '600519', '食品饮料', 100, 1460.0, '49.1%', '30%'],
 ['通威股份', '600438', '电气设备', 5000, 12.2, '19.1%', '30%'],
 ['宁德时代', '300750', '电气设备', 200, 238.5, '14.4%', '30%'],
 ['现金', '', '', '', 52000, '17.4%', '']]),
 '持仓明细 3 只股票 + 现金。')
add_doc(5, '光伏行业周报', 'pptx', pptx_bytes([
 ('光伏行业周报 · 供给出清进行中', ['硅料：减产推进，价格低位企稳', '组件：排产环比回升', '结论：龙头成本优势扩大']),
 ('储能与新能源车', ['大储订单继续落地', '电芯价格趋稳', '电池排产上调'])]),
 '光伏行业周报：硅料减产、组件排产回升、储能订单落地。')
add_doc(6, '宁德时代研究报告（网页版）', 'html',
 '<html><head><meta charset="utf-8"><title>宁德时代研究报告</title></head><body>'
 '<h1>宁德时代研究报告</h1><h2>结论</h2><p>动力与储能双轮驱动，海外大储订单能见度高，维持「强烈买入」。</p>'
 '<h2>业务拆分</h2><ul><li>动力电池：海外客户结构改善</li><li>储能：大储订单交付加速</li></ul>'
 '<h2>风险</h2><p>碳酸锂价格波动、海外贸易政策变化。</p></body></html>'.encode('utf-8'),
 '宁德时代研究报告：强烈买入，动力+储能双轮驱动。')
add_doc(7, '投资备忘录', 'md',
 ('# 投资备忘录\n\n## 结论\n- 光伏：等硅料价格企稳信号再加大仓位\n- 白酒：只做底仓，茅台分批降至 30% 以内\n\n'
  '## 依据\n- 组合行业分布：食品饮料 49.1%、电气设备 33.5%\n- 风控规则：单股 ≤ 30%、单行业 ≤ 50%、止损 -8%\n').encode('utf-8'),
 '投资备忘录：光伏等信号，白酒降仓。')
st['documents'] = docs

# ---------- 11. research library >= 8 (研报 3 / 公告 3 / 笔记 2 + 导出 + 量化日报) ----------
lib = []
def item(i, hours, kind, code, name, title, summary, tags, fmt=None, docid=None):
    e = {'id': 'rs' + str(i), 'time': NOW - hours * H, 'kind': kind, 'code': code, 'name': name,
         'title': title, 'summary': summary, 'tags': tags}
    if fmt: e['format'] = fmt
    if docid: e['documentId'] = docid
    lib.append(e)
item(1, 6, 'report', '600438', '通威股份', '通威股份研究报告 · 2026-11-22', '信号 买入 · 结论：硅料底部区间，成本优势领先', ['研报'], 'docx', 'doc1')
item(2, 12, 'report', '300750', '宁德时代', '宁德时代研究报告 · 2026-11-21', '结论：动力+储能双轮驱动，海外大储能见度高', ['研报'], 'html', 'doc6')
item(3, 30, 'report', '601012', '隆基绿能', '隆基绿能研究报告 · 2026-11-20', '结论：硅片价格承压，等待库存去化', ['研报'])
item(4, 10, 'notice', '600438', '通威股份', '关于回购公司股份进展的公告', '累计回购 1.2 亿元，回购价格区间见公告', ['回购'])
item(5, 20, 'notice', '600438', '通威股份', '关于控股股东股份质押的公告', '控股股东质押比例变动，已在动态中提醒', ['质押'])
item(6, 26, 'notice', '300750', '宁德时代', '关于签订储能系统采购合同的公告', '合同金额约 48 亿元，预计 2027 年交付', ['订单'])
item(7, 32, 'notice', '601012', '隆基绿能', '关于部分产线检修的公告', '产线检修影响短期排产，已在风控提醒中记录', ['检修'])
item(8, 8, 'note', '600438', '通威股份', '三季报电话会要点', '多晶硅开工率下调，四季度现金成本有望继续下降', ['笔记'])
item(9, 34, 'note', '300750', '宁德时代', '储能业务跟踪笔记', '海外大储订单能见度提升，关注交付节奏', ['笔记'])
item(10, 40, 'export', '', '', '组合周复盘 · 本周 Word', '组合本周与沪深300 基本持平，茅台仓位超上限', ['导出'], 'docx', 'doc2')
item(11, 14, 'quant', '', '', '算法日报 · 2026-11-20', '当日 6 只股票 AI 研判，模型下调光伏板块权重', ['量化日报'], None)
st['research'] = st.get('research', {})
st['research']['library'] = lib
st['research']['watch'] = {'enabled': True, 'interval': 30, 'lastScan': NOW - 30 * 60 * 1000}
st['research']['notices'] = []
st['knowledge'] = {'topics': [
 {'id':'t1','name':'光伏产能出清','keywords':['产能','减产','硅料价格'],'lastDigest':NOW-2*D},
 {'id':'t2','name':'储能出海','keywords':['大储','海外订单','电芯'],'lastDigest':NOW-5*D}]}

# ---------- 12. connectors: 2 data sources + 1 MCP ----------
st['connectors'] = [
 {'id':'cn1','name':'东方财富行情','kind':'feed','status':'ok','lastSync':NOW-10*60*1000,'count':36,'interval':15,'sourceTitle':'东方财富 · 免费行情'},
 {'id':'cn2','name':'腾讯行情','kind':'feed','status':'ok','lastSync':NOW-12*60*1000,'count':24,'interval':15,'sourceTitle':'腾讯行情 · 免费'},
 {'id':'cn3','name':'上交所公告 RSS','kind':'feed','status':'ok','lastSync':NOW-20*60*1000,'count':42,'interval':30,'sourceTitle':'sse.com.cn'},
 {'id':'cn4','name':'研究邮箱','kind':'mail','status':'ok','lastSync':NOW-30*60*1000,'count':126,'interval':30,'sourceTitle':'IMAP · 只读'}]
st['connectorItems'] = [
 {'id':'ci1','connectorId':'cn1','title':'通威股份 600438 分时与日线行情','fetchedAt':NOW-10*60*1000},
 {'id':'ci2','connectorId':'cn2','title':'宁德时代 300750 实时报价','fetchedAt':NOW-12*60*1000},
 {'id':'ci3','connectorId':'cn3','title':'通威股份：关于回购公司股份进展的公告','fetchedAt':NOW-20*60*1000},
 {'id':'ci4','connectorId':'cn4','title':'【券商晨报】光伏产业链价格周报','fetchedAt':NOW-30*60*1000}]
st['mcpConnections'] = [{'id':'mcp1','name':'本地文件 MCP','transport':'stdio','command':'npx',
                         'args':['-y','@modelcontextprotocol/server-filesystem','/Users/demo/strategy'],
                         'enabled':True,'status':'ok','tools':6,'lastCheck':NOW-60*60*1000}]

# ---------- 13. security (audit + egress come from real app actions) ----------
st['security'] = {'privacy': {'offline': False, 'maskAmounts': True, 'egressLog': True},
                  'lock': {'enabled': False, 'idleMinutes': 15, 'onLaunch': False},
                  'compliance': {'enabled': True, 'block': False, 'keywords': ['内幕信息', '保本']},
                  'reviews': [], 'lastVerify': None}
st['settings'] = dict(st.get('settings', {}))
st['settings'].update({'name': 'QK 演示工作空间', 'model': 'deepseek-chat'})
st['desktop'] = {'platform': 'darwin', 'shortcutReady': True}
st['imageAttachments'] = []
st['capabilityPresets'] = []

out = '/private/tmp/shots106-seed.json'
json.dump({'schema': 1, 'state': st}, open(out, 'w'), ensure_ascii=False)
print('WROTE', out, os.path.getsize(out) // 1024, 'KB')
counts = {
 'pool': len(q['pool']), 'holdings': len(sizes), 'cash': pf['cash'],
 'risk_rules': len([k for k in ('maxPosition','maxIndustry','stopLoss','maxDrawdown') if pf['rules'].get(k)]),
 'memories': len(st['memories']), 'graph_nodes': len(g['entities']), 'graph_edges': len(g['relations']),
 'chats': len(st['chats']), 'activity': len(st['activity']), 'tasks': len(st['tasks']),
 'task_runs': sum(len(t['runs']) for t in st['tasks']), 'documents': len(st['documents']),
 'research': len(lib), 'connectors': len(st['connectors']), 'mcp': len(st['mcpConnections']),
 'market_alerts': len(mk['alerts']), 'quant_alerts': len(q['alerts']),
}
print(json.dumps(counts, ensure_ascii=False, indent=1))
