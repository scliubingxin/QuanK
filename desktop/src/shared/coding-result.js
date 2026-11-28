const number = value => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
// [v1.0.8] negative numbers use the same minus sign (U+2212) everywhere in the comparison
const signed = value => (value < 0 ? '−' : '') + number(Math.abs(value));
const percent = value => signed(value) + '%';
const drawdown = value => value === 0 ? percent(value) : '−' + percent(Math.abs(value));
export const noBacktest = '报告中没有回测对比';

function metrics({ before = {}, after = {} } = {}) {
  const list = [];
  function add(label, oldValue, newValue, format, kind) {
    if (!Number.isFinite(oldValue) && !Number.isFinite(newValue)) return;
    list.push({ label, oldValue, newValue, format, kind });
  }
  add('收益', before?.returnPct, after?.returnPct, percent, 'higher');
  add('最大回撤', before?.maxDrawdownPct, after?.maxDrawdownPct, drawdown, 'drawdown');
  add('胜率', before?.winRatePct, after?.winRatePct, percent, 'higher');
  add('交易次数', before?.trades, after?.trades, value => value.toLocaleString('zh-CN'), 'count');
  const beforeHits = before?.hitRates ?? {}, afterHits = after?.hitRates ?? {};
  for (const key of new Set([...Object.keys(beforeHits), ...Object.keys(afterHits)])) {
    add(key + ' 命中率', beforeHits[key], afterHits[key], percent, 'higher');
  }
  return list;
}

export function backtestRows(backtest = {}) {
  return metrics(backtest ?? {}).map(({ label, oldValue, newValue, format }) =>
    [label, ...[oldValue, newValue].map(value => Number.isFinite(value) ? format(value) : '—')]);
}

/** [v1.0.8] Rows with the change and whether it is an improvement (better / worse / same; '' when not comparable). */
export function backtestDeltas(backtest = {}) {
  return metrics(backtest ?? {}).map(({ label, oldValue, newValue, format, kind }) => {
    const shown = [oldValue, newValue].map(value => Number.isFinite(value) ? format(value) : '—');
    if (!Number.isFinite(oldValue) || !Number.isFinite(newValue)) return { label, before: shown[0], after: shown[1], delta: '—', tone: '' };
    // drawdown is stored as a magnitude and shown negative, so a smaller drawdown is a positive change
    const change = kind === 'drawdown' ? Math.abs(oldValue) - Math.abs(newValue) : newValue - oldValue;
    const rounded = Math.round(change * 100) / 100;
    const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
    const delta = sign + number(Math.abs(rounded)) + (kind === 'count' ? ' 笔' : ' 个点');
    const tone = kind === 'count' || rounded === 0 ? 'same' : rounded > 0 ? 'better' : 'worse';
    return { label, before: shown[0], after: shown[1], delta, tone };
  });
}

export function backtestLines(backtest) {
  const rows = backtestRows(backtest ?? {});
  return rows.length ? ['回测对比', ...rows.map(([label, before, after]) => `${label} ${before} → ${after}`)] : [noBacktest];
}

export function codingResultStatus(task) {
  return task.status === 'review' && task.result?.diffStat?.files === 0 ? 'no_changes' : task.status;
}
