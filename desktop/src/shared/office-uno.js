// [lane:ribbon] Whitelisted LibreOfficeKit UNO commands, strict argument validation and STATE_CHANGED mapping.
// Pure module: used by the Electron main side (office-workspace.mjs) and by the renderer (commands.js).
const COLOR = {type: 'long', min: 0, max: 0xFFFFFF};
const COLOR_OR_AUTO = {type: 'long', min: -1, max: 0xFFFFFF}; // [excel] -1 = no fill / automatic
const bool = {type: 'boolean'};
const OOXML_FORMATS = ['pptx'];
const XLSX = ['xlsx']; // [excel] Calc-only commands
const PPT_XLSX = ['pptx', 'xlsx'];
const ALL_DOC = ['pptx', 'xlsx', 'docx'], PPT_DOCX = ['pptx', 'docx'], XLSX_DOCX = ['xlsx', 'docx']; // [docx]
const DOCX = ['docx'];
const dx = (o = {}) => ({formats: DOCX, ...o});
const xl = (o = {}) => ({formats: XLSX, ...o});
/** command -> {args: {LOKArgName: spec}, formats}. Anything not listed here is rejected. */
export const UNO_COMMANDS = Object.freeze({
  '.uno:Strikeout': {}, '.uno:SuperScript': {}, '.uno:SubScript': {},
  '.uno:Grow': {}, '.uno:Shrink': {},
  '.uno:CharFontName': {args: {'CharFontName.FamilyName': {type: 'string', max: 80, pattern: /^[\p{L}\p{N} ._()\-]+$/u}}},
  '.uno:FontHeight': {args: {'FontHeight.Height': {type: 'float', min: 1, max: 400}}},
  '.uno:Color': {args: {Color: COLOR}},
  '.uno:CharBackColor': {args: {CharBackColor: COLOR}},
  '.uno:FillColor': {args: {FillColor: COLOR}},
  '.uno:XLineColor': {args: {XLineColor: COLOR}},
  '.uno:LeftPara': {}, '.uno:CenterPara': {}, '.uno:RightPara': {}, '.uno:JustifyPara': {},
  '.uno:DefaultBullet': {}, '.uno:DefaultNumbering': {},
  '.uno:IncrementIndent': {}, '.uno:DecrementIndent': {},
  '.uno:SpacePara1': {}, '.uno:SpacePara15': {}, '.uno:SpacePara2': {},
  '.uno:FormatPaintbrush': {}, '.uno:ResetAttributes': {},
  '.uno:Text': {formats: PPT_DOCX}, '.uno:Line': {formats: ALL_DOC}, '.uno:LineArrowEnd': {formats: ALL_DOC},
  '.uno:BasicShapes.rectangle': {formats: ALL_DOC}, '.uno:BasicShapes.round-rectangle': {formats: ALL_DOC}, '.uno:BasicShapes.ellipse': {formats: ALL_DOC},
  '.uno:InsertTable': {formats: PPT_DOCX, args: {Columns: {type: 'long', min: 1, max: 8}, Rows: {type: 'long', min: 1, max: 8}}},
  '.uno:InsertGraphic': {internal: true, formats: ALL_DOC, args: {FileName: {type: 'string', max: 1024}}}, // [excel] also Calc
  '.uno:FormatGroup': {formats: OOXML_FORMATS}, '.uno:FormatUngroup': {formats: OOXML_FORMATS},
  '.uno:BringToFront': {formats: OOXML_FORMATS}, '.uno:SendToBack': {formats: OOXML_FORMATS},
  '.uno:Forward': {formats: OOXML_FORMATS}, '.uno:Backward': {formats: OOXML_FORMATS},
  '.uno:InsertPage': {formats: OOXML_FORMATS},
  '.uno:AttributePageSize': {formats: OOXML_FORMATS, args: {'AttributePageSize.Width': {type: 'long', min: 2000, max: 99000}, 'AttributePageSize.Height': {type: 'long', min: 2000, max: 99000}}},
  // ---- [docx] Writer commands verified against the document engine; dialog-only commands are intentionally absent.
  '.uno:StyleApply': dx({args: {Style: {type: 'string', max: 40, pattern: /^(Standard|Title|Subtitle|Heading [1-6])$/}, FamilyName: {type: 'string', max: 20, pattern: /^ParagraphStyles$/}}}),
  '.uno:UnderlineDouble': dx(), '.uno:ParaspaceIncrease': dx(), '.uno:ParaspaceDecrease': dx(),
  '.uno:InsertPagebreak': dx(), '.uno:InsertColumnBreak': dx(), '.uno:InsertFootnote': dx(), '.uno:InsertEndnote': dx(),
  '.uno:InsertPageNumberField': dx(), '.uno:InsertPageCountField': dx(), '.uno:BrowseView': dx(),
  '.uno:InsertAnnotation': dx({args: {Text: {type: 'string', max: 2000}}}),
  '.uno:InsertBookmark': dx({args: {Bookmark: {type: 'string', max: 60, pattern: /^[\p{L}\p{N}_-]+$/u}}}),
  // .uno:SetHyperlink stays blocked: saved documents must not carry external relationships (see runtime/documents.mjs openPackage).
  '.uno:InsertPageHeader': dx({args: {PageStyle: {type: 'string', max: 40, pattern: /^Default Page Style$/}, On: bool}}),
  '.uno:InsertPageFooter': dx({args: {PageStyle: {type: 'string', max: 40, pattern: /^Default Page Style$/}, On: bool}}),
  // ---- [excel] Calc (xlsx) commands verified against LibreOfficeKit; dialog-only commands are intentionally absent.
  '.uno:AlignLeft': xl(), '.uno:AlignHorizontalCenter': xl(), '.uno:AlignRight': xl(), '.uno:AlignBlock': xl(),
  '.uno:AlignTop': xl(), '.uno:AlignVCenter': xl(), '.uno:AlignBottom': xl(),
  '.uno:WrapText': xl(), '.uno:ToggleMergeCells': xl(), '.uno:MergeCells': xl(), '.uno:SplitCell': xl(),
  '.uno:NumberFormatStandard': xl(), '.uno:NumberFormatDecimal': xl(), '.uno:NumberFormatPercent': xl(), '.uno:NumberFormatCurrency': xl(),
  '.uno:NumberFormatDate': xl(), '.uno:NumberFormatTime': xl(), '.uno:NumberFormatScientific': xl(), '.uno:NumberFormatThousands': xl(),
  '.uno:NumberFormatIncDecimals': xl(), '.uno:NumberFormatDecDecimals': xl(),
  '.uno:BackgroundColor': xl({args: {BackgroundColor: COLOR_OR_AUTO}}),
  '.uno:InsertRowsBefore': xl(), '.uno:InsertRowsAfter': xl(), '.uno:InsertColumnsBefore': xl(), '.uno:InsertColumnsAfter': xl(),
  '.uno:DeleteRows': xl(), '.uno:DeleteColumns': xl(),
  '.uno:InsertCell': xl({args: {Flags: {type: 'string', max: 1, pattern: /^[>V]$/}}}),
  '.uno:DeleteCell': xl({args: {Flags: {type: 'string', max: 1, pattern: /^[UL]$/}}}),
  // LibreOfficeKit Calc freezes through these (state '.uno:FreezePanesRow' = 'tab / index'); Index = frozen rows/columns, 0 = none.
  '.uno:FreezePanesRow': xl({args: {Index: {type: 'long', min: 0, max: 1048576}}}), '.uno:FreezePanesColumn': xl({args: {Index: {type: 'long', min: 0, max: 16384}}}),
  '.uno:DataFilterAutoFilter': xl(), '.uno:SortAscending': xl(), '.uno:SortDescending': xl(), '.uno:AutoSum': xl(),
  '.uno:Group': xl({args: {RowOrCol: {type: 'string', max: 1, pattern: /^[RC]$/}}}),
  '.uno:Ungroup': xl({args: {RowOrCol: {type: 'string', max: 1, pattern: /^[RC]$/}}}),
  '.uno:Copy': {formats: XLSX_DOCX}, '.uno:Cut': {formats: XLSX_DOCX}, '.uno:Paste': {formats: XLSX_DOCX},
  '.uno:ExecuteSearch': ({formats: XLSX_DOCX, args: {'SearchItem.SearchString': {type: 'string', max: 200}, 'SearchItem.Backward': bool, 'SearchItem.Command': {type: 'long', min: 0, max: 0}}}),
  // [excel] shape gallery (drawn by dragging on the canvas)
  '.uno:BasicShapes.circle': {formats: ALL_DOC}, '.uno:BasicShapes.isosceles-triangle': {formats: ALL_DOC}, '.uno:BasicShapes.right-triangle': {formats: ALL_DOC}, '.uno:BasicShapes.parallelogram': {formats: ALL_DOC}, '.uno:BasicShapes.trapezoid': {formats: ALL_DOC}, '.uno:BasicShapes.diamond': {formats: ALL_DOC}, '.uno:BasicShapes.pentagon': {formats: ALL_DOC}, '.uno:BasicShapes.hexagon': {formats: ALL_DOC}, '.uno:BasicShapes.octagon': {formats: ALL_DOC}, '.uno:BasicShapes.ring': {formats: ALL_DOC}, '.uno:BasicShapes.can': {formats: ALL_DOC}, '.uno:BasicShapes.cube': {formats: ALL_DOC}, '.uno:BasicShapes.frame': {formats: ALL_DOC}, '.uno:BasicShapes.cross': {formats: ALL_DOC}, '.uno:SymbolShapes.smiley': {formats: ALL_DOC}, '.uno:SymbolShapes.heart': {formats: ALL_DOC}, '.uno:SymbolShapes.lightning': {formats: ALL_DOC}, '.uno:SymbolShapes.sun': {formats: ALL_DOC}, '.uno:SymbolShapes.moon': {formats: ALL_DOC}, '.uno:SymbolShapes.cloud': {formats: ALL_DOC}, '.uno:SymbolShapes.brace-pair': {formats: ALL_DOC}, '.uno:SymbolShapes.bracket-pair': {formats: ALL_DOC}, '.uno:StarShapes.star5': {formats: ALL_DOC}, '.uno:ArrowShapes.right-arrow': {formats: ALL_DOC}, '.uno:ArrowShapes.left-arrow': {formats: ALL_DOC}, '.uno:ArrowShapes.up-arrow': {formats: ALL_DOC}, '.uno:ArrowShapes.down-arrow': {formats: ALL_DOC}, '.uno:ArrowShapes.left-right-arrow': {formats: ALL_DOC}, '.uno:ArrowShapes.up-down-arrow': {formats: ALL_DOC}, '.uno:ArrowShapes.4-way-arrow': {formats: ALL_DOC}, '.uno:ArrowShapes.chevron': {formats: ALL_DOC}, '.uno:ArrowShapes.pentagon-right': {formats: ALL_DOC},
  '.uno:Calculate': xl(),
});
/** Commands handled by the pre-existing `command` operation (kept as-is, they carry history checks). */
export const LEGACY_COMMANDS = Object.freeze(['.uno:Undo', '.uno:Redo', '.uno:Bold', '.uno:Italic', '.uno:Underline']);
const NAME = /^\.uno:[A-Za-z][A-Za-z0-9.\-]{0,63}$/;

