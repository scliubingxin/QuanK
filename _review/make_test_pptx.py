from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
p=Presentation(); p.slide_width=Inches(13.333); p.slide_height=Inches(7.5)
s=p.slides.add_slide(p.slide_layouts[6])
def tb(x,y,w,h,text,size,bold=False,font='微软雅黑',color=(0x1f,0x2d,0x3d)):
    t=s.shapes.add_textbox(Inches(x),Inches(y),Inches(w),Inches(h)); tf=t.text_frame; tf.word_wrap=True
    for i,line in enumerate(text.split('\n')):
        para=tf.paragraphs[0] if i==0 else tf.add_paragraph()
        r=para.add_run(); r.text=line; r.font.size=Pt(size); r.font.bold=bold; r.font.name=font; r.font.color.rgb=RGBColor(*color)
bar=s.shapes.add_shape(1,Inches(0.6),Inches(0.5),Inches(0.25),Inches(0.8)); bar.fill.solid(); bar.fill.fore_color.rgb=RGBColor(0x15,0x3c,0xc8); bar.line.fill.background()
tb(1.0,0.45,11,0.9,'通威近期并购案分析：战略逻辑与定价口径',32,True)
tb(0.6,1.5,12.1,2.2,'核心标的：发行股份及支付现金收购青海丽豪清能 100% 股权，交易完成后将进一步强化上游硅料与下游组件的协同。\n一句话结论：战略逻辑自洽、周期窗口合理；但定价口径有分歧，部分关键信息仍为空白，落地确定性远未到既成事实。\n本版口径：所有金额、日期、股价均为媒体转述或抓取快照，已区分「可确认」「有分歧」「无信息」三档。',18,font='Calibri')
rows=[('维度','WorkBuddy｜员工端','WillAgent｜企业平台'),('面向用户','业务人员直接发起办公任务','开发与运营团队构建专业 Agent'),('任务上下文','当前文件、附件与应用连接','企业知识、业务规则与工具编排'),('知识与数据','获取用户授权的材料与服务','治理知识库，按权限查询业务数据')]
tbl=s.shapes.add_table(4,3,Inches(0.6),Inches(4.0),Inches(9.4),Inches(2.4)).table
for i,r in enumerate(rows):
    for j,c in enumerate(r):
        cell=tbl.cell(i,j); cell.text=c; cell.text_frame.paragraphs[0].runs[0].font.size=Pt(14); cell.text_frame.paragraphs[0].runs[0].font.name='微软雅黑'
for k,col in enumerate([(0x15,0x3c,0xc8),(0x14,0x84,0xc0),(0xdc,0x3a,0x22),(0xe8,0x6a,0x0a)]):
    sh=s.shapes.add_shape(1,Inches(10.5),Inches(3.9+k*0.8),Inches(2.2),Inches(0.65)); sh.fill.solid(); sh.fill.fore_color.rgb=RGBColor(*col); sh.line.fill.background()
p.save('test16x9.pptx')
