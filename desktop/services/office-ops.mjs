import {createHash, randomUUID} from 'node:crypto';
import {mkdir, readFile, rename, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {nativeFormula} from '../runtime/office-formula.mjs';

const clone = structuredClone;
const string = (maxLength, minLength = 0) => ({type: 'string', minLength, maxLength});
const id = string(160, 1);
const text = string(10000);
const number = {type: 'number'};
const boolean = {type: 'boolean'};
const enumeration = (...values) => ({enum: values});
const variant = (...oneOf) => ({oneOf});
const object = (properties, required = Object.keys(properties)) =>
  ({type: 'object', properties, required, additionalProperties: false});
const array = (items, maxItems, minItems = 1) => ({type: 'array', items, minItems, maxItems});
const cell = {...string(7, 2), pattern: '^[A-Z]{1,3}[1-9][0-9]{0,3}$'};
const value = variant(text, number, boolean, {type: 'null'});
const rows = array(array(value, 128), 500);
const style = object({
  bold: boolean, italic: boolean, color: {...string(7, 7), pattern: '^#[0-9a-fA-F]{6}$'},
  size: {type: 'number', minimum: 1, maximum: 400},
  heading: {type: 'integer', minimum: 0, maximum: 9},
  align: enumeration('left', 'center', 'right', 'justify'),
}, []);
const targetKinds = ['paragraph', 'table', 'shape', 'slide', 'sheet', 'cell', 'range', 'chart'];
const index = {type: 'integer', minimum: 1};
function targetOf(...kinds) {
  return {...object({kind: enumeration(...kinds), id, index, label: id}, ['kind']), minProperties: 2};
}
export const officeTargetSchema = targetOf(...targetKinds);
const paragraph = object({paragraph: id});
const shape = object({slide: id, shape: id});
const table = object({table: id});
const chartTarget = object({chart: id});
const sheet = object({sheet: id});
const slide = object({slide: id});
const cellTarget = object({sheet: id, cell});
const textTarget = variant(targetOf('paragraph', 'shape'), paragraph, object({find: string(1000, 1)}), shape);
const selector = variant(targetOf(...targetKinds.filter(kind => kind !== 'range')), paragraph, shape, table, chartTarget, sheet, slide, cellTarget);
const anchor = variant(targetOf('paragraph', 'table', 'chart', 'slide', 'sheet'), paragraph, table, chartTarget, slide, sheet, {type: 'null'});
const chart = object({
  type: enumeration('line', 'bar', 'pie'),
  series: array(object({name: id, values: array(number, 500)}), 24),
  categories: array(string(200), 500), title: string(200),
}, ['type', 'series', 'categories']);
const stamp = string(40, 1);
const provenance = {source: id, sourceAsOf: variant(stamp, {type: 'null'}), fetchedAt: stamp, sourceTiming: enumeration('close')};

function op(name, properties, required = Object.keys(properties)) {
  return object({op: {const: name}, ...properties}, ['op', ...required]);
}

const anchored = (name, props, required = Object.keys(props)) => [
  op(name, {after: anchor, ...props}, ['after', ...required]),
  op(name, {before: anchor, ...props}, ['before', ...required]),
];
export const officeOpSchema = variant(
  op('replace_text', {target: variant(...textTarget.oneOf, object({document: {const: true}})), text}),
  op('replace_document', {text}),
  op('set_style', {target: variant(...textTarget.oneOf, targetOf('cell'), cellTarget), style}),
  ...anchored('insert_paragraph', {text, style}, ['text']),
  ...anchored('insert_table', {rows, header: boolean}, ['rows']),
  op('update_table', {target: variant(table, targetOf('table')), rows, ...provenance}, ['target', 'rows']),
  ...anchored('insert_chart', {chart}),
  op('update_chart', {target: variant(chartTarget, targetOf('chart')), chart, ...provenance}, ['target', 'chart']),
  ...[{target: targetOf('cell')}, {sheet: id, cell}].flatMap(address => [
    op('set_cell', {...address, value}),
    op('set_cell', {...address, formula: string(400, 1)}),
  ]),
  op('add_slide', {layout: id, title: text, bullets: array(text, 100, 0)}, ['layout', 'title']),
  ...anchored('add_slide', {layout: id, title: text, bullets: array(text, 100, 0)}, ['layout', 'title']),
  op('set_shape_text', {target: targetOf('shape'), text}),
  op('set_shape_text', {slide: id, shape: id, text}),
  op('delete', {target: selector}),
);
export const officeOpsSchema = array(officeOpSchema, 100);
export const officeRangeSchema = variant(selector, targetOf('range'), object({sheet: id, from: cell, to: cell}));
export const officeRefreshTargetSchema = variant(table, chartTarget, targetOf('table', 'chart'));

export function matchesOfficeSchema(schema, input) {
  if (schema.oneOf) return schema.oneOf.filter(branch => matchesOfficeSchema(branch, input)).length === 1;
  if (Object.hasOwn(schema, 'const')) return input === schema.const;
  if (schema.enum) return schema.enum.includes(input);
  switch (schema.type) {
    case 'null': return input === null;
    case 'boolean': return typeof input === 'boolean';
    case 'string':
      return typeof input === 'string' && input.length >= schema.minLength && input.length <= schema.maxLength
        && !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(input) && (!schema.pattern || new RegExp(schema.pattern).test(input));
    case 'integer':
    case 'number':
      return Number.isFinite(input) && (schema.type !== 'integer' || Number.isInteger(input))
        && input >= (schema.minimum ?? -Infinity) && input <= (schema.maximum ?? Infinity);
    case 'array':
      return Array.isArray(input) && input.length >= schema.minItems && input.length <= schema.maxItems
        && Array.from(input).every(item => matchesOfficeSchema(schema.items, item));
    case 'object':
      return input != null && [Object.prototype, null].includes(Object.getPrototypeOf(input))
        && Object.keys(input).length >= (schema.minProperties ?? 0)
        && schema.required.every(key => Object.hasOwn(input, key))
        && Object.keys(input).every(key => Object.hasOwn(schema.properties, key) && matchesOfficeSchema(schema.properties[key], input[key]));
    default: return false;
  }
}

export function validateOfficeOps(ops) {
  if (!matchesOfficeSchema(officeOpsSchema, ops) || JSON.stringify(ops).length > 300000) throw Error('Office 操作参数无效或超限');
  for (const entry of ops) {
    if (entry.rows && entry.rows.some(row => row.length !== entry.rows[0].length)) throw Error('表格行列数不一致');
    if (entry.chart && (entry.chart.series.some(series => series.values.length !== entry.chart.categories.length)
      || (entry.chart.type === 'pie' && entry.chart.series.length !== 1))) throw Error('图表数据维度不一致');
    if (entry.formula) nativeFormula(entry.formula);
    if (Object.keys(provenance).some(key => Object.hasOwn(entry, key))) {
      const validTime = (time, dateOnly = false) => {
        if (!Number.isFinite(Date.parse(time))) return false;
        const iso = new Date(time).toISOString();
        return iso === time || (dateOnly && iso.slice(0, 10) === time);
      };
      if (!entry.source || !validTime(entry.fetchedAt) || !Object.hasOwn(entry, 'sourceAsOf') ||
          (entry.sourceAsOf !== null && (!validTime(entry.sourceAsOf, !entry.sourceTiming) || Date.parse(entry.sourceAsOf) > Date.parse(entry.fetchedAt))) ||
          (entry.sourceTiming && !entry.sourceAsOf)) throw Error('数据时间戳无效');
    }
    if (entry.style && !Object.keys(entry.style).length) throw Error('样式不能为空');
  }
}

const groups = {paragraph: 'paragraphs', table: 'tables', chart: 'charts', slide: 'slides', sheet: 'sheets', shape: 'shapes'};
const formats = {docx: 'writer', pptx: 'impress', xlsx: 'calc'};

// Compound target IDs use a URI-encoded parent ID and a child ID separated by
// a slash. Outline and find return these opaque references to the caller.
const compound = (parent, child) => [parent, child].map(encodeURIComponent).join('/');
function normalizeTarget(doc, target) {
  if (!target?.kind) return target;
  const {kind, id, index, label} = target;
  if (kind === 'cell' || kind === 'range') {
    const [sheet, address, ...rest] = (id ?? '').split('/').map(decodeURIComponent);
    if (!sheet || !address || rest.length || index !== undefined || label !== undefined) throw Error('单元格或区域需要复合 ID');
    if (kind === 'cell' && matchesOfficeSchema(cell, address)) return {sheet, cell: address};
    const [from, to, ...extra] = address.split(':');
    if (kind === 'range' && !extra.length && matchesOfficeSchema(cell, from) && matchesOfficeSchema(cell, to)) return {sheet, from, to};
    throw Error('单元格或区域 ID 无效');
  }
  const candidates = kind === 'shape'
    ? doc.slides.flatMap(slide => slide.shapes.map(item => ({item, target: {slide: slide.id, shape: item.id}, id: compound(slide.id, item.id)})))
    : doc[groups[kind]].map(item => ({item, target: {[kind]: item.id}, id: item.id}));
  const matches = candidates.filter((candidate, i) =>
    (id === undefined || candidate.id === id) && (index === undefined || index === i + 1) &&
    (id !== undefined || index !== undefined || label === undefined || candidate.item.label === label || candidate.item.name === label || candidate.item.title === label ||
      candidate.item.chart?.title === label || candidate.item.text === label));
  if (matches.length !== 1) throw Error('Office 操作目标不存在或不唯一');
  return matches[0].target;
}

function publicTarget(target) {
  if (!target || target.find || target.document) return null;
  if (target.shape) return {kind: 'shape', id: compound(target.slide, target.shape)};
  if (target.cell) return {kind: 'cell', id: compound(target.sheet, target.cell)};
  const [kind, id] = Object.entries(target)[0];
  return {kind, id};
}

function describeTarget(doc, target) {
  if (!target) return '';
  if (target.find) return `“${clip(target.find)}”的匹配项`;
  if (target.document) return '整份文档';
  const {kind} = publicTarget(target);
  const {item, index} = locate(doc, target, {emptyCell: true});
  if (kind === 'paragraph') return `第 ${index + 1} 段`;
  if (kind === 'slide') return `第 ${index + 1} 张幻灯片`;
  if (kind === 'shape') {
    const slide = locate(doc, {slide: target.slide});
    const name = item.label || item.name || (item.id === 'title' ? '标题框' : `形状 ${index + 1}`);
    return `第 ${slide.index + 1} 张幻灯片 · ${clip(name)}`;
  }
  if (kind === 'cell') return `${describeTarget(doc, {sheet: target.sheet})} · ${target.cell}`;
  const anchor = item.after ?? item.before;
  const paragraphIndex = anchor?.paragraph ? doc.paragraphs.findIndex(para => para.id === anchor.paragraph) : -1;
  const leading = doc.paragraphs[paragraphIndex - Number(!!item.before)];
  const header = item.header && item.rows?.[0].filter(value => value != null && value !== '').join(' / ');
  const label = (leading?.style?.heading ? leading.text : '') || item.label || item.name || item.chart?.title || header;
  return `${{table: '表', chart: '图表', sheet: '工作表'}[kind]} ${index + 1}${label ? `（${clip(label)}）` : ''}`;
}

function normalizeOperation(doc, entry) {
  const normalized = {...entry};
  for (const key of ['target', 'after', 'before']) {
    if (Object.hasOwn(entry, key)) normalized[key] = normalizeTarget(doc, entry[key]);
  }
  if (entry.op === 'replace_document') normalized.target = {document: true};
  if (entry.op === 'set_cell') Object.assign(normalized, normalized.target ?? {sheet: entry.sheet, cell: entry.cell});
  if (entry.op === 'set_shape_text') normalized.target ??= {slide: entry.slide, shape: entry.shape};
  if (entry.op === 'set_cell') normalized.target = {sheet: normalized.sheet, cell: normalized.cell};
  return normalized;
}

function locate(doc, target, {emptyCell = false} = {}) {
  const key = target.shape ? 'shape' : target.cell ? 'cell' : Object.keys(target)[0];
  let owner = doc;
  if (key === 'shape') owner = locate(doc, {slide: target.slide}).item;
  if (key === 'cell') {
    owner = locate(doc, {sheet: target.sheet}).item;
    const item = Object.hasOwn(owner.cells, target.cell) ? owner.cells[target.cell] : undefined;
    if (!item && !emptyCell) throw Error('单元格不存在');
    return {item, list: owner.cells, index: target.cell};
  }
  const list = owner[groups[key]];
  const index = list?.findIndex(item => item.id === target[key]) ?? -1;
  if (index < 0) throw Error('Office 操作目标不存在');
  return {item: list[index], list, index};
}

function textEntries(doc) {
  return [
    ...doc.paragraphs.map(item => [{paragraph: item.id}, item]),
    ...doc.slides.flatMap(slide => slide.shapes.map(item => [{slide: slide.id, shape: item.id}, item])),
    ...doc.sheets.flatMap(sheet => Object.entries(sheet.cells).map(([cell, item]) => [{sheet: sheet.id, cell}, item])),
  ];
}

function find(doc, query) {
  const matches = [];
  const add = (target, item, coordinates) => {
    if (matches.length < 200 && [item.text, item.value, item.formula].some(value => value != null && String(value).includes(query))) {
      matches.push({target: publicTarget(target), ...summary(item), ...coordinates});
    }
  };
  for (const [target, item] of textEntries(doc)) add(target, item);
  for (const table of doc.tables) {
    table.rows.forEach((row, y) => row.forEach((value, x) => add({table: table.id}, {value}, {row: y + 1, column: x + 1})));
  }
  for (const {id, chart} of doc.charts) {
    for (const text of [chart.title, ...chart.categories, ...chart.series.map(series => series.name)]) add({chart: id}, {text});
  }
  return matches;
}

function coordinates(address) {
  const [, letters, row] = /^([A-Z]+)(\d+)$/.exec(address);
  return [Number(row), [...letters].reduce((col, ch) => col * 26 + ch.charCodeAt(0) - 64, 0)];
}

function read(doc, range) {
  if (!matchesOfficeSchema(officeRangeSchema, range)) throw Error('Office 读取范围无效');
  range = normalizeTarget(doc, range);
  if (!range.from) return clone(locate(doc, range, {emptyCell: true}).item ?? null);
  const [top, left] = coordinates(range.from);
  const [bottom, right] = coordinates(range.to);
  if (bottom < top || right < left || (bottom - top + 1) * (right - left + 1) > 5000) throw Error('读取区域顺序错误或超过 5000 格');
  const cells = locate(doc, {sheet: range.sheet}).item.cells;
  return Object.fromEntries(Object.entries(cells).filter(([address]) => {
    const [row, col] = coordinates(address);
    return row >= top && row <= bottom && col >= left && col <= right;
  }).map(([address, cell]) => [address, clone(cell)]));
}

const clip = (value, length = 90) => typeof value === 'string' && value.length > length ? value.slice(0, length) + '…' : value;
function summary(item) {
  if (!item) return null;
  if (item.rows) return {
    rows: item.rows.length, columns: item.rows[0].length,
    sample: item.rows.slice(0, 6).map(row => row.slice(0, 4)), footnote: item.footnote,
  };
  if (item.chart) return {
    type: item.chart.type, title: clip(item.chart.title), points: item.chart.categories.length,
    categories: item.chart.categories.slice(0, 3).map(value => clip(value, 24)),
    series: item.chart.series.slice(0, 4).map(({name, values}) => ({name: clip(name, 24), values: values.slice(0, 3)})),
    footnote: item.footnote,
  };
  return {
    text: clip(item.text ?? item.title ?? item.name), style: item.style,
    value: clip(item.value), formula: clip(item.formula), shapes: item.shapes?.length,
    cells: item.cells ? Object.keys(item.cells).length : undefined,
  };
}

function insert(doc, group, entry, item) {
  const list = doc[group];
  const side = Object.hasOwn(entry, 'before') ? 'before' : 'after';
  const target = entry[side];
  const anchor = target && locate(doc, target);
  if (anchor && anchor.list !== list) item[side] = clone(target);
  if (group === 'slides' && anchor && anchor.list !== list) throw Error('幻灯片锚点必须为幻灯片');
  const index = anchor?.list === list ? anchor.index + Number(side === 'after') : side === 'before' && !target ? 0 : list.length;
  list.splice(index, 0, item);
}

function applyOperation(doc, entry) {
  const {op, target} = entry;
  if (op === 'replace_document' || op === 'replace_text' || op === 'set_style' || op === 'set_shape_text') {
    const selector = target ?? {slide: entry.slide, shape: entry.shape};
    if (selector.document) {
      if (doc.kind !== 'writer') throw Error('整篇替换只支持 Writer');
      const before = {paragraphs: doc.paragraphs.length, first: summary(doc.paragraphs[0]), tables: doc.tables.length, charts: doc.charts.length};
      doc.paragraphs = [{id: randomUUID(), text: entry.text}];
      doc.tables = [];
      doc.charts = [];
      return {before, after: summary(doc.paragraphs[0]), count: 1, inserted: {paragraph: doc.paragraphs[0].id}};
    }
    const matches = selector.find
      ? textEntries(doc).filter(([, item]) => item.text?.includes(selector.find))
      : [[selector, locate(doc, selector).item]];
    if (!matches.length) throw Error('未找到匹配文本');
    const changes = matches.map(([target, item]) => {
      const original = clone(item);
      const before = summary(item);
      if (op === 'set_style') item.style = {...item.style, ...entry.style};
      else item.text = selector.find ? item.text.split(selector.find).join(entry.text) : entry.text;
      if (item.text?.length > 10000) throw Error('修改后文本超过长度上限');
      return {target, before, after: summary(item), changed: !isDeepStrictEqual(original, item)};
    });
    return {before: changes.slice(0, 3).map(i => i.before), after: changes.slice(0, 3).map(i => i.after),
      locations: changes.filter(i => i.changed).map(i => i.target), matches: changes.length, count: changes.filter(i => i.changed).length};
  }
  if (op === 'update_table' || op === 'update_chart' || op === 'delete') {
    const {item, list, index} = locate(doc, target);
    const before = summary(item);
    if (op === 'delete') {
      if (Array.isArray(list)) list.splice(index, 1);
      else delete list[index];
      for (const group of ['paragraphs', 'tables', 'charts']) {
        doc[group] = doc[group].filter(child => !isDeepStrictEqual(child.after, target) && !isDeepStrictEqual(child.before, target));
      }
      const adjacent = Array.isArray(list) && (list[index] ?? list[index - 1]);
      const parent = target.shape ? {slide: target.slide} : target.cell ? {sheet: target.sheet} : null;
      const destination = parent ?? (adjacent ? {[Object.keys(target)[0]]: adjacent.id} : null);
      return {before, after: null, count: 1, locations: [destination]};
    }
    if (op === 'update_table') {
      item.rows = entry.rows;
    } else item.chart = entry.chart;
    if (entry.fetchedAt) item.footnote = Object.fromEntries(Object.keys(provenance)
      .filter(key => Object.hasOwn(entry, key)).map(key => [key, entry[key]]));
    return {before, after: summary(item), count: 1};
  }
  if (op === 'set_cell') {
    const {item, list, index} = locate(doc, {sheet: entry.sheet, cell: entry.cell}, {emptyCell: true});
    const {value, formula} = entry;
    const next = {...item};
    delete next.value;
    delete next.formula;
    delete next.calculated;
    if (formula !== undefined) next.formula = '=' + nativeFormula(formula);
    else next.value = value;
    list[index] = next;
    return {before: summary(item), after: summary(next), count: 1};
  }
  const item = {id: randomUUID()};
  if (op === 'add_slide') {
    if (doc.kind !== 'impress') throw Error('只有 Impress 支持新增幻灯片');
    const titles = [entry.title, ...(entry.bullets ?? [])];
    insert(doc, 'slides', entry, Object.assign(item, {layout: entry.layout, title: entry.title, shapes: titles.map((text, index) => ({id: index ? 'bullet-' + index : 'title', text}))}));
  } else if (op === 'insert_paragraph') {
    if (doc.kind !== 'writer') throw Error('只有 Writer 支持插入段落');
    insert(doc, 'paragraphs', entry, Object.assign(item, {text: entry.text, style: entry.style}));
  } else if (op === 'insert_table') {
    insert(doc, 'tables', entry, Object.assign(item, {rows: entry.rows, header: entry.header ?? false}));
  } else {
    insert(doc, 'charts', entry, Object.assign(item, {chart: entry.chart}));
  }
  const kind = {add_slide: 'slide', insert_paragraph: 'paragraph', insert_table: 'table', insert_chart: 'chart'}[op];
  return {before: null, after: summary(item), count: 1, inserted: {[kind]: item.id}};
}

export const PREVIEW_TTL_MS = 10 * 60 * 1000;
export const UNDO_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const validToken = /^[0-9a-f-]{36}$/;
const conflict = () => ({status: 'conflict', message: '文档版本已变化，请重新预览后确认'});

export function createFileOfficeUndoStore(directory) {
  function file(token) {
    if (!validToken.test(token)) throw Error('撤回凭证无效');
    return join(directory, token + '.json');
  }
  return {
    async get(token) {
      if (!validToken.test(token)) return undefined;
      try {
        return JSON.parse(await readFile(file(token), 'utf8'));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    },
    async set(token, record) {
      const target = file(token);
      await mkdir(directory, {recursive: true, mode: 0o700});
      const temporary = target + '.' + randomUUID() + '.tmp';
      await writeFile(temporary, JSON.stringify(record), {flag: 'wx', mode: 0o600});
      try {
        await rename(temporary, target);
      } catch (error) {
        await rm(temporary, {force: true});
        throw error;
      }
    },
    delete(token) { return rm(file(token), {force: true}); },
  };
}

function outlineItems(doc, kind, items) {
  return items.map((item, index) => ({
    id: item.id, kind, index: index + 1, label: describeTarget(doc, {[kind]: item.id}),
  }));
}

// Engines own document CAS and history retention. Undo metadata is written
// before commit so it survives restart, and verified against the applied version.
export function createOpsAdapter(engine, {now = Date.now, undoStore = engine.undoStore ?? new Map()} = {}) {
  const plans = new Map();
  return {
    async outline(docId) {
      const {document: doc, revision} = await engine.snapshot(docId);
      return {kind: doc.kind, revision,
        paragraphs: outlineItems(doc, 'paragraph', doc.paragraphs).map((target, i) => ({
          ...target, text: clip(doc.paragraphs[i].text), heading: doc.paragraphs[i].style?.heading,
        })),
        slides: outlineItems(doc, 'slide', doc.slides).map((target, i) => {
          const {title, shapes} = doc.slides[i];
          return {...target, title: shapes.find(shape => shape.id === 'title')?.text ?? title,
            shapes: shapes.map(({id}) => ({...publicTarget({slide: target.id, shape: id}), label: describeTarget(doc, {slide: target.id, shape: id})}))};
        }),
        sheets: outlineItems(doc, 'sheet', doc.sheets).map((target, i) => ({...target, name: doc.sheets[i].name})),
        tables: outlineItems(doc, 'table', doc.tables).map((target, i) => ({...target, ...summary(doc.tables[i])})),
        charts: outlineItems(doc, 'chart', doc.charts).map((target, i) => ({...target, ...summary(doc.charts[i])}))};
    },
    async read(docId, range, {withRevision = false} = {}) {
      const {document, revision} = await engine.snapshot(docId);
      const content = read(document, range);
      return withRevision ? {content, revision} : content;
    },
    async find(docId, query) {
      if (!matchesOfficeSchema(string(1000, 1), query)) throw Error('Office 查找条件无效');
      return find((await engine.snapshot(docId)).document, query);
    },
    async preview(docId, ops, {track = true, signal, expectedRevision} = {}) {
      validateOfficeOps(ops);
      ops = clone(ops);
      signal?.throwIfAborted();
      const snapshot = await engine.snapshot(docId);
      if (expectedRevision !== undefined && snapshot.revision !== expectedRevision) return conflict();
      const next = clone(snapshot.document);
      const inverse = [];
      const normalized = [];
      const items = ops.map(raw => {
        const entry = normalizeOperation(next, raw);
        normalized.push(entry);
        const target = entry.target ?? entry.before ?? entry.after;
        const label = describeTarget(next, target);
        const before = clone(next);
        const {inserted, locations, ...result} = applyOperation(next, entry);
        const undo = Object.keys(before).filter(key => !isDeepStrictEqual(before[key], next[key]))
          .map(key => ({op: 'restore', key, value: before[key]}));
        inverse.unshift(...undo);
        const position = inserted ?? (locations ? locations[0] : target);
        return {op: entry.op, label, resultLabel: inserted ? describeTarget(next, inserted) : label,
          anchorSide: entry.before !== undefined ? 'before' : 'after',
          location: publicTarget(position), ...result, count: undo.length ? result.count : 0};
      }).filter(item => item.count);
      const changes = items.reduce((total, entry) => total + entry.count, 0);
      const highRisk = ops.length > 20 || normalized.some(({target, op}) =>
        target?.document === true || op === 'delete' && !target.shape && (target.slide || target.sheet));
      if (!changes) throw Error('文档内容没有变化');
      const prepared = await engine.preflight?.(docId, {snapshot, next, ops: normalized, signal});
      const created = now();
      for (const [token, plan] of plans) if (plan.expiresAt <= created) plans.delete(token);
      if (plans.size >= 256) throw Error('待确认的 Office 预览已满，请先处理现有预览');
      const previewToken = randomUUID();
      const receipt = {id: randomUUID(), kind: next.kind === 'writer' ? 'revision' : 'changeset', track: next.kind === 'writer' || track,
        changes, snapshot: snapshot.document, inverse};
      plans.set(previewToken, {docId, snapshot, next, items, receipt, prepared, expiresAt: created + PREVIEW_TTL_MS});
      return {previewToken, revision: snapshot.revision, changes, highRisk: !!highRisk, items: clone(items)};
    },
    discardPreview(previewToken) { plans.delete(previewToken); },
    async apply(previewToken, {confirmed = false, signal, guard, scope} = {}) {
      if (!confirmed) throw Error('Office 修改尚未确认');
      const data = plans.get(previewToken);
      if (!data) return {status: 'invalid_preview', message: 'Office 预览无效或已使用，请重新预览'};
      plans.delete(previewToken);
      if (data.expiresAt <= now()) return {status: 'expired', message: 'Office 预览已过期，请重新预览'};
      signal?.throwIfAborted();
      const {docId, snapshot, receipt, prepared, items} = data;
      await guard?.();
      if ((await engine.snapshot(docId)).revision !== snapshot.revision) return conflict();
      if (data.expiresAt <= now()) return {status: 'expired', message: 'Office 预览已过期，请重新预览'};
      const undoToken = receipt.id;
      const expiresAt = now() + UNDO_TTL_MS;
      const context = {docId, baseRevision: snapshot.revision, expiresAt, changes: receipt.changes,
        ...(scope && {scope}), locations: items.map(item => item.location),
        ...(await engine.undoMetadata?.({snapshot, prepared}))};
      await undoStore.set(undoToken, context);
      let committed;
      try {
        committed = await engine.commit(docId, {...data, signal, guard: async () => {
          await guard?.();
          if (data.expiresAt <= now()) throw Object.assign(Error('Office 预览已过期，请重新预览'), {code: 'OFFICE_PREVIEW_EXPIRED'});
        }});
      } catch (error) {
        await undoStore.delete(undoToken);
        if (error.code === 'OFFICE_PREVIEW_EXPIRED') return {status: 'expired', message: error.message};
        if (error.code === 'OFFICE_CONFLICT' || error.message.includes('版本已变化')) return conflict();
        throw error;
      }
      return {status: 'succeeded', changes: receipt.changes, items: clone(items), revision: committed.revision,
        undoToken, expiresAt, kind: receipt.kind};
    },
    async undoContext(undoToken) { return clone(await undoStore.get(undoToken)); },
    async rollback(undoToken, {signal, guard} = {}) {
      signal?.throwIfAborted();
      await guard?.();
      const context = await undoStore.get(undoToken);
      if (!context) return {status: 'invalid_undo', message: '撤回凭证无效或已使用'};
      const history = reason => ({status: 'version_history', reason, docId: context.docId, revision: context.baseRevision,
        message: '请在版本历史中恢复修改前的版本'});
      if (context.expiresAt <= now()) return history('expired');
      const rollbackGuard = async () => {
        await guard?.();
        if (context.expiresAt <= now()) throw Object.assign(Error('撤回凭证已过期'), {code: 'OFFICE_UNDO_EXPIRED'});
      };
      try {
        const result = await engine.rollback(context.docId, undoToken, {context, signal, guard: rollbackGuard});
        if (!result) return history('version_changed');
        await undoStore.delete(undoToken);
        return {status: 'succeeded', ...result};
      } catch (error) {
        if (error.code === 'OFFICE_UNDO_EXPIRED') return history('expired');
        if (error.code === 'OFFICE_CONFLICT' || error.message.includes('版本已变化')) return history('version_changed');
        throw error;
      }
    },
  };
}

export function createMockEngine(documents = {}) {
  const docs = new Map(Object.entries(documents).map(([id, source]) => {
    const kind = formats[source.format] ?? source.kind;
    if (!Object.values(formats).includes(kind)) throw Error('Office 文档格式无效');
    const document = {kind, paragraphs: [], tables: [], charts: [], slides: [], sheets: [], ...clone(source)};
    for (const slide of document.slides) slide.shapes ??= [];
    for (const sheet of document.sheets) sheet.cells ??= {};
    return [id, {document, revision: 1}];
  }));
  const receipts = new Map();
  function get(id) {
    const entry = docs.get(id);
    if (!entry) throw Error('Office 文档不存在');
    return entry;
  }
  return {
    undoStore: new Map(),
    snapshot: id => clone(get(id)),
    saveAuto(id) {
      const entry = get(id);
      docs.set(id, {...entry, revision: entry.revision + 1});
    },
    saveManual(id) {
      const entry = get(id);
      if (entry.changeId) receipts.delete(entry.changeId);
      docs.set(id, {document: entry.document, revision: entry.revision + 1});
    },
    async commit(id, {snapshot, next, receipt, signal, guard}) {
      await guard?.();
      signal?.throwIfAborted();
      const {revision, changeId} = get(id);
      if (revision !== snapshot.revision) throw Object.assign(Error('预览期间文档版本已变化，请重新预览'), {code: 'OFFICE_CONFLICT'});
      docs.set(id, {document: clone(next), revision: revision + 1, changeId: receipt.id});
      if (changeId) receipts.delete(changeId);
      receipts.set(receipt.id, {docId: id, revision: revision + 1, ...clone(receipt)});
      return {revision: revision + 1};
    },
    async rollback(id, changeId, {signal, guard} = {}) {
      await guard?.();
      signal?.throwIfAborted();
      const receipt = receipts.get(changeId);
      const {document, revision, changeId: latest} = get(id);
      if (receipt?.docId !== id || latest !== changeId) return null;
      const restored = clone(document);
      for (const {key, value} of receipt.inverse) restored[key] = clone(value);
      docs.set(id, {document: restored, revision: revision + 1});
      receipts.delete(changeId);
      return {revision: revision + 1, changes: receipt.changes};
    },
  };
}

// The legacy editor exposes package coordinates. Keep its reads and bounded
// Calc cell writes, using the document service's revision check and save lock.
export async function createExistingOfficeEngine(documents, {undoStore, undoDirectory} = {}) {
  const {documentEditor, editDocument, pptLayerView} = await import('../runtime/documents.mjs');
  const {wordStructure} = await import('../runtime/word-structure.mjs');
  return {
    undoStore: undoStore ?? (undoDirectory && createFileOfficeUndoStore(undoDirectory)),
    snapshot(docId) {
      const meta = documents.read(docId);
      const kind = formats[meta.format];
      if (!kind || meta.hasRichSource) throw Error('现有精确修改引擎不支持此文档');
      const {bytes, revision} = documents.bytes(docId, meta.revision);
      const document = {kind, paragraphs: [], tables: [], charts: [], slides: [], sheets: []};
      if (kind === 'writer') {
        document.paragraphs = wordStructure(bytes).paragraphs.map(({part, paragraph, text, runs}) => ({
          id: part + ':' + paragraph, text, runs,
        }));
      } else if (kind === 'impress') {
        document.slides = pptLayerView(bytes).map(({slide, layers}) => ({
          id: String(slide), title: layers.find(layer => layer.text)?.text ?? '',
          shapes: layers.map(({id, text, fill, label, kind}) => ({id, text, label, kind, style: {fill}})),
        }));
      } else {
        const view = documentEditor(meta.format, bytes);
        document.sheets = view.sheets.map(({sheetIndex, name}) => ({
          id: String(sheetIndex), name,
          cells: Object.fromEntries(view.cells.filter(cell => cell.sheetIndex === sheetIndex)
            .map(({sheetIndex, address, ...cell}) => [address, cell])),
        }));
      }
      return {document, revision, bytes};
    },
    preflight(docId, {snapshot, next, ops, signal}) {
      signal?.throwIfAborted();
      if (snapshot.document.kind !== 'calc' || ops.some(entry => entry.op !== 'set_cell')) {
        throw Error('现有引擎仅支持 Calc 单元格写入；结构编辑和 Writer 修订需要 O1 引擎');
      }
      const cells = new Map();
      for (const entry of ops) {
        const {formula, value} = locate(next, {sheet: entry.sheet, cell: entry.cell}).item;
        cells.set(entry.sheet + '!' + entry.cell, {
          sheetIndex: Number(entry.sheet), address: entry.cell, value: formula ? {formula} : value,
        });
      }
      return editDocument('xlsx', snapshot.bytes, {cells: [...cells.values()]}).bytes;
    },
    undoMetadata({snapshot, prepared}) {
      return {appliedRevision: snapshot.revision + 1, appliedSha: createHash('sha256').update(prepared).digest('hex')};
    },
    async commit(docId, {snapshot, prepared, signal, guard}) {
      const {document} = await documents.replaceBytes(docId, snapshot.revision, prepared, signal, {guard});
      return {revision: document.revision};
    },
    async rollback(docId, undoToken, {context, signal, guard}) {
      const current = documents.read(docId);
      if (context.appliedRevision !== current.revision || context.appliedSha !== current.sha256) return null;
      if (!current.history.some(version => version.revision === context.baseRevision)) return null;
      const {bytes} = documents.bytes(docId, context.baseRevision);
      const {document} = await documents.replaceBytes(docId, current.revision, bytes, signal, {guard});
      return {revision: document.revision, changes: context.changes};
    },
  };
}

/** Stage Office assistant edits offscreen. The live tab stays untouched until a verified CAS commit. */
export async function createNativeOfficeOpsEngine(documents, {withNativeDocument, undoStore}) {
  const fallback = await createExistingOfficeEngine(documents, {undoStore});
  return {
    ...fallback,
    async snapshot(docId) {
      const meta = documents.read(docId);
      if (!formats[meta.format]) throw Error('Office 格式不受支持');
      const {bytes, revision} = documents.bytes(docId, meta.revision);
      return withNativeDocument({format:meta.format, bytes}, async request => {
        const model = await request('read');
        const document = {kind:formats[meta.format], paragraphs:[], tables:[], charts:[], slides:[], sheets:[]};
        document.paragraphs = (model.paragraphs ?? []).map(item => ({
          id:String(item.paragraph), text:item.text, style:item.style ? {heading:item.style} : {},
        }));
        document.tables = (model.tables ?? []).map((rows, index) => ({id:String(index), rows, header:true}));
        document.slides = (model.slides ?? []).map(({slide, shapes}) => ({
          id:String(slide), title:shapes.find(shape => shape.text)?.text ?? '',
          shapes:shapes.map(({shape, name, text}) => ({id:shape, name, text})),
        }));
        document.sheets = (model.sheets ?? []).map(({sheet, cells}, index) => ({
          id:String(index), name:sheet, cells:Object.fromEntries(Object.entries(cells).map(([address, cell]) => [
            address, {...cell, formula:cell.formula ? '=' + cell.formula : undefined},
          ])),
        }));
        return {document, revision, bytes, format:meta.format};
      });
    },
    async preflight(docId, {snapshot, ops, signal}) {
      signal?.throwIfAborted();
      const supported = {
        docx:new Set(['replace_text','insert_paragraph','insert_table','update_table','set_style']),
        pptx:new Set(['replace_text','set_shape_text']),
        xlsx:new Set(['set_cell']),
      };
      if (ops.some(op => !supported[snapshot.format].has(op.op))) throw Error('当前 Office 引擎不支持这项操作');
      return withNativeDocument(snapshot, async request => {
        signal?.throwIfAborted();
        await request('apply', {ops, track:snapshot.format === 'docx'});
        signal?.throwIfAborted();
        return (await request('snapshot')).binary;
      });
    },
    async commit(docId, {snapshot, prepared, signal, guard}) {
      const result = await documents.replaceBytes(docId, snapshot.revision, prepared, signal, {
        guard, expectedRevision:snapshot.revision, nativeOffice:true, reason:'ai',
      });
      if (result.conflict) throw Object.assign(Error('Office 文档版本已变化'), {code:'OFFICE_CONFLICT'});
      return {revision:result.revision};
    },
    async rollback(docId, undoToken, {context, signal, guard}) {
      const current = documents.read(docId);
      if (context.appliedRevision !== current.revision || context.appliedSha !== current.sha256 ||
          !current.history.some(item => item.revision === context.baseRevision)) return null;
      const {bytes} = documents.bytes(docId, context.baseRevision);
      const result = await documents.replaceBytes(docId, current.revision, bytes, signal, {
        guard, expectedRevision:current.revision, nativeOffice:true, reason:'manual',
      });
      return result.conflict ? null : {revision:result.revision, changes:context.changes};
    },
  };
}
