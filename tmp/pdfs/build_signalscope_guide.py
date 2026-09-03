from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Frame, Image, KeepTogether, PageBreak, PageTemplate,
    Paragraph, Spacer, Table, TableStyle
)
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output" / "pdf" / "SignalScope-使用指南-2026-07-23.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)

REPO = "https://github.com/Bisongyanming2003/signalscope-linkedin-content-research"
RELEASES = REPO + "/releases"
ISSUES = REPO + "/issues"

FONT_REG = "/System/Library/Fonts/STHeiti Light.ttc"
FONT_BOLD = "/System/Library/Fonts/STHeiti Medium.ttc"
pdfmetrics.registerFont(TTFont("CN", FONT_REG))
pdfmetrics.registerFont(TTFont("CNB", FONT_BOLD))

W, H = A4
INK = colors.HexColor("#17211C")
MUTED = colors.HexColor("#65736B")
GREEN = colors.HexColor("#197A52")
MINT = colors.HexColor("#E8F4ED")
CREAM = colors.HexColor("#F6F1E7")
CORAL = colors.HexColor("#E97855")
LINE = colors.HexColor("#D8E2DC")
WHITE = colors.white

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="TitleCN", fontName="CNB", fontSize=28, leading=34, textColor=INK, spaceAfter=8))
styles.add(ParagraphStyle(name="H1CN", fontName="CNB", fontSize=20, leading=26, textColor=INK, spaceAfter=11))
styles.add(ParagraphStyle(name="H2CN", fontName="CNB", fontSize=12.5, leading=18, textColor=GREEN, spaceBefore=6, spaceAfter=5))
styles.add(ParagraphStyle(name="BodyCN", fontName="CN", fontSize=9.5, leading=15.5, textColor=INK, spaceAfter=6))
styles.add(ParagraphStyle(name="SmallCN", fontName="CN", fontSize=8, leading=12.5, textColor=MUTED))
styles.add(ParagraphStyle(name="WhiteCN", fontName="CN", fontSize=9.5, leading=15, textColor=WHITE))
styles.add(ParagraphStyle(name="WhiteBoldCN", fontName="CNB", fontSize=13, leading=18, textColor=WHITE))
styles.add(ParagraphStyle(name="CenterCN", fontName="CN", fontSize=9.5, leading=15, alignment=TA_CENTER, textColor=INK))
styles.add(ParagraphStyle(name="CodeCN", fontName="CN", fontSize=8, leading=12, textColor=INK, backColor=CREAM, borderPadding=7))


def P(text, style="BodyCN"):
    return Paragraph(text, styles[style])


def qr_drawing(url, size=34*mm):
    widget = qr.QrCodeWidget(url)
    x1, y1, x2, y2 = widget.getBounds()
    d = Drawing(size, size, transform=[size/(x2-x1), 0, 0, size/(y2-y1), 0, 0])
    d.add(widget)
    return d


def box(title, body, color=MINT, width=166*mm):
    data = [[P(title, "H2CN")], [P(body)]]
    t = Table(data, colWidths=[width])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), color),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 11),
        ("RIGHTPADDING", (0, 0), (-1, -1), 11),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t


def bullets(items):
    return [P("• " + item) for item in items]


