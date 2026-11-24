// Parse quoting and escapes without invoking a shell or expanding variables.
export function shellWords(value) {
  const words = [];
  let word = '', quote = '', started = false;
  const input = String(value ?? '');
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '\\' && quote !== "'" && (!quote || /["\\$`\n]/.test(input[i + 1] || ''))) {
      if (++i === input.length) throw new Error('命令引号或转义不完整');
      if (input[i] !== '\n') { word += input[i]; started = true; }
    } else if (quote) {
      if (c === quote) quote = '';
      else word += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      started = true;
    } else if (/\s/.test(c)) {
      if (started) words.push(word);
      word = '';
      started = false;
    } else {
      word += c;
      started = true;
    }
  }
  if (quote) throw new Error('命令引号或转义不完整');
  if (started) words.push(word);
  return words;
}
