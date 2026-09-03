# SignalScope

一个本地优先的 Chrome 扩展，用于采集和分析你在浏览器中已经能够正常查看的 LinkedIn 公司公开帖子。

无需配置 API，不会自动登录，不上传采集结果，也不会点赞、评论、关注、转发或发帖。采集、合并和分析均在你的浏览器或电脑本地完成。

## 能做什么

- 采集最近 30、50 或 100 篇公司帖子
- 持续向下查找账号最早的帖子
- 从手动定位的位置向上回扫
- 按日期范围采集
- 中断后从本地检查点继续
- 导出 CSV 和 JSON
- 按公司自动维护去重后的累计文件
- 在离线研究台中比较公司、主题、媒体形态、发布节奏和互动表现

## 5 分钟快速开始

### 1. 下载扩展

打开仓库右侧的 [**Releases**](https://github.com/Bisongyanming2003/signalscope-linkedin-content-research/releases)，下载最新版本中的：

```text
signalscope-x.y.z.zip
```

不要下载 GitHub 自动生成的 `Source code (zip)`；它包含整个源码仓库，不是精简的扩展安装包。

下载后将 ZIP 解压到一个固定文件夹。安装后不要随意移动或删除该文件夹。

> 如果仓库尚未发布 Release，也可以下载仓库源码，并直接使用其中的 `chrome-extension` 文件夹。

### 2. 安装到 Chrome

1. 在 Chrome 地址栏打开 `chrome://extensions/`。
2. 打开右上角的 **开发者模式**。
3. 点击 **加载已解压的扩展程序**。
4. 选择刚才解压后、里面直接包含 `manifest.json` 的文件夹。
5. 在 Chrome 扩展菜单中将 **SignalScope · LinkedIn 研究台** 固定到工具栏。

更新版本时，替换本地扩展文件，然后回到 `chrome://extensions/` 点击 SignalScope 卡片上的刷新按钮。

### 3. 打开公司帖子页面

先正常登录 LinkedIn，然后打开一个公司 Posts 页面，例如：

```text
https://www.linkedin.com/company/company-name/posts/?feedView=all
```

确认页面中已经能看到帖子，再点击工具栏中的 SignalScope 图标。扩展不会替你登录，也不会尝试绕过验证码、安全检查或访问限制。

### 4. 完成第一次采集

1. 可选：点击 **选择文件夹**，指定扫描结果的保存位置。
2. 设置简短的公司文件名，例如 `goodwe` 或 `midea`。
3. 保持日期范围为空。
4. 目标数量选择 `30 篇`，用于第一次测试。
5. 点击 **完整采集**。
6. 在 LinkedIn 页面右上角查看进度；不要在扫描过程中切换到另一个公司页面。
7. 完成后检查导出的 CSV 和 JSON。

如果没有选择保存文件夹，或文件夹授权失效，结果会进入浏览器默认下载目录。

### 5. 打开研究台

点击扩展弹窗底部的 **打开研究台**，然后拖入刚生成的 CSV 或 JSON。研究台会自动：

- 合并多个批次并按发布日期与正文去重
- 显示平均互动量和中位互动量
- 比较公司、主题和媒体类型
- 分析发布节奏与话题标签
- 支持关键词、日期、公司、主题和媒体筛选
- 导出合并数据、累计 JSON、当前筛选或本地 HTML 报告

研究台完全离线运行。关闭页面前，请下载需要保留的修改和分析结果。

## 采集模式

| 模式 | 适用场景 | 停止条件 |
| --- | --- | --- |
| 完整采集 | 快速获取最近一批帖子 | 达到 30、50 或 100 篇 |
| 查找最早帖子 | 尽可能扫描整个账号历史 | 多轮确认已到页面底部 |
| 从当前位置向上扫描 | 先手动滑到历史位置，再向较新的帖子回扫 | 返回页面顶部或手动停止 |
| 增量采集 | 只采集上次累计文件之后的新帖子 | 遇到历史帖子 |
| 继续上次扫描 | 长扫描被刷新、中断或手动停止 | 恢复原模式的停止条件 |

“开始日期”和“结束日期”可以留空。向下扫描设置开始日期后，越过该日期即停止，并只导出范围内的帖子。

## 导出文件

假设公司简称为 `goodwe`，扫描日期为 `2026-07-22`：

| 文件 | 内容 |
| --- | --- |
| `goodwe-2026-07-22.csv` | 本次扫描，适合 Excel |
| `goodwe-2026-07-22.json` | 本次扫描及完整元数据 |
| `goodwe-master.csv` | 自动去重后的累计表格 |
| `goodwe-master.json` | 累计帖子、覆盖日期、批次数和空白月份 |

同一天重复扫描时，批次文件会自动添加 `-02`、`-03`，避免覆盖旧文件。只有在扩展获得指定文件夹的写入权限时，才会自动更新 `master` 文件。

## 如何理解完整度

LinkedIn 可能根据账号、地区、语言、网络状态和页面实验改变展示结果。SignalScope 只能读取当前浏览器实际加载出来的内容，不能保证 LinkedIn 返回账号的全部历史帖子。

JSON 元数据中的 `boundary_confidence` 表示停止边界的可信度：

- `high`：页面高度稳定、连续位于底部并且多轮无新增
- `medium`：到达日期边界、历史文件边界或页面顶部
- `low`：用户停止、访问受限，或页面停止加载但尚未充分确认到底

正式研究前，建议抽查最早和最晚的几篇帖子，并检查正文、日期和互动数字。

## 常见问题

### 扩展提示“请先打开公司 Posts 页面”

确认地址形如：

```text
https://www.linkedin.com/company/.../posts/
```

刷新 LinkedIn 页面后再打开扩展。

### 采集到 0 篇

先确认帖子已经显示，并手动滚动一次。仍然为 0 时，LinkedIn 可能更新了页面结构。下载诊断 JSON，并在 [GitHub Issues](https://github.com/Bisongyanming2003/signalscope-linkedin-content-research/issues) 中提交问题。

### 只看到登录、验证码或安全检查

扫描会主动停止。请按照 LinkedIn 的正常流程手动处理，不要修改扩展绕过限制。

### 文件没有保存到指定文件夹

重新打开扩展，检查“结果保存位置”。如果授权失效，重新点击 **选择文件夹**。扩展保存失败时会退回浏览器下载目录，避免丢失结果。

### Excel 打开 CSV 出现乱码

SignalScope 生成的 CSV 带 UTF-8 BOM。若仍有乱码，请在 Excel 中使用“数据 → 从文本/CSV”，并选择 UTF-8。

### 日期为什么是估计值

LinkedIn 经常只显示 `2d`、`3周` 等相对时间。`publish_date` 是根据采集时间换算的日期，不应视为官方精确发布时间。

## 数据字段

CSV 与 JSON 中的帖子字段包括：

```text
company
collected_at
publish_date
post_text
hashtags
reactions
comments
reposts
media_type
```

`media_type` 可能为 `image`、`video`、`document`、`carousel`、`link`、`text` 或 `unknown`。

## 隐私与权限

扩展仅在用户主动点击后处理当前 LinkedIn 公司 Posts 标签页：

- `activeTab`：临时访问当前标签页
- `scripting`：注入本地采集逻辑
- 本地后台服务：保存文件、检查点、公司简称和累计数据，不发送网络请求

SignalScope 不收集遥测、Cookie、浏览历史、账号、密码或认证信息。详情见 [PRIVACY.md](PRIVACY.md)。

## 给开发者

### 从源码安装

克隆仓库后，在 `chrome://extensions/` 中加载 `chrome-extension` 文件夹即可。项目不需要前端构建工具或依赖安装。

### 构建发行包

macOS 或 Linux：

```bash
./scripts/package_extension.sh
```

发行包会生成到 `dist/signalscope-版本号.zip`。GitHub Actions 会自动检查 JavaScript、扩展清单、Python 工具和打包流程。

### 可选的命令行工具

- `merge_outputs.py`：合并多份 CSV/JSON 并去重
- `analyze_report.py`：从合并 CSV 生成本地 HTML 报告
- `linkedin_scraper.py`：连接用户手动启动并登录的 Chrome，作为扩展的 Playwright 备用采集方式
- `console-scraper.js`：可在浏览器开发者工具中人工运行的备用脚本

安装 Python 备用工具依赖：

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 负责任使用

请只采集你有权查看和研究的公开内容，遵守适用法律、LinkedIn 条款及组织内部政策。不要用本项目绕过登录、验证码、访问限制或技术保护措施。页面结构和展示结果可能变化，正式结论应经过抽样核对。

## 反馈

发现问题时，请在 [GitHub Issues](https://github.com/Bisongyanming2003/signalscope-linkedin-content-research/issues) 中提交：

- Chrome 版本与操作系统
- 公司 Posts 页面地址
- 使用的采集模式
- 停止原因和采集数量
- 不含认证信息的诊断 JSON

请勿上传 Cookie、账号信息、客户机密数据或未经授权的完整采集结果。

## License

本项目采用 [MIT License](LICENSE)。
