import { classifyCoding } from './coding-intent.js';
import { minuteKlineCommand } from './market.js';

// Keep the navigation subset separate from broad app-tool keywords such as 财务 and 研报.
export const APP_PAGE_INTENT = /(查看|打开|看看|看下|进入|跳到|切到|去)(一下)?(我的)?.{0,4}(自选|股票池|量化|行情|投研资料|资料库|动态|消息|委托|自动化|知识图谱|图谱|记忆|智能体|连接|组合|风控|安全)|打开.{0,6}(页面|动态|创作|自动化|知识图谱|记忆|连接)/;

export function composerSendMode(prompt, {plan, research}) {
  if ((!plan && !research) || classifyCoding(prompt) === 'code') return 'chat';
  if (companyGraphQuery(prompt) || minuteKlineCommand(prompt)) return 'page';
  const text = prompt.replace(/\s+/g, '');
  const pageCommand = /^(打开|查看|显示|看看|看下|进入|跳到|切到)(?:一下)?(?:我的)?(?:页面|工作台|自选|股票池|量化|行情|营收|财务|投研资料|资料库|成果中心|本地文件|动态|消息|委托|自动化|知识图谱|图谱|记忆|智能体|连接|组合|风控|安全|创作)/;
  const researchWords = /研究|分析|报告|对比|比较|原因|为什么|怎么看|趋势|走势|预测|评估|梳理|总结|回顾|写/;
  if ([...text].length <= 20 && pageCommand.test(text) && !researchWords.test(text)) return 'page';
  return research ? 'research' : 'plan';
}

export function companyGraphQuery(prompt) {
  const match = /^(?:请\s*)?(?:打开|查看|显示|看看|看下)\s*(?:一下\s*)?([^\s，。！？,!?]{1,40}?)\s*(?:的\s*)?公司关系图[。！？.!?]?$/u.exec(prompt.trim());
  return match?.[1] || '';
}

export function codingPageCommand(prompt) {
  const text = prompt.trim().replace(/\s/g, '').replace(/[。！？.!?]$/, '');
  if (/^(?:请(?:帮我)?)?(?:打开|查看|进入)Coding智能体$/i.test(text)) return 'open';
  if (/^(?:请(?:帮我)?)?接入WorkBuddy$/i.test(text)) return 'workbuddy';
  return '';
}
