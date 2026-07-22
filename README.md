# LinkedIn 内容研究本地工具

> 隐私与本地数据处理说明见 [PRIVACY.md](PRIVACY.md)。

## 构建扩展发行包

运行 `./scripts/package_extension.sh`，即可在 `dist/` 中生成按版本命名的 Chrome 扩展 ZIP。GitHub Actions 会在每次推送和拉取请求时检查 JavaScript、扩展清单、Python 工具并验证打包流程。

本工具只读取你在浏览器里已经能正常查看的公开公司帖子。它不会自动登录，不保存账号、密码、Cookie 或会话文件，也不会点赞、评论、关注、转发或发帖。遇到登录页、验证码、安全检查或访问限制时会立即停止；请不要用它绕过任何限制。

## 一键采集方式：Chrome 扩展（推荐）

项目的 `chrome-extension` 文件夹是一个本地 Manifest V3 扩展，只申请 `activeTab` 和 `scripting` 两项权限。

1. Chrome 地址栏打开 `chrome://extensions/`。
2. 打开右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本项目中的 `chrome-extension` 文件夹。
5. 打开 LinkedIn 公司 Posts 页面，点击工具栏中的扩展按钮。
6. 首次点击“完整采集”；后续选择研究台导出的累计 JSON 后点击“开始增量采集”。

弹窗可选择30/50/100篇目标，并提供快速模式（2—3秒）与稳定模式（3—5秒）。页面进度面板会说明滚动轮次、本轮新增、页面高度和最终停止原因；未达到目标时可以下载不含认证信息的诊断 JSON。

采集进度显示在 LinkedIn 页面右上角，完成后自动下载 CSV 和 JSON。扩展不会后台运行，不申请 Cookie、历史记录或网站全局权限。详细说明见 `chrome-extension/README.md`。

## 无终端管理方式（推荐）

安装Chrome扩展后，可直接点击弹窗底部的“打开研究台”。也可以双击 `linkedin-audit-manager.html`。两种方式都是完全离线的本地研究台，不需要安装依赖或运行终端命令。

1. 把三家公司采集得到的 CSV 或 JSON 拖入页面，也可以点击“选择文件”。
2. 页面自动合并、按帖子链接去重，并显示平均互动量、中位互动量、发布频率、公司表现和媒体类型。
3. 在“公司筛选看板”点击公司，联动查看该公司的运营观察、发布节奏和标签表现；再次点击“全部公司”即可恢复全局视角。
4. “内容主题分类”会依据正文和标签自动初分为产品、活动、案例、洞察、合作等主题；可点击主题筛选，并在帖子表中人工修正。
5. 使用公司、主题、媒体、起止日期和关键词筛选帖子；点击“下载当前筛选”导出当前研究样本。
6. 点击“下载合并 CSV”得到全部 Excel 总表，人工修正的 `content_topic` 会一并保存。
7. 点击“下载累计 JSON”保存下一次增量采集需要使用的历史文件。
8. 点击“保存分析报告”得到基于当前筛选、可单独打开和分享的本地 HTML 报告。

以后更新时，把旧的累计 JSON 和本轮新增文件一起拖入页面，再下载新的累计 JSON 即可。所有处理只发生在当前浏览器页面内；关闭页面前应下载需要保留的文件。

## 推荐方式：Chrome 控制台脚本

### 1. 打开目标页面

先在 Chrome 中正常打开并确认能看到帖子：

1. `https://www.linkedin.com/company/hiconics-drive-technology-co-ltd-/posts/?feedView=all`
2. `https://www.linkedin.com/company/sungrow/posts/?feedView=all`
3. `https://www.linkedin.com/company/goodwesolarengine1/posts/?feedView=all`

每次只处理当前页面。请等待首批帖子正常出现，不要在登录页或验证页运行。

### 2. 打开 DevTools

- macOS：按 `⌥ Option + ⌘ Command + I`
- Windows/Linux：按 `Ctrl + Shift + I`
- 或在页面空白处右键，选择“检查/Inspect”

选择 **Console（控制台）**。如果 Chrome 首次阻止粘贴，请按控制台提示手动输入 `allow pasting`；这是 Chrome 自身的防误粘贴提醒，请只粘贴你已审阅的本地脚本。

### 3. 运行

打开本目录的 `console-scraper.js`，全选复制，粘贴到 Console 后按 Enter。页面右上角会出现操作面板：首次采集直接点击“开始采集”；日后增量采集可先选择包含以往全部帖子的累计历史 JSON，再点击开始。脚本会：

