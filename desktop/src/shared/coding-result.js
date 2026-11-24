const number = value => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const percent = value => number(value) + '%';
const drawdown = value => value === 0 ? percent(value) : '−' + percent(Math.abs(value));
export const noBacktest = '报告中没有回测对比';

export function backtestRows({ before = {}, after = {} } = {}) {
  const rows = [];
  function add(label, oldValue, newValue, format) {
    if (!Number.isFinite(oldValue) && !Number.isFinite(newValue)) return;
    rows.push([label, ...[oldValue, newValue].map(value => Number.isFinite(value) ? format(value) : '—')]);
  }
  add('收益', before?.returnPct, after?.returnPct, percent);
  add('最大回撤', before?.maxDrawdownPct, after?.maxDrawdownPct, drawdown);
  add('胜率', before?.winRatePct, after?.winRatePct, percent);
  add('交易次数', before?.trades, after?.trades, value => value.toLocaleString('zh-CN'));
  const beforeHits = before?.hitRates ?? {}, afterHits = after?.hitRates ?? {};
  for (const key of new Set([...Object.keys(beforeHits), ...Object.keys(afterHits)])) {
    add(key + ' 命中率', beforeHits[key], afterHits[key], percent);
  }
  return rows;
}

export function backtestLines(backtest) {
  const rows = backtestRows(backtest ?? {});
  return rows.length ? ['回测对比', ...rows.map(([label, before, after]) => `${label} ${before} → ${after}`)] : [noBacktest];
}

export function codingResultStatus(task) {
  return task.status === 'review' && task.result?.diffStat?.files === 0 ? 'no_changes' : task.status;
}