function checkValue(key, spec, v) {
  if (spec.type === 'boolean') { if (typeof v !== 'boolean') throw Error('参数类型无效：' + key); return v; }
  if (spec.type === 'string') {
    if (typeof v !== 'string' || !v || v.length > spec.max || /[\0-\x1f]/.test(v) || (spec.pattern && !spec.pattern.test(v))) throw Error('参数无效：' + key);
    return v;
  }
  if (typeof v !== 'number' || !Number.isFinite(v) || v < spec.min || v > spec.max) throw Error('参数超出范围：' + key);
  if (spec.type === 'long') { if (!Number.isInteger(v)) throw Error('参数须为整数：' + key); return v; }
  return v;
}
/** Validates a command and returns {command, args} where args is the LibreOfficeKit typed JSON object or null. */
export function validateUno(command, args, {format, allowInternal = false} = {}) {
  if (typeof command !== 'string' || !NAME.test(command) || !Object.hasOwn(UNO_COMMANDS, command)) throw Error('不支持的UNO命令');
  const def = UNO_COMMANDS[command];
  if (def.internal && !allowInternal) throw Error('该UNO命令仅限内部使用');
  if (def.formats && format && !def.formats.includes(format)) throw Error('该命令不适用于当前文档类型');
  const spec = def.args || {};
  if (args === undefined || args === null) args = {};
  if (typeof args !== 'object' || Array.isArray(args)) throw Error('参数必须是对象');
  for (const k of Object.keys(args)) if (!Object.hasOwn(spec, k)) throw Error('不允许的参数：' + k);
  const out = {};
  for (const [k, s] of Object.entries(spec)) {
    if (!Object.hasOwn(args, k)) throw Error('缺少参数：' + k);
    out[k] = {type: s.type, value: checkValue(k, s, args[k])};
  }
  return {command, args: Object.keys(out).length ? out : null};
}
/** '#RRGGBB' -> integer for UNO long colour arguments. */
export function colorToLong(hex) {
  if (typeof hex !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(hex)) throw Error('颜色格式无效');
  return parseInt(hex.slice(1), 16);
}

