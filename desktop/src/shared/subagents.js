export const builtinCodingAgent = {id:'builtin', name:'QuankSight 内置编码'};
export const codingFallbacks = ['auto', 'external', 'builtin'];

export function getSubagents(data, agent) {
  if (!agent) return {dialogue: [], coding: [], fallback: 'auto'};
  if (agent.subagents) return agent.subagents;
  const settings = data.coding?.settings;
  const agents = data.coding?.agents || [];
  const preferred = agents.find(item => item.isDefault) || agents[0];
  return {
    dialogue: [],
    coding: agent.id === 'assistant' && settings?.allowAssistant === true ? [preferred?.id || builtinCodingAgent.id] : [],
    fallback: agent.id === 'assistant' && codingFallbacks.includes(settings?.fallback) ? settings.fallback : 'auto',
  };
}

export function migrateSubagents(data) {
  const assistant = data.agents?.find(agent => agent.id === 'assistant');
  if (assistant && !assistant.subagents) assistant.subagents = getSubagents(data, assistant);
}

// [v1.0.3] 默认助手名从「QuanK 助手」改为「QuankSight 助手」。只迁移仍保存为旧默认名的档案；
// 用户改过名字的不动（必须完全相等才迁移）。
export const LEGACY_ASSISTANT_NAME = 'QuanK 助手';
export const DEFAULT_ASSISTANT_NAME = 'QuankSight 助手';
export function migrateAssistantName(data) {
  const assistant = data?.agents?.find(agent => agent.id === 'assistant');
  if (!assistant) return false;
  if (assistant.name !== LEGACY_ASSISTANT_NAME) return false;
  assistant.name = DEFAULT_ASSISTANT_NAME;
  return true;
}

export function boundCodingAgents(data, agent) {
  const {coding} = getSubagents(data, agent);
  return (data.coding?.agents || []).filter(item => coding.includes(item.id));
}

export function hasBoundCoding(data, agent) {
  return getSubagents(data, agent).coding.includes(builtinCodingAgent.id) || boundCodingAgents(data, agent).length > 0;
}
