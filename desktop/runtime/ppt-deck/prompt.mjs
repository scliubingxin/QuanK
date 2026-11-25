// PPT 生成提示词：先大纲 → 再逐页选版式 → 填充槽位。供 document_create 工具说明与 skill 注入使用。
import { LAYOUTS } from './schema.mjs';
export const LAYOUT_GUIDE = `
可用 layout 与槽位（所有页可带 notes 演讲备注；内容页可带 section 章节编号如"2.4"、title、subtitle）：
- cover {title,subtitle,meta}  封面，第 1 页
- toc {title,items:[{title,desc}] 2–8}  目录
- section {title,subtitle}  章节过渡页（编号自动生成）
- cards {cards:[{title,body}] 2–4, takeaway}  并列观点卡片（2/3/4 列）
- image-text {points:[≤5条], imageId?, caption}  左文右图；无图则留占位。imageId 只能用本轮附加图片
- compare-table {table:[[表头..],[行..]] 列2–5(首列为维度), highlightCol?, takeaway}  对比表，长表自动续页
- process {steps:[{title,body}] 3–6, takeaway}  横向流程/步骤
- timeline {events:[{date,title,body}] 3–8}  时间线
- kpi {kpis:[{value,label,note}] 2–4, points:[≤3条解读]}  关键数字
- architecture {layers:[{name,items:[模块]}] 2–5, takeaway}  分层架构图
- matrix {axes:{x,y}, quadrants:[{title,body}×4], takeaway}  四象限（左上、右上、左下、右下）
- summary {points:[{title,body}|字符串] ≤5, takeaway}  总结/结论
- closing {title,subtitle,contact}  封底`;
export const PPT_DECK_PROMPT = `生成演示文稿的流程（必须遵守）：
1. 先在心里列大纲：确定受众、一句话主结论、3–5 个章节，每章 1–3 页。
2. 再逐页选择版式：内容适合对比→compare-table；有先后顺序→process；有日期→timeline；有关键数字→kpi；有层次/模块→architecture；二维归类→matrix；并列观点→cards；结论→summary。相邻页尽量不用同一版式。
3. 最后把内容填入该版式的槽位。输出 JSON：{"theme":"quank|business-blue|tech-dark|minimal-gray|warm-orange（默认 quank，即 QuankSight 品牌）","brand":{"name":"品牌名"},"slides":[{"layout":...}]}。
硬性要求：
- 首页 cover，末页 closing；超过 8 页要有 toc 与 section；每页都有明确结论式标题（≤24 字），副标题补充口径或范围。
- 禁止整页纯要点墙：每页要点/条目 ≤5 条，每条 ≤30 字，用短语而非整句长段；信息要分层（标题→结论→细节），数据优先用 kpi/compare-table/process 等可视化版式表达。
- 不要输出 Markdown 符号（-、*、#、**）。不要自己控制字号、位置、颜色，由排版引擎负责。
- 事实、数字、日期、金额不确定或来自转述时，在文字中标注"待核验"，不得编造来源；没有数据就不要造 kpi。
- 引擎会自动缩字、换行、拆分续页并生成页码；你只需控制内容量。${LAYOUT_GUIDE}`;
export const PPT_DECK_TOOL_NOTE = `【推荐的 pptx 格式】优先使用结构化版式：content 为 JSON {theme?,brand?,slides:[{layout,...槽位,notes?}]}，layout 取值 ${LAYOUTS.join('/')}。先列大纲，再逐页选版式并填槽位；每页要点≤5条、每条≤30字，禁止整页纯要点；不确定的事实标注"待核验"。槽位：cover{title,subtitle,meta} toc{items:[{title,desc}]} section{title,subtitle} cards{cards:[{title,body}]2–4,takeaway} image-text{points,imageId?,caption} compare-table{table:[[..]],highlightCol?} process{steps:[{title,body}]3–6} timeline{events:[{date,title,body}]3–8} kpi{kpis:[{value,label,note}]2–4,points?} architecture{layers:[{name,items}]2–5} matrix{axes:{x,y},quadrants:[{title,body}]×4} summary{points:[{title,body}]≤5,takeaway} closing{title,subtitle,contact}；内容页可带 section 与 subtitle。同一份文稿须全部使用 layout；使用 layout 时不可再用 bullets/chart/cards/table/layers 老字段。`;