- 尝试展开 “see more / 查看更多”；
- 每次滚动后随机等待 2–4 秒；
- 最多收集最近 100 篇，连续多次没有新帖子后自动结束；
- 下载一个带 UTF-8 BOM 的 CSV 和一个 JSON 备份；
- 在控制台显示数据表、采集数量、各字段缺失数量和错误日志。

运行后页面右上角会显示采集进度。需要提前结束时点击“停止并导出”，脚本会保存当时已经识别的数据。

### 增量采集

第二次及以后采集时，在右上角面板选择由 `merge_outputs.py` 生成、包含以往全部帖子的累计历史 JSON（可以是单家公司累计文件，也可以是三家公司总文件）。脚本读取其中的帖子去重键；向下滚动遇到历史记录时自动停止，本次 CSV/JSON 只包含新增帖子。

- 历史文件只在当前页面内存中读取，不会上传。
- 不要只选择“上一次新增批次”的 JSON，否则更早的帖子不在历史集合中。每轮采集后都应把旧累计文件与本轮新增文件重新合并，生成下一轮要使用的累计 JSON。
- 如果历史 JSON 是很久以前的，中间曾漏采，建议偶尔不加载历史文件执行一次完整采集并重新合并。
- 增量结果可以继续使用 `merge_outputs.py` 合并到历史总表。

浏览器可能询问是否允许一次下载多个文件，请允许，否则 JSON 备份可能被拦截。

### 4. 分别处理三个页面

在第一个页面运行完并确认两个文件下载完成后，再打开第二个页面，重复粘贴运行；第三个页面同理。不要在同一次运行过程中切换页面。文件名包含公司 URL 标识和采集时间，不会互相覆盖。

## 如何判断采集是否完整

1. 控制台最终显示“完成：N 篇”；N 为 100 时说明已达到上限，而不代表公司只有 100 篇。
2. 页面近期不足 100 篇，或 LinkedIn 不再加载新内容时，数量可能少于 100。
3. 打开 CSV/JSON，抽查最前、最后各 2–3 篇，与页面的日期、文案、互动数字对照。
4. 查看“缺失字段”。没有互动、评论或转发的帖子，相关数字可能为空；某些相对日期或隐藏永久链接也可能无法抽取。
5. `post_url` 优先用于去重；缺少链接时按日期与文案前 100 字去重。
6. 抽查正文、链接或估计发布日期为空的记录。

LinkedIn 可能按相关性、地区、语言或会话状态改变展示结果，因此这里的“最近”指当前页面实际加载出来的顺序。

采集上限提高到 100 后，会覆盖更多旧版帖子结构。脚本已排除明显的推广内容，并避免用通用卡片标题充当正文；但转发帖、已删除原帖、A/B 测试版式仍可能需要人工抽查。数量越大，抽样核对越重要。

## 选择器维护

LinkedIn 会不定期调整页面结构。`console-scraper.js` 开头的 `SELECTORS` 集中了全部候选选择器；Python 备用脚本的对应常量也集中在文件顶部。若某字段大面积缺失，可在 DevTools 的 Elements 面板检查新元素特征，并把新候选放到相应数组最前面。

优先使用语义稳定的属性（例如 `data-urn`、链接路径、`aria-label`），避免依赖随机生成的类名。

## 常见错误与修复

- **提示“请先打开 LinkedIn 公司 Posts 页面”**：确认 URL 形如 `/company/.../posts/`，且脚本是在该标签页的 Console 中运行。
- **采集到 0 篇**：先手动滚动一次确认帖子已加载；若仍为 0，LinkedIn 很可能更新了 DOM，请维护脚本顶部的 `post` 和 `text` 候选选择器。
- **文案不完整**：检查页面按钮是 “see more” 还是其他语言，把它的按钮选择器和显示文字加入 `seeMore`。
- **互动数为空或取错**：不同版式的计数位置不同，更新 `reactions/comments/reposts` 候选；抽查后再用于分析。
- **点赞数显示成“赞”**：这是旧版脚本把操作按钮误认为统计数字；请重新复制当前最新版 `console-scraper.js`，刷新页面后重跑。
- **只下载一个文件**：在 Chrome 地址栏右侧或网站设置中允许该页面下载多个文件，然后重跑。
- **Excel 乱码**：使用脚本生成的 CSV（已带 UTF-8 BOM），不要用文本编辑器另存为 ANSI；也可在 Excel 中通过“数据 → 从文本/CSV”选择 UTF-8。
- **出现登录、验证码或访问限制**：脚本会停止。请关闭脚本并按 LinkedIn 正常流程手动处理；不要修改脚本绕过限制。
- **控制台报 CSP 错误**：本脚本不请求外部资源，通常不受 CSP 影响；若页面仍阻止执行，使用下面的 Playwright 备用方式。