def header_footer(canvas, doc):
    canvas.saveState()
    if doc.page > 1:
        canvas.setFillColor(GREEN)
        canvas.rect(0, H-7*mm, W, 7*mm, fill=1, stroke=0)
        canvas.setFont("CN", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(22*mm, 12*mm, "SignalScope 使用指南 · 2026-07-23")
        canvas.drawRightString(W-22*mm, 12*mm, str(doc.page))
    canvas.restoreState()


doc = BaseDocTemplate(
    str(OUT), pagesize=A4, leftMargin=22*mm, rightMargin=22*mm,
    topMargin=20*mm, bottomMargin=20*mm,
    title="SignalScope 使用指南", author="叶绿体Oliver",
    subject="SignalScope 安装、采集、分析与 GitHub 访问指南"
)
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")
doc.addPageTemplates(PageTemplate(id="all", frames=[frame], onPage=header_footer))
story = []

# Cover
story += [
    Spacer(1, 18*mm),
    P("SignalScope", "TitleCN"),
    P("LinkedIn 公司帖子采集与研究台", "H1CN"),
    Spacer(1, 4*mm),
    box("做它的原因很简单", "帖子太多，手动滑动太累，数据录入太麻烦。这个轻量级工具把“滚动、记录、整理”连起来，让你把时间留给真正的内容判断。", CREAM),
    Spacer(1, 12*mm),
]
cover_grid = Table([
    [
        [P("本地优先", "WhiteBoldCN"), P("不上传扫描结果，不自动登录。", "WhiteCN")],
        [P("5 种扫描模式", "WhiteBoldCN"), P("最近帖子、最早帖子、倒序回扫、增量和续扫。", "WhiteCN")],
        [P("CSV + JSON", "WhiteBoldCN"), P("直接用于 Excel、归档和离线分析。", "WhiteCN")],
    ]
], colWidths=[55*mm]*3)
cover_grid.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,-1), GREEN), ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("LEFTPADDING", (0,0), (-1,-1), 9), ("RIGHTPADDING", (0,0), (-1,-1), 9),
    ("TOPPADDING", (0,0), (-1,-1), 10), ("BOTTOMPADDING", (0,0), (-1,-1), 10),
    ("INNERGRID", (0,0), (-1,-1), 0.5, colors.HexColor("#4C9B77")),
]))
story += [cover_grid, Spacer(1, 14*mm)]
link_text = P(f'<b>GitHub 开源仓库</b><br/><link href="{REPO}" color="#197A52">{REPO}</link><br/><br/>点击链接，或使用手机相机扫描二维码。', "BodyCN")
link_table = Table([[link_text, qr_drawing(REPO)]], colWidths=[119*mm, 43*mm])
link_table.setStyle(TableStyle([
    ("VALIGN", (0,0), (-1,-1), "MIDDLE"), ("BOX", (0,0), (-1,-1), 0.8, LINE),
    ("BACKGROUND", (0,0), (-1,-1), WHITE), ("LEFTPADDING", (0,0), (-1,-1), 12),
    ("RIGHTPADDING", (0,0), (-1,-1), 8), ("TOPPADDING", (0,0), (-1,-1), 9),
    ("BOTTOMPADDING", (0,0), (-1,-1), 9),
]))
story += [link_table, Spacer(1, 8*mm), P("版本：2026-07-23　·　适用于 Chrome 桌面版　·　MIT License", "SmallCN"), PageBreak()]

# XHS guidance
story += [
    P("小红书里怎么放 GitHub 链接？", "H1CN"),
    box("先说结论", "不建议在小红书笔记图片、正文或评论里直接放站外网址、二维码、邮箱或其他导流信息。小红书官方规则对站外引导有明确限制。更稳妥的策略是：笔记本身完整讲清楚产品，使用一个独特、可搜索的项目名，并把详细链接留在 PDF 或 GitHub 自身的分享渠道中。", colors.HexColor("#FFF1EB")),
    Spacer(1, 7*mm),
    P("推荐发布方式", "H2CN"),
    *bullets([
        "标题和封面使用固定名称：SignalScope。",
        "正文讲清楚真实痛点、它解决了什么、适合谁，不把笔记写成纯导流页。",
        "结尾只写“项目名：SignalScope”，让感兴趣的人通过通用搜索查找。",
        "需要把 PDF 发给具体读者时，再通过平台允许的私信或你已有的合规文件分享方式发送。",
        "发布前再次查看小红书最新社区规范；平台规则可能变化。"
    ]),
    Spacer(1, 5*mm),
    box("可以直接用的笔记结尾", "项目名：SignalScope<br/>一个本地优先的 LinkedIn 公司帖子采集与研究工具。<br/>我会继续记录它的使用方法和迭代过程。", MINT),
    Spacer(1, 8*mm),
    P("为什么 PDF 里可以保留完整链接？", "H2CN"),
    P("这份 PDF 是独立的产品使用说明，完整 URL 和二维码用于帮助已经拿到文档的读者访问开源仓库。请不要把含站外二维码的页面直接当作小红书配图发布。"),
    Spacer(1, 8*mm),
    P("规则参考", "H2CN"),
    P('小红书电商学习中心的公开规则示例中，明确列举了“网址、邮箱、社交平台账号、二维码”等站外引导信息。规则入口：<link href="https://school.xiaohongshu.com/helper/detail/2055" color="#197A52">school.xiaohongshu.com/helper/detail/2055</link>', "SmallCN"),
    PageBreak()
]

