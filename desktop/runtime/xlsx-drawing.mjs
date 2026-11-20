// [ux9] Native Excel charts and pictures for document_create xlsx.
// sheet.charts: [{type, title, range:"A1:C13"} | {type, title, categories:"A2:A13", series:[{name, values:"B2:B13"}]}, anchor?, cols?, rows?]
// sheet.images: [{imageId, anchor?, width?}] — only this turn's local PNG attachments (same policy as PPT).
// Output is plain DrawingML (xl/drawings, xl/charts) that Excel, WPS and the built-in engine open as real, data-linked charts.
export const CHART_TYPES = ['column', 'bar', 'line', 'area', 'pie', 'doughnut', 'scatter'];
export const MAX_CHARTS = 8, MAX_IMAGES = 8;
const PALETTE = ['0078CB', 'F59E0B', '10B981', 'EF4444', '8B5CF6', '06B6D4', 'EC4899', '84CC16'];
const NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart', NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main',
  NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', NS_X = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',
  NS_PR = 'http://schemas.openxmlformats.org/package/2006/relationships', REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const xml = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]) /* ' stays literal: Excel writes sheet refs as 'Name'!A1; all attributes use double quotes */.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const fail = m => { throw Error(m); };
const colName = n => n < 26 ? String.fromCharCode(65 + n) : colName(Math.floor(n / 26) - 1) + colName(n % 26);
const colIndex = s => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

export function parseCell(ref) {
  const m = /^\$?([A-Z]{1,3})\$?([1-9]\d{0,6})$/.exec(String(ref || '').trim().toUpperCase());
  if (!m) fail(`单元格地址无效：${String(ref).slice(0, 20)}`);
  return {c: colIndex(m[1]), r: Number(m[2]) - 1};
}
export function parseRange(ref) {
  const s = String(ref || '').trim();
  if (s.includes('!')) fail('图表区域只能引用本工作表（不要写工作表名）');
  const [a, b = a] = s.split(':');
  const p = parseCell(a), q = parseCell(b);
  return {c1: Math.min(p.c, q.c), r1: Math.min(p.r, q.r), c2: Math.max(p.c, q.c), r2: Math.max(p.r, q.r)};
}
const isLine = g => g.c1 === g.c2 || g.r1 === g.r2;
const cellsOf = g => { const out = []; for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) out.push({r, c}); return out; };
const refOf = (sheet, g) => `'${sheet.replace(/'/g, "''")}'!$${colName(g.c1)}$${g.r1 + 1}${g.c1 === g.c2 && g.r1 === g.r2 ? '' : `:$${colName(g.c2)}$${g.r2 + 1}`}`;
const value = (rows, {r, c}) => rows[r]?.[c];
const num = v => typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'boolean' ? Number(v) : v && typeof v === 'object' && typeof v.value === 'number' ? v.value : typeof v === 'string' && v.trim() && Number.isFinite(Number(v.replace(/,/g, ''))) ? Number(v.replace(/,/g, '')) : null;
const str = v => v === null || v === undefined ? '' : typeof v === 'object' ? String(v.value ?? '') : String(v);

