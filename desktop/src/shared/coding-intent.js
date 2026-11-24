import { APP_PAGE_INTENT } from './page-command.js';

const LOGIC_CHANGE = /止损.{0,12}(?:改成|换成|改为|改用|换用).{0,12}(?:ATR|动态|跟踪)/i;

export const CODING_INTENT = /(?:编写|写|实现|开发|迭代|优化|重构|修复|调试|修改|改写|改动|调整|修|改).{0,28}(?:代码|源码|脚本|函数|算法|指标|因子|计算逻辑|策略逻辑|信号逻辑|bug)|(?:代码|源码|脚本|函数|算法|指标|因子|计算逻辑|策略逻辑).{0,16}(?:重构|修复|改成|改一下)|(?:命中率|准确率).{0,20}(?:改一下|优化|修复|太低.{0,5}改)|(?:新增|增加|加上|引入|换用|加入|添加|加).{0,20}(?:因子|指标|计算逻辑|策略逻辑|信号逻辑|信号算法)|训练数据.{0,16}(?:加|删|移除|增加|新增|添加).{0,10}(?:列|字段|换手率)|\b(?:write|implement|develop|refactor|fix|debug|optimi[sz]e|rewrite|modify|update|add)\b.{0,48}\b(?:algorithm|indicator|factor|code|source|script|function|logic|bug|pipeline)\b/i;

const EXPLAIN = /(?:解释|讲解|什么意思|含义|原理|怎么实现的|做什么的|怎么工作的|如何工作的|读懂|看懂|解读).{0,24}(?:代码|函数|算法|指标|因子|策略|脚本|回测|ATR)|(?:代码|函数|算法|指标|因子|策略|脚本|回测|ATR).{0,24}(?:是什么意思|什么意思|是什么|为什么|原理|含义|怎么实现的|做什么的|怎么工作的|如何工作的|如何计算|有什么作用)|\b(?:explain|how does|what does|what is)\b.{0,45}\b(?:code|function|algorithm|indicator|factor|strategy|script|backtest|atr)\b/i;
const EXISTING = /^(?:(?:请|帮我|麻烦)\s*)*(?:(?:看|查|显示|刷新).{0,12}(?:信号|买卖点)|(?:跑|运行|执行|查看).{0,16}回测|(?:写|生成|导出|做)(?:(?!代码|源码|脚本|函数|算法|逻辑).){0,12}(?:研报|研究报告|周报|简报)|(?:改|更新|调整|设置|修改|优化)(?:\s|一下|我的|组合的|策略的)*(?:风控|定投|止损线|止盈线|仓位|提醒|回测参数)(?:规则|参数|设置|计划|策略|配置|上限)?(?!规则|参数|设置|计划|策略|配置|上限|\s*(?:的\s*)?(?:代码|源码|脚本|函数|算法|逻辑|计算逻辑|指标|因子))|(?:止损线|止盈线|仓位|回测参数).{0,8}(?:调到|改到|调为|设为|改为)\s*\d|(?:run|show|open|view|generate)\b.{0,30}\b(?:backtest|signals|report|page)\b|(?:change|update)\b.{0,20}\b(?:risk rules|investment plan|backtest parameters|position size)\b)/i;
const QUESTION = /^(?:请问|能否解释|请解释|解释|讲解|为什么|怎么理解|如何理解|如何(?:编写|实现|优化|修复)|explain\b|how (?:does|do i|to)\b|what (?:does|is)\b)/i;
const ACTION = /[，,；;。]\s*(?:请|再|然后|并|顺便|帮我|直接|给我|把|改|修|优化|实现|写)|(?:并|然后|顺便)(?:帮我)?(?:改|修|优化|实现|写|重构)/i;

export function classifyCoding(prompt) {
  const text = String(prompt ?? '').trim().replace(/\s+/g, ' ');
  if ((EXPLAIN.test(text) || (QUESTION.test(text) && CODING_INTENT.test(text))) && !ACTION.test(text)
      && !/命中率.{0,20}改一下/.test(text)) return 'explain';
  if (LOGIC_CHANGE.test(text)) return 'code';
  if (EXISTING.test(text)) return 'tool';
  if (CODING_INTENT.test(text)) return 'code';
  if (EXPLAIN.test(text)) return 'explain';
  if (APP_PAGE_INTENT.test(text) || /^(?:请)?(?:打开|查看|进入)(?:一下)?\s*(?:Coding\s*智能体|工作台|成果中心|本地文件|页面)/i.test(text)) return 'tool';
  return 'none';
}
