#!/usr/bin/env python3
"""PPTX 自动检查：形状越界、文本溢出估算、字号下限、字体。
用法: ppt_check.py deck.pptx [--json out.json] [--min-font 11]
退出码：存在 error 时为 1。依赖 python-pptx。"""
import sys, json, re, argparse
from pptx import Presentation
from pptx.util import Emu
EMU = 914400
FONT_OK = {'Microsoft YaHei', 'PingFang SC'}
LINE_EM = 1.32
NO_START = set('，。、；：！？）》」』】〕”’,.;:!?)]}%')
def char_em(ch):
    c = ord(ch)
    if c == 32: return 0.3
    if c < 128:
        if ch.isdigit(): return 0.56
        if ch.isupper(): return 0.66
        if ch in "ilI.,;:'!|": return 0.3
        if ch in 'mwMW@%': return 0.88
        return 0.55
    if 0xff61 <= c <= 0xff9f: return 0.5
    if 0x2018 <= c <= 0x201d: return 0.5
    return 1.0
def n_lines(text, size, width_in, bold):
    cap = width_in / (size / 72); total = 0
    for para in text.split('\n'):
        toks = re.findall(r"[A-Za-z0-9][A-Za-z0-9.,%/+\-_@:'’#&]*|\s+|.", para, re.S); w = 0; lines = 1
        for tk in toks:
            if tk.isspace(): w += 0.3 if w else 0; continue
            tw = sum(char_em(c) for c in tk) * (1.06 if bold else 1) * 1.03
            if w + tw <= cap + 1e-6: w += tw
            elif w == 0: lines += int(tw // cap); w = tw % cap
            elif len(tk) == 1 and tk in NO_START: w += tw
            else: lines += 1; w = tw
        total += lines
    return total
def para_info(p, default_size=18.0):
    runs = [r for r in p.runs if r.text]
    if not runs: return None
    sz = next((r.font.size.pt for r in runs if r.font.size), None)
    bold = any(r.font.bold for r in runs)
    ls = p.line_spacing if isinstance(p.line_spacing, float) else 1.0
    return ''.join(r.text for r in runs), sz or default_size, bold, ls, p._p.pPr is not None and p._p.pPr.find('{http://schemas.openxmlformats.org/drawingml/2006/main}buChar') is not None
def text_need(tf, width_in):
    need = 0.0
    for p in tf.paragraphs:
        info = para_info(p)
        if not info: continue
        text, sz, bold, ls, bullet = info
        need += n_lines(text, sz, width_in - (0.25 if bullet else 0), bold) * sz / 72 * LINE_EM * ls
    return need
def check(path, min_font=11.0):
    prs = Presentation(path); W, H = prs.slide_width / EMU, prs.slide_height / EMU; issues = []; stats = {'slides': len(prs.slides), 'shapes': 0, 'texts': 0}
    def add(level, i, what, msg): issues.append({'level': level, 'slide': i, 'shape': what, 'msg': msg})
    for i, slide in enumerate(prs.slides, 1):
        for sh in slide.shapes:
            stats['shapes'] += 1; name = sh.name
            x, y, w, h = sh.left / EMU, sh.top / EMU, sh.width / EMU, sh.height / EMU
            if x < -0.01 or y < -0.01 or x + w > W + 0.01 or y + h > H + 0.01: add('error', i, name, f'越界 ({x:.2f},{y:.2f},{w:.2f},{h:.2f}) 页面 {W:.2f}x{H:.2f}')
            if sh.has_text_frame and sh.text_frame.text.strip():
                stats['texts'] += 1; tf = sh.text_frame
                for p in tf.paragraphs:
                    for r in p.runs:
                        if not r.text.strip(): continue
                        f = r.font.name
                        if f not in FONT_OK: add('error', i, name, f'字体 {f!r} 不在 {sorted(FONT_OK)}')
                        sz = r.font.size.pt if r.font.size else None
                        if sz is None: add('warn', i, name, '未显式设置字号')
                        elif sz < min_font - 1e-6:
                            footer = y >= 7.0; logo = y < 0.95 and x > 9.5
                            if not (footer or logo): add('error', i, name, f'字号 {sz}pt 低于下限 {min_font}pt：{r.text[:12]}')
                bp = tf._txBody.find('{http://schemas.openxmlformats.org/drawingml/2006/main}bodyPr')
                if bp is not None and bp.find('{http://schemas.openxmlformats.org/drawingml/2006/main}normAutofit') is not None: add('warn', i, name, '依赖 normAutofit 自动缩放，渲染器不一定生效（应由排版引擎保证不溢出）')
                need = text_need(tf, w - (0 if tf.margin_left is None else (tf.margin_left + tf.margin_right) / EMU))
                if need > h + 0.03: add('error', i, name, f'文本溢出估算：需要 {need:.2f}in > 框高 {h:.2f}in：{tf.text[:16]!r}')
            if sh.has_table:
                tbl = sh.table; total = 0.0
                for ri, row in enumerate(tbl.rows):
                    need_row = 0
                    for ci, cell in enumerate(row.cells):
                        cw = tbl.columns[ci].width / EMU - 0.24
                        for p in cell.text_frame.paragraphs:
                            for r in p.runs:
                                if r.font.name not in FONT_OK: add('error', i, name, f'表格字体 {r.font.name!r}')
                                if r.font.size and r.font.size.pt < min_font - 1e-6: add('error', i, name, f'表格字号 {r.font.size.pt}pt 低于下限')
                        need_row = max(need_row, text_need(cell.text_frame, cw) + 0.16)
                    if need_row > row.height / EMU + 0.03: add('error', i, name, f'表格第{ri+1}行文本可能撑高：需要 {need_row:.2f}in > 行高 {row.height/EMU:.2f}in')
                    total += max(need_row, row.height / EMU)
                if y + total > H - 0.4 + 1e-6: add('error', i, name, f'表格估算底边 {y+total:.2f}in 超出安全区')
            if sh.shape_type == 13 and (x < 0 or y < 0): add('error', i, name, '图片越界')
    errors = [m for m in issues if m['level'] == 'error']
    return {'file': path, 'stats': stats, 'errors': len(errors), 'warnings': len(issues) - len(errors), 'issues': issues}
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('pptx'); ap.add_argument('--json'); ap.add_argument('--min-font', type=float, default=11.0); a = ap.parse_args()
    r = check(a.pptx, a.min_font)
    print(f"{a.pptx}: 幻灯片 {r['stats']['slides']}，形状 {r['stats']['shapes']}，文本框 {r['stats']['texts']}；错误 {r['errors']}，警告 {r['warnings']}")
    for m in r['issues'][:60]: print(f"  [{m['level']}] 第{m['slide']}页 {m['shape']}: {m['msg']}")
    if len(r['issues']) > 60: print(f"  ... 另有 {len(r['issues'])-60} 条")
    if a.json: open(a.json, 'w', encoding='utf-8').write(json.dumps(r, ensure_ascii=False, indent=1))
    sys.exit(1 if r['errors'] else 0)
