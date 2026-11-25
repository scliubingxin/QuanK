/** @typedef {'writer'|'impress'|'calc'} OfficeKind */
/** @typedef {{x:number, y:number, w:number, h:number}} OfficeRect */
/** @typedef {{rowHeight:number, protectedTop:number}} OfficeCellLayout Viewport-local CSS pixels. protectedTop is the bottom of column headings and visible first/frozen rows. */
/** @typedef {{kind:'none'|'text'|'cell'|'graphic', text:string, rects:OfficeRect[], anchor?:unknown, token:string, cellLayout?:OfficeCellLayout}} OfficeSelection */
/** @typedef {{text:string, before:string[], after:string[], style:string, token:string}} OfficeSelectionContext */
/** @typedef {{enabled:boolean, checked:boolean, value:string|number|null}} OfficeCommandState */
/** @typedef {{id:string, before:string, after:string}} OfficeChangeset */
/** @typedef {{ok:true, changeId:string|null, changeset:OfficeChangeset|null}|{ok:false, reason:'selection_changed'}} OfficeReplaceResult */
/** @typedef {'state'|'selection'|'saving'|'saved'|'unsaved'|'conflict'|'dirty'|'error'|'changes'} OfficeEvent */
/**
 * @typedef {object} OfficeSession
 * @property {string} docId
 * @property {OfficeKind} kind
 * @property {boolean} readOnly
 * @property {Map<string, OfficeCommandState>} state
 * @property {OfficeSelection} selection
 * @property {(cmd:string, args?:object) => Promise<unknown>} uno
 * @property {(options:{context:number}) => Promise<OfficeSelectionContext>} getSelection
 * @property {(text:string, options:{track:boolean, token:string}) => Promise<OfficeReplaceResult>} replaceSelection
 * @property {(on:boolean) => Promise<unknown>} setTrackChanges
 * @property {() => Promise<unknown>} acceptAll
 * @property {() => Promise<unknown>} rejectAll
 * @property {(id:string) => Promise<unknown>} acceptChange
 * @property {(id:string) => Promise<unknown>} rejectChange
 * @property {() => Promise<unknown>} undo
 * @property {() => Promise<unknown>} redo
 * @property {(options:{reason:'auto'|'manual', mode?:'file'|'snapshot'}) => Promise<unknown>} save
 * @property {(event:OfficeEvent, fn:Function) => function():void} on
 * @property {(event:OfficeEvent, fn:Function) => void} off
 * @property {(rect:OfficeRect) => OfficeRect} toScreen Converts document twips to tab-local CSS pixels.
 */

export const OFFICE_KINDS = Object.freeze(['writer', 'impress', 'calc']);

export const UNO = Object.freeze({
  Bold: '.uno:Bold',
  Italic: '.uno:Italic',
  Underline: '.uno:Underline',
  Strikeout: '.uno:Strikeout',
  Color: '.uno:Color',
  CharBackColor: '.uno:CharBackColor',
  FontHeight: '.uno:FontHeight',
  CharFontName: '.uno:CharFontName',
  StyleApply: '.uno:StyleApply',
  DefaultBullet: '.uno:DefaultBullet',
  DefaultNumbering: '.uno:DefaultNumbering',
  LeftPara: '.uno:LeftPara',
  CenterPara: '.uno:CenterPara',
  RightPara: '.uno:RightPara',
  JustifyPara: '.uno:JustifyPara',
  ResetAttributes: '.uno:ResetAttributes',
  Undo: '.uno:Undo',
  Redo: '.uno:Redo',
  InsertTable: '.uno:InsertTable',
  InsertGraphic: '.uno:InsertGraphic',
  InsertObjectChart: '.uno:InsertObjectChart',
  InsertAnnotation: '.uno:InsertAnnotation',
  TrackChanges: '.uno:TrackChanges',
  Zoom: '.uno:Zoom',
  InsertPage: '.uno:InsertPage',
  AssignLayout: '.uno:AssignLayout',
  ToggleMergeCells: '.uno:ToggleMergeCells',
  NumberFormatStandard: '.uno:NumberFormatStandard',
  SetBorderStyle: '.uno:SetBorderStyle',
  BackgroundColor: '.uno:BackgroundColor',
  NumberFormatDecimal: '.uno:NumberFormatDecimal',
  NumberFormatDate: '.uno:NumberFormatDate',
  NumberFormatIncDecimals: '.uno:NumberFormatIncDecimals',
  NumberFormatDecDecimals: '.uno:NumberFormatDecDecimals',
  NumberFormatPercent: '.uno:NumberFormatPercent',
  NumberFormatCurrency: '.uno:NumberFormatCurrency',
});