// ---- STATE_CHANGED mapping -------------------------------------------------
const BOOL_STATES = {
  '.uno:Bold': 'bold', '.uno:Italic': 'italic', '.uno:Underline': 'underline', '.uno:Strikeout': 'strikeout',
  '.uno:SuperScript': 'superscript', '.uno:SubScript': 'subscript',
  '.uno:LeftPara': 'left', '.uno:CenterPara': 'center', '.uno:RightPara': 'right', '.uno:JustifyPara': 'justify',
  '.uno:DefaultBullet': 'bullet', '.uno:DefaultNumbering': 'numbering',
};
/** Parses a LOK STATE_CHANGED payload such as ".uno:Bold=true" or ".uno:FontHeight=18". */
export function parseStatePayload(payload) {
  if (typeof payload !== 'string') return null;
  const i = payload.indexOf('=');
  if (i < 0) return null;
  const name = payload.slice(0, i), value = payload.slice(i + 1);
  return NAME.test(name) ? {name, value} : null;
}
/** UNO commands whose 'enabled'/'disabled' state is forwarded to ribbon item ids. */
export const ENABLE_STATES = Object.freeze({
  '.uno:FormatGroup': ['group-group'], '.uno:FormatUngroup': ['group-ungroup'],
  '.uno:BringToFront': ['arrange-front'], '.uno:SendToBack': ['arrange-back'],
  '.uno:Forward': ['arrange-forward'], '.uno:Backward': ['arrange-backward'],
  '.uno:InsertPage': ['ins-blank-page'],
});
/** Maps the worker `states` dictionary ({'.uno:Bold': 'true', ...}) to UI state. */
export function mapUnoStates(states = {}) {
  const out = {checked: {}, enabled: {}, font: '', size: '', object: false};
  if (!states || typeof states !== 'object') return out;
  for (const [cmd, ids] of Object.entries(ENABLE_STATES)) {
    const v = states[cmd];
    if (v === 'enabled' || v === 'disabled') for (const id of ids) out.enabled[id] = v === 'enabled';
  }
  // BringToFront is only enabled while a drawing object (shape, table, image, group) is selected.
  out.object = states['.uno:BringToFront'] === 'enabled';
  for (const [cmd, key] of Object.entries(BOOL_STATES)) {
    const v = states[cmd];
    if (v !== undefined) out.checked[key] = v === 'true';
  }
  if (typeof states['.uno:CharFontName'] === 'string') out.font = displayFontName(states['.uno:CharFontName']); // [ux7]
  const h = parseFloat(states['.uno:FontHeight']);
  if (Number.isFinite(h) && h > 0) out.size = String(Number.isInteger(h) ? h : Math.round(h * 10) / 10);
  return out;
}

// [ux7] The engine reports metric-compatible substitutes for fonts it does not ship; show the name the user knows.
export const FONT_DISPLAY = Object.freeze({'Liberation Sans': 'Arial', 'Liberation Serif': 'Times New Roman', 'Liberation Mono': 'Courier New',
  'Liberation Sans Narrow': 'Arial Narrow', Carlito: 'Calibri', Caladea: 'Cambria', 'DejaVu Sans': 'Verdana'});
export const displayFontName = name => { const n = String(name || '').slice(0, 80); return FONT_DISPLAY[n] || n; };
