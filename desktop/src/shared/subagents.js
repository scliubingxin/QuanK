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

export function boundCodingAgents(data, agent) {
  const {coding} = getSubagents(data, agent);
  return (data.coding?.agents || []).filter(item => coding.includes(item.id));
}

export function hasBoundCoding(data, agent) {
  return getSubagents(data, agent).coding.includes(builtinCodingAgent.id) || boundCodingAgents(data, agent).length > 0;
}