# Install
story += [
    P("5 分钟安装", "H1CN"),
    box("01　下载", f'打开 <link href="{RELEASES}" color="#197A52">GitHub Releases</link>，下载最新的 <b>signalscope-x.y.z.zip</b>。不要下载 GitHub 自动生成的 Source code (zip)。如果暂时没有 Release，也可以下载源码，直接使用其中的 chrome-extension 文件夹。'),
    Spacer(1, 5*mm),
    box("02　解压", "把 ZIP 解压到一个固定文件夹。安装完成后不要随意移动或删除这个文件夹。", CREAM),
    Spacer(1, 5*mm),
    box("03　加载到 Chrome", "在地址栏输入 <b>chrome://extensions/</b> → 打开右上角“开发者模式” → 点击“加载已解压的扩展程序” → 选择里面直接包含 manifest.json 的文件夹。"),
    Spacer(1, 5*mm),
    box("04　固定扩展", "在 Chrome 扩展菜单中，把“SignalScope · LinkedIn 研究台”固定到工具栏。以后更新版本时，替换本地文件，再回到扩展管理页点击刷新。", CREAM),
    Spacer(1, 8*mm),
    P("安装前需要知道", "H2CN"),
    *bullets([
        "SignalScope 是本地加载的 Chrome 扩展，不需要 API Key。",
        "你需要先正常登录 LinkedIn，并能够在浏览器中看到目标公司的公开帖子。",
        "扩展不会替你登录，也不会绕过验证码、安全检查或访问限制。"
    ]),
    PageBreak()
]

# First scan
story += [
    P("第一次采集：先用 30 篇测试", "H1CN"),
    P("1. 打开 LinkedIn 公司 Posts 页面："),
    P("https://www.linkedin.com/company/company-name/posts/?feedView=all", "CodeCN"),
    Spacer(1, 5*mm),
    P("2. 确认页面里已经显示帖子，再点击 SignalScope 图标。"),
    P("3. 可选：点击“选择文件夹”，指定扫描结果的保存位置。"),
    P("4. 设置一个简短公司文件名，例如 goodwe 或 midea。"),
    P("5. 日期范围先留空，目标数量选择 30 篇。"),
    P("6. 点击“完整采集”，在页面右上角观察进度。扫描过程中不要切换到另一个公司页面。"),
    P("7. 完成后检查 CSV 和 JSON，再点击“打开研究台”进行离线分析。"),
    Spacer(1, 8*mm),
    box("结果保存在哪里？", "优先保存到你在扩展里选择的文件夹。若未选择、授权失效或写入失败，文件会回退到浏览器默认下载目录，避免结果丢失。", MINT),
    Spacer(1, 7*mm),
    P("建议的项目内目录", "H2CN"),
    P("如果你希望把扫描结果长期放在 005 项目里，可以单独建立 <b>data/scans/</b>，按公司或年份继续分层。不要把真实客户数据提交到公开 GitHub 仓库。"),
    PageBreak()
]

# Modes and outputs
story += [P("扫描模式与输出文件", "H1CN")]
mode_data = [
    [P("模式", "WhiteBoldCN"), P("什么时候用", "WhiteBoldCN"), P("停止条件", "WhiteBoldCN")],
    [P("完整采集"), P("快速获取最近 30/50/100 篇"), P("达到目标数量")],
    [P("查找最早帖子"), P("尽可能扫描整个账号历史"), P("多轮确认已到底部")],
    [P("从当前位置向上扫描"), P("手动滑到历史位置后，向较新帖子回扫"), P("回到顶部或手动停止")],
    [P("增量采集"), P("只补充累计文件之后的新帖子"), P("遇到历史帖子")],
    [P("继续上次扫描"), P("长扫描被刷新或中断"), P("恢复原模式停止条件")],
]
mt = Table(mode_data, colWidths=[38*mm, 80*mm, 48*mm], repeatRows=1)
mt.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), GREEN), ("TEXTCOLOR", (0,0), (-1,0), WHITE),
    ("GRID", (0,0), (-1,-1), 0.5, LINE), ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("LEFTPADDING", (0,0), (-1,-1), 7), ("RIGHTPADDING", (0,0), (-1,-1), 7),
    ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [WHITE, colors.HexColor("#F8FAF9")]),
]))
story += [mt, Spacer(1, 8*mm), P("文件命名示例", "H2CN")]
out_data = [
    [P("文件"), P("用途")],
    [P("goodwe-2026-07-23.csv"), P("本次扫描，适合 Excel")],
    [P("goodwe-2026-07-23.json"), P("本次扫描和完整元数据")],
    [P("goodwe-master.csv"), P("自动去重后的累计表格")],
    [P("goodwe-master.json"), P("累计帖子、日期覆盖与批次信息")],
]
ot = Table(out_data, colWidths=[70*mm, 96*mm])
ot.setStyle(TableStyle([
    ("GRID", (0,0), (-1,-1), 0.5, LINE), ("BACKGROUND", (0,0), (-1,0), CREAM),
    ("VALIGN", (0,0), (-1,-1), "TOP"), ("LEFTPADDING", (0,0), (-1,-1), 8),
    ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
]))
story += [ot, Spacer(1, 4*mm), P("同一天重复扫描时，批次文件会自动添加 -02、-03，避免覆盖。", "SmallCN"), PageBreak()]