## 备用方式：Playwright Python

备用脚本不会启动自动登录，也不会把认证信息写入代码或项目。它只连接到**由你手动启动、手动登录**且开启了调试端口的 Chrome，并从其中当前打开的公司 Posts 标签页读取内容。

### 安装

在本目录运行：

```bash
python3 -m venv .venv
source .venv/bin/activate              # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

`connect_over_cdp` 使用已安装的 Chrome，不需要执行 `playwright install`。

### 启动可连接的 Chrome

先完全退出 Chrome，再手动启动一个开启调试端口的窗口。为了避免与日常 Chrome 实例冲突，可指定你自己管理的临时用户目录：

macOS：

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/linkedin-manual-chrome"
```

Windows（路径可能因安装位置不同而变化）：

```powershell
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%USERPROFILE%\linkedin-manual-chrome"
```

在这个 Chrome 窗口中由你手动登录并打开一个目标 Posts 页面，然后运行：

```bash
python linkedin_scraper.py --output .
```

脚本不会读取或导出 Cookie，也不会保存 Playwright `storage_state`。但 Chrome 自己可能在你指定的用户目录中保留登录会话；如不希望保留，完成后退出 Chrome并手动删除该目录。不要把该目录放进本项目或同步/提交它。

每个目标页面分别运行一次。若同时打开多个目标标签页，脚本选择最后找到的 Posts 标签页；为避免混淆，建议一次只保留一个目标标签页。可用 `--max 30` 调低上限，最大值固定为 100。

## 数据说明

- 数量支持 `1K`、`1.2K`、`M`、`B`、`万`、`亿`，可识别时转成整数；不能识别时保留页面原文。
- 日期通常是 LinkedIn 展示的相对日期（如 `2d` / `2周`），除非页面提供标准时间属性；工具不会猜测日期。
- `published_at_raw` 保留页面显示的相对发布时间；`estimated_publish_date` 按采集时间估算成标准日期，不能视为精确发布日期。
- `post_text_raw` 保留含标签的页面原文；`post_text` 是去除话题标签后的正文；`hashtags` 单独保存去重后的 `#话题标签`。
- 新导出的帖子字段固定为：`company, collected_at, published_at_raw, estimated_publish_date, post_text_raw, post_text, hashtags, post_url, reactions, comments, reposts, media_type`。未列出的旧字段不会进入新CSV或累计JSON。
- `media_type` 为 `image`、`video`、`document`、`carousel`、`link`、`text` 或 `unknown`。
- 新版 JSON 包含 `metadata`（采集批次信息）和 `posts`（帖子数组）；CSV 仍是最适合 Excel 的扁平表格。
- 页面结构和 A/B 测试可能造成字段缺失。用于正式报告前务必抽样核对。

## 合并多家公司结果

`merge_outputs.py` 可以把多份 CSV 或 JSON 合并、跨文件去重，并同时输出总表 CSV 和 JSON。它兼容旧版“纯帖子数组”JSON及新版带 `metadata/posts` 的 JSON。

建议把要合并的文件放进单独目录。CSV 和对应 JSON 包含同一批数据，同时放入也不会重复：

```bash
python3 merge_outputs.py /路径/到/采集结果目录 --output linkedin-all-companies.csv
```

也可以明确列出文件：

```bash
python3 merge_outputs.py sungrow.csv goodwe.csv hiconics.csv --output linkedin-all-companies.csv
```

输出包括 `linkedin-all-companies.csv` 和 `linkedin-all-companies.json`。合并只做结构化汇总与去重，不会访问 LinkedIn。

## 生成本地内容研究报告

先用 `merge_outputs.py` 得到三家公司总表，再运行：

```bash
python3 analyze_report.py linkedin-all-companies.csv --output linkedin-research-report.html
```

双击生成的 `linkedin-research-report.html` 即可查看。报告完全在本地生成，包含：

- 公司发帖量与平均点赞、评论、转发；
- 媒体类型表现；
- 高频英文关键词与话题标签；
- 加权互动表现最佳的 15 篇帖子；
- 需要人工复核的数据数量。

报告主要使用“点赞 + 评论 + 转发”计算平均互动量，并用中位互动量降低少数爆款的影响。“点赞 + 评论×2 + 转发×3”只作为帖子辅助排序的自定义运营分，不是 LinkedIn 官方互动率或学术标准，也没有按关注者数量校正。正式结论仍应结合样本量和数据质量判断。