/** Expand {range} into categories + series using the header row and first column. */
function resolveChart(ch, rows, sheetName) {
  const type = ch.type === undefined ? 'column' : ch.type;
  if (!CHART_TYPES.includes(type)) fail(`图表类型只支持 ${CHART_TYPES.join(' / ')}`);
  let categories, series;
  if (ch.range !== undefined) {
    if (ch.series !== undefined || ch.categories !== undefined) fail('图表请只用 range，或只用 categories + series');
    const g = parseRange(ch.range);
    if (g.c2 - g.c1 < 1 || g.r2 - g.r1 < 1) fail('range 至少两列两行：首行是系列名，首列是分类');
    categories = {c1: g.c1, c2: g.c1, r1: g.r1 + 1, r2: g.r2};
    series = [];
    for (let c = g.c1 + 1; c <= g.c2; c++) series.push({nameCell: {r: g.r1, c}, values: {c1: c, c2: c, r1: g.r1 + 1, r2: g.r2}});
  } else {
    if (!Array.isArray(ch.series) || !ch.series.length) fail('图表需要 range，或 categories + series');
    categories = ch.categories !== undefined ? parseRange(ch.categories) : null;
    series = ch.series.map(s => {
      if (!s || typeof s !== 'object') fail('series 格式无效');
      const v = parseRange(s.values);
      const name = s.name === undefined ? '' : String(s.name);
      if (name.length > 80) fail('系列名称过长');
      const nameCell = /^\$?[A-Za-z]{1,3}\$?\d+$/.test(name.trim()) ? parseCell(name) : null;
      return {name: nameCell ? '' : name, nameCell, values: v, color: s.color};
    });
  }
  if (series.length > 8) fail('每张图表最多 8 个系列');
  for (const s of series) {
    if (!isLine(s.values)) fail('每个系列的数值必须是一行或一列');
    if (cellsOf(s.values).length > 1000) fail('每个系列最多 1000 个数据点');
  }
  if (categories && !isLine(categories)) fail('分类必须是一行或一列');
  const n = cellsOf(series[0].values).length;
  if (categories && cellsOf(categories).length !== n) fail('分类数量与数值数量不一致');
  if (series.some(s => cellsOf(s.values).length !== n)) fail('各系列的数据点数量必须相同');
  if (['pie', 'doughnut'].includes(type) && series.length > 1) series = series.slice(0, 1);
  if (type === 'scatter' && !categories) fail('散点图需要 categories 作为 X 轴数值');
  const numeric = series.flatMap(s => cellsOf(s.values).map(p => num(value(rows, p)))).filter(v => v !== null);
  const hasFormula = series.some(s => cellsOf(s.values).some(p => value(rows, p) && typeof value(rows, p) === 'object'));
  if (!numeric.length && !hasFormula) fail('图表引用的单元格里没有数字');
  const title = ch.title === undefined ? '' : String(ch.title);
  if (title.length > 100) fail('图表标题过长');
  const anchor = ch.anchor === undefined ? null : parseCell(ch.anchor);
  const cols = ch.cols === undefined ? 8 : ch.cols, rowsSpan = ch.rows === undefined ? 16 : ch.rows;
  if (![cols, rowsSpan].every(x => Number.isInteger(x) && x >= 3 && x <= 40)) fail('图表 cols / rows 需要 3–40 的整数');
  for (const s of series) if (s.color !== undefined && !/^#?[0-9a-f]{6}$/i.test(String(s.color))) fail('系列颜色需要 #RRGGBB');
  return {type, title, categories, series, anchor, cols, rows: rowsSpan, sheetName, legend: ch.legend !== false, labels: ch.dataLabels === true};
}

export function validateSheetDrawings(sheet, {imageIds = null} = {}) {
  const out = {charts: [], images: []};
  if (sheet.charts !== undefined) {
    if (!Array.isArray(sheet.charts) || sheet.charts.length > MAX_CHARTS) fail(`每个工作表最多 ${MAX_CHARTS} 张图表`);
    out.charts = sheet.charts.map(ch => { if (!ch || typeof ch !== 'object' || Array.isArray(ch)) fail('图表格式无效'); return resolveChart(ch, sheet.rows, sheet.name); });
  }
  if (sheet.images !== undefined) {
    if (!Array.isArray(sheet.images) || sheet.images.length > MAX_IMAGES) fail(`每个工作表最多 ${MAX_IMAGES} 张图片`);
    out.images = sheet.images.map(im => {
      if (!im || typeof im !== 'object' || typeof im.imageId !== 'string' || !/^[\w-]{1,80}$/.test(im.imageId)) fail('图片需要本轮图片 imageId');
      if (imageIds && !imageIds.has(im.imageId)) fail('只能使用本轮附加的本机图片');
      const width = im.width === undefined ? null : im.width;
      if (width !== null && !(Number.isInteger(width) && width >= 40 && width <= 1600)) fail('图片 width 需要 40–1600 像素');
      return {imageId: im.imageId, anchor: im.anchor === undefined ? null : parseCell(im.anchor), width};
    });
  }
  return out;
}
export const xlsxImageIds = spec => [...new Set((spec.sheets || []).flatMap(s => Array.isArray(s.images) ? s.images.map(i => i?.imageId).filter(x => typeof x === 'string') : []))];

// ---------- chart XML ----------
const strCache = (rows, g) => { const ps = cellsOf(g); return `<c:strCache><c:ptCount val="${ps.length}"/>${ps.map((p, i) => `<c:pt idx="${i}"><c:v>${xml(str(value(rows, p)))}</c:v></c:pt>`).join('')}</c:strCache>`; };
const numCache = (rows, g) => { const ps = cellsOf(g); return `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${ps.length}"/>${ps.map((p, i) => { const v = num(value(rows, p)); return v === null ? '' : `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`; }).join('')}</c:numCache>`; };
const fill = hex => `<a:solidFill><a:srgbClr val="${hex.replace('#', '').toUpperCase()}"/></a:solidFill>`;
const rich = (text, sz = 1400, b = 1) => `<c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${b}"/></a:pPr><a:r><a:rPr lang="zh-CN" sz="${sz}" b="${b}"/><a:t>${xml(text)}</a:t></a:r></a:p></c:rich>`;
const txPr = sz => `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}"><a:solidFill><a:srgbClr val="595959"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="zh-CN"/></a:p></c:txPr>`;

export function chartXml(ch, rows) {
  const {type, series, categories, sheetName: sn} = ch, pie = type === 'pie' || type === 'doughnut', scatter = type === 'scatter';
  const ser = series.map((s, i) => {
    const color = s.color ? String(s.color).replace('#', '') : PALETTE[i % PALETTE.length];
    const tx = s.nameCell ? `<c:tx><c:strRef><c:f>${xml(refOf(sn, {c1: s.nameCell.c, c2: s.nameCell.c, r1: s.nameCell.r, r2: s.nameCell.r}))}</c:f>${strCache(rows, {c1: s.nameCell.c, c2: s.nameCell.c, r1: s.nameCell.r, r2: s.nameCell.r})}</c:strRef></c:tx>`
      : `<c:tx><c:v>${xml(s.name || `系列${i + 1}`)}</c:v></c:tx>`;
    const sp = scatter ? '<c:spPr><a:ln w="28575"><a:noFill/></a:ln></c:spPr>' : type === 'line' ? `<c:spPr><a:ln w="28575" cap="rnd">${fill(color)}<a:round/></a:ln></c:spPr>` : pie ? '' : `<c:spPr>${fill(color)}</c:spPr>`;
    const marker = type === 'line' ? `<c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr>${fill(color)}</c:spPr></c:marker>` : scatter ? `<c:marker><c:symbol val="circle"/><c:size val="7"/><c:spPr>${fill(color)}</c:spPr></c:marker>` : '';
    const dpt = pie ? cellsOf(s.values).map((_, k) => `<c:dPt><c:idx val="${k}"/><c:bubble3D val="0"/><c:spPr>${fill(PALETTE[k % PALETTE.length])}<a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>`).join('') : '';
    const lbls = ch.labels || pie ? `<c:dLbls>${txPr(900)}<c:showLegendKey val="0"/><c:showVal val="${ch.labels ? 1 : 0}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${pie ? 1 : 0}"/><c:showBubbleSize val="0"/></c:dLbls>` : '';
    const cat = categories ? (scatter ? `<c:xVal><c:numRef><c:f>${xml(refOf(sn, categories))}</c:f>${numCache(rows, categories)}</c:numRef></c:xVal>` : `<c:cat><c:strRef><c:f>${xml(refOf(sn, categories))}</c:f>${strCache(rows, categories)}</c:strRef></c:cat>`) : '';
    const val = `<c:${scatter ? 'yVal' : 'val'}><c:numRef><c:f>${xml(refOf(sn, s.values))}</c:f>${numCache(rows, s.values)}</c:numRef></c:${scatter ? 'yVal' : 'val'}>`;
    const inv = type === 'column' || type === 'bar' ? '<c:invertIfNegative val="0"/>' : '';
    const tail = type === 'line' || scatter ? '<c:smooth val="0"/>' : '';
    return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${tx}${sp}${inv}${marker}${dpt}${lbls}${cat}${val}${tail}</c:ser>`;
  }).join('');
  const ax = '<c:axId val="50010001"/><c:axId val="50010002"/>';
  const plot = type === 'column' || type === 'bar' ? `<c:barChart><c:barDir val="${type === 'bar' ? 'bar' : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${ser}<c:gapWidth val="80"/><c:overlap val="-10"/>${ax}</c:barChart>`
    : type === 'line' ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${ser}<c:marker val="1"/>${ax}</c:lineChart>`
    : type === 'area' ? `<c:areaChart><c:grouping val="standard"/><c:varyColors val="0"/>${ser}${ax}</c:areaChart>`
    : type === 'pie' ? `<c:pieChart><c:varyColors val="1"/>${ser}<c:firstSliceAng val="0"/></c:pieChart>`
    : type === 'doughnut' ? `<c:doughnutChart><c:varyColors val="1"/>${ser}<c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart>`
    : `<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${ser}${ax}</c:scatterChart>`;
  const grid = '<c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="E5E7EB"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>';
  const axLine = '<c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="BFBFBF"/></a:solidFill></a:ln></c:spPr>';
  const catPos = type === 'bar' ? 'l' : 'b', valPos = type === 'bar' ? 'b' : 'l';
  const axes = pie ? '' : scatter
    ? `<c:valAx><c:axId val="50010001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${axLine}${txPr(900)}<c:crossAx val="50010002"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx><c:valAx><c:axId val="50010002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>${grid}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${txPr(900)}<c:crossAx val="50010001"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>`
    : `<c:catAx><c:axId val="50010001"/><c:scaling><c:orientation val="${type === 'bar' ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${catPos}"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${axLine}${txPr(900)}<c:crossAx val="50010002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx><c:valAx><c:axId val="50010002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${valPos}"/>${grid}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${txPr(900)}<c:crossAx val="50010001"/><c:crosses val="${type === 'bar' ? 'max' : 'autoZero'}"/><c:crossBetween val="between"/></c:valAx>`;
  const title = ch.title ? `<c:title><c:tx>${rich(ch.title)}</c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>` : '<c:autoTitleDeleted val="1"/>';
  const legend = ch.legend && (series.length > 1 || pie) ? `<c:legend><c:legendPos val="b"/><c:overlay val="0"/>${txPr(900)}</c:legend>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_R}"><c:date1904 val="0"/><c:lang val="zh-CN"/><c:roundedCorners val="0"/><c:chart>${title}<c:plotArea><c:layout/>${plot}${axes}</c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr>${fill('FFFFFF')}<a:ln w="9525"><a:solidFill><a:srgbClr val="E5E7EB"/></a:solidFill></a:ln></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr><a:latin typeface="Microsoft YaHei"/><a:ea typeface="Microsoft YaHei"/></a:defRPr></a:pPr><a:endParaRPr lang="zh-CN"/></a:p></c:txPr></c:chartSpace>`;
}

const EMU = 9525, ROW_PX = 20;
const asText = v => typeof v === 'string' ? v : new TextDecoder().decode(v);
const marker = (tag, c, r) => `<xdr:${tag}><xdr:col>${c}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:${tag}>`;

/**
 * Mutates the string map `files` produced by the spreadsheet writer: adds drawings, charts, media, rels and content types.
 * images: {id: {base64, width, height}} (validated PNGs).
 */
export function addXlsxDrawings(files, spec, images = {}) {
  let chartNo = 0, imageNo = 0, drawingNo = 0;
  const overrides = [];
  spec.sheets.forEach((sheet, si) => {
    const {charts, images: pics} = validateSheetDrawings(sheet);
    if (!charts.length && !pics.length) return;
    drawingNo++;
    const rels = [], anchors = [];
    const width = Math.max(1, ...sheet.rows.map(r => r.length));
    let nextRow = 0, id = 1;
    const place = (a, rowsNeeded) => { if (a) return a; const at = {c: width + 1, r: nextRow}; nextRow += rowsNeeded + 1; return at; };
    charts.forEach((ch, k) => {
      chartNo++;
      const rid = `rId${rels.length + 1}`, at = place(ch.anchor, ch.rows);
      files[`xl/charts/chart${chartNo}.xml`] = chartXml(ch, sheet.rows);
      overrides.push(`<Override PartName="/xl/charts/chart${chartNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
      rels.push(`<Relationship Id="${rid}" Type="${REL}/chart" Target="../charts/chart${chartNo}.xml"/>`);
      anchors.push(`<xdr:twoCellAnchor editAs="oneCell">${marker('from', at.c, at.r)}${marker('to', at.c + ch.cols, at.r + ch.rows)}<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${++id}" name="${xml(ch.title || `图表 ${k + 1}`)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${NS_C}"><c:chart xmlns:c="${NS_C}" r:id="${rid}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`);
    });
    pics.forEach((p, k) => {
      const img = images[p.imageId];
      if (!img) fail('图片不存在或未通过校验');
      imageNo++;
      const rid = `rId${rels.length + 1}`, w = p.width || Math.min(480, img.width || 480), h = Math.max(1, Math.round(w * (img.height || w) / (img.width || w)));
      const at = place(p.anchor, Math.ceil(h / ROW_PX));
      files[`xl/media/image${imageNo}.png`] = new Uint8Array(Buffer.from(img.base64, 'base64'));
      rels.push(`<Relationship Id="${rid}" Type="${REL}/image" Target="../media/image${imageNo}.png"/>`);
      anchors.push(`<xdr:oneCellAnchor>${marker('from', at.c, at.r)}<xdr:ext cx="${w * EMU}" cy="${h * EMU}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${++id}" name="图片 ${k + 1}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w * EMU}" cy="${h * EMU}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`);
    });
    files[`xl/drawings/drawing${drawingNo}.xml`] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="${NS_X}" xmlns:a="${NS_A}" xmlns:r="${NS_R}">${anchors.join('')}</xdr:wsDr>`;
    files[`xl/drawings/_rels/drawing${drawingNo}.xml.rels`] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS_PR}">${rels.join('')}</Relationships>`;
    overrides.push(`<Override PartName="/xl/drawings/drawing${drawingNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
    const part = `xl/worksheets/sheet${si + 1}.xml`;
    files[`xl/worksheets/_rels/sheet${si + 1}.xml.rels`] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS_PR}"><Relationship Id="rIdDr1" Type="${REL}/drawing" Target="../drawings/drawing${drawingNo}.xml"/></Relationships>`;
    let ws = asText(files[part]);
    if (!ws.includes('xmlns:r=')) ws = ws.replace('<worksheet ', `<worksheet xmlns:r="${NS_R}" `);
    files[part] = ws.replace('</sheetData>', '</sheetData><drawing r:id="rIdDr1"/>');
  });
  if (!overrides.length) return 0;
  let ct = asText(files['[Content_Types].xml']);
  if (imageNo && !/Extension="png"/i.test(ct)) ct = ct.replace('<Default Extension="xml"', '<Default Extension="png" ContentType="image/png"/><Default Extension="xml"');
  files['[Content_Types].xml'] = ct.replace('</Types>', overrides.join('') + '</Types>');
  return chartNo + imageNo;
}