# Research desk and confidence
story += [
    P("研究台：把文件拖进去就能看", "H1CN"),
    P("打开扩展弹窗底部的“打开研究台”，拖入一份或多份 CSV/JSON。整个分析过程在本地运行。"),
]
manager = ROOT / "marketing" / "xhs" / "source" / "manager-real.png"
if manager.exists():
    img = Image(str(manager))
    img._restrictSize(166*mm, 78*mm)
    story += [Spacer(1, 3*mm), img, Spacer(1, 5*mm)]
story += [
    P("研究台会自动完成", "H2CN"),
    *bullets([
        "合并多个批次，并按发布日期与正文去重。",
        "比较公司、主题、媒体类型、发布节奏和互动表现。",
        "按关键词、日期、公司、主题和媒体筛选。",
        "导出合并数据、累计 JSON、当前筛选或本地 HTML 报告。"
    ]),
    Spacer(1, 4*mm),
    box("如何理解完整度", "SignalScope 只能读取当前浏览器实际加载出来的内容，不能保证 LinkedIn 返回账号全部历史。JSON 中的 boundary_confidence 用 high、medium、low 表示停止边界的可信度。正式研究前，请抽查最早和最晚的帖子，并核对正文、日期和互动数字。", CREAM),
    PageBreak()
]

# FAQ/privacy/final access
story += [
    P("常见问题、隐私与访问入口", "H1CN"),
    P("采集到 0 篇", "H2CN"),
    P("确认帖子已显示，手动滚动一次后重试。若仍为 0，LinkedIn 可能更新了页面结构。下载诊断 JSON，并到 GitHub Issues 提交问题。"),
    P("只看到登录、验证码或安全检查", "H2CN"),
    P("扫描会主动停止。请按 LinkedIn 正常流程手动处理，不要修改扩展绕过限制。"),
    P("Excel 打开 CSV 乱码", "H2CN"),
    P("使用 Excel 的“数据 → 从文本/CSV”，编码选择 UTF-8。"),
    P("日期为什么是估计值", "H2CN"),
    P("LinkedIn 经常只显示 2d、3周等相对时间。published_at_raw 保留页面原文，estimated_publish_date 是换算日期，不应视为官方精确发布时间。"),
    Spacer(1, 5*mm),
    box("隐私原则", "SignalScope 不收集遥测、Cookie、浏览历史、账号、密码或认证信息；不会自动点赞、评论、关注、转发或发帖。请只采集你有权查看和研究的公开内容，并遵守适用法律、LinkedIn 条款和组织内部政策。", MINT),
    Spacer(1, 8*mm),
]
final_grid = Table([
    [
        [P("GitHub 仓库", "H2CN"), P(f'<link href="{REPO}" color="#197A52">{REPO}</link>', "SmallCN"),
         Spacer(1, 3*mm), P(f'<link href="{ISSUES}" color="#197A52">提交问题 / GitHub Issues</link>', "BodyCN"),
         P("开源协议：MIT License", "SmallCN")],
        qr_drawing(REPO, 38*mm)
    ]
], colWidths=[119*mm, 45*mm])
final_grid.setStyle(TableStyle([
    ("BOX", (0,0), (-1,-1), 0.8, LINE), ("BACKGROUND", (0,0), (-1,-1), CREAM),
    ("VALIGN", (0,0), (-1,-1), "MIDDLE"), ("LEFTPADDING", (0,0), (-1,-1), 11),
    ("RIGHTPADDING", (0,0), (-1,-1), 8), ("TOPPADDING", (0,0), (-1,-1), 9),
    ("BOTTOMPADDING", (0,0), (-1,-1), 9),
]))
story += [final_grid, Spacer(1, 6*mm), P("提醒：这一页含站外链接和二维码，适合在 PDF 内使用，不建议直接作为小红书配图发布。", "SmallCN")]

doc.build(story)
print(OUT)
