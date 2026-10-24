# 🐺 狼人杀 · 法官控制台（Werewolf Judge Console）

🌐 **在线直接用（GitHub Pages 已自动部署）**：[https://codinggeoff.github.io/werewolf-judge-console/](https://codinggeoff.github.io/werewolf-judge-console/)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/CodingGeoff/werewolf-judge-console)

专为狼人杀面杀 / 网杀法官打造的全流程防忘事工作台：**发牌 → 夜晚引导与自动算死讯 → 记录各种乱七八糟突发情况 → 事后随时复盘标注 → 一键导出文字战报**。

纯前端单页应用（React 19 + Vite 6），所有多局历史数据实时自动保存在浏览器本地存储（`localStorage`），并支持 JSON 导出与导入备份，**无需后端与数据库，部署到 Render 静态站点永久免费且绝不休眠秒开**。

---

## ✨ 核心功能

### 1. 基础发牌与板子配置（默认 9 人标准局）
- **一键快速开局**：首页支持一键开启最常用的 **9人标准局（3狼 + 预言家/女巫/猎人 + 3平民）**，同时内置 9人不可自救、9人守卫、10人标准、10人白痴、12人预女猎白、12人狼王守卫等预设，并支持任意增减神狼角色牌数。
- **三种发身份方式全覆盖**：
  1. **📱 传阅看牌器（防偷窥模式）**：没有实体牌时，把手机/平板从 1 号传到 9 号，玩家点击翻看自己的身份（狼人自动看到狼队友座号），看完一键隐藏再传给下一位。
  2. **🎲 随机洗牌直接进法官台**：系统自动分好 1~N 号身份。
  3. **✍️ 线下实体牌录入模式**：玩家线下抽实体扑克牌，夜间谁睁眼法官直接在座位上点选录入其身份。
- **🙈 一键遮挡底牌**：顶部随时切换「遮挡底牌 / 显示底牌」，防止玩家路过偷看，甚至可直接投屏展示公用存活状态。

### 2. 记录一切正常与乱七八糟的情况
- **🌙 夜晚流程引导与死讯自动结算器**：
  - 按「守卫 → 狼人 → 女巫 → 预言家」顺序引导：支持记录**哪只狼拿刀（主刀）+ 刀了谁 / 自刀 / 空刀**、**守卫堵刀（自动标红上夜守过的人防连守）**、**女巫救药/毒药（防同夜双药与违规自救）**。
  - **预言家查验防比错手势**：选定查验目标立即高亮提示法官应比划 `👍 好人（金水）` 还是 `👎 狼人（查杀）`（含隐狼特殊识别）。
  - **自动推算天亮死讯与闷枪状态**：自动处理「同守同救（奶穿）」、「女巫救起平安夜」、「猎人/狼王被毒闷枪不可开枪 vs 被刀可开枪」，一键结算写入事件流并切入白天。
- **☀️ 白天与突发情况全能记录**：
  - **警长竞选管理**：一键标记谁上警、谁退水、当选警长、移交或撕毁警徽。
  - **公投放逐与票型**：记录放逐出局与详细票型（若投出白痴自动识别翻牌免死并标记失去投票权）。
  - **乱七八糟情况全覆盖**：猎人/狼王开枪带人、狼人/白狼王自爆、骑士决斗、情侣连线与殉情、场外贴脸判罚警告、以及任意自由备注。
- **↩️ 30 步撤销栈（Undo）**：法官手滑点错随时一键撤回。

### 3. 强大的后续标注与复盘系统
- **对任意历史事件追加标注**：无论在对局中还是结束后，点击任何一条历史记录的 `✏️ 标注` 按钮，即可修改详情或写入 **「📌 法官复盘批注」**（金色高亮框展示），并可打上任意预设或自定义标签（如 `自刀骗药`、`堵刀成功`、`反向金水`、`平票PK` 等）。
- **座位多维标签与独立档案**：随时给任意玩家贴上 `悍跳`、`倒钩狼`、`冲锋狼`、`深水狼`、`抗推位`、`MVP`、`背锅` 或任意自定义标签，填写专属发言备注。
- **多局历史库 & 一键群发文字战报**：自动保存每一局记录，支持一键生成排版整齐的文字复盘战报直接发微信群，或导出/导入 `.json` 备份文件。

---

## 🚀 部署指南（Render / Vercel / Netlify / Cloudflare Pages）

### 方案一：部署到 Render（最推荐 Static Site，免费且永不休眠！）

仓库根目录已内置好 `render.yaml` 配置文件：

1. 将本文件夹（`judge-console`）的代码推送到你的 GitHub 仓库。
2. 登录 [Render Dashboard](https://dashboard.render.com/)：
   - **自动方式（Blueprint）**：点击右上角 **New +** → **Blueprint** → 连接该 GitHub 仓库，Render 会自动读取 `render.yaml` 完成配置。
   - **手动方式（Static Site）**：点击 **New +** → **Static Site** → 连接仓库后填写：
     - **Build Command**: `npm install && npm run build`
     - **Publish Directory**: `dist`
     - 在 **Redirects/Rewrites** 中添加一条（可选，单页路由兜底）：Source `/*`，Destination `/index.html`，Action `Rewrite`。
3. 点击创建，约 30 秒构建完毕即可获得永久免费 HTTPS 域名（如 `https://werewolf-judge-console.onrender.com`）。因为是纯静态 CDN 托管，**即使半个月没人访问也不会休眠，面杀现场掏出手机秒开**。

### 方案二：部署到 Vercel / Netlify / Cloudflare Pages

项目已内置 `vercel.json`、`public/_redirects` 与 `public/404.html`：
- **Build Command**: `npm run build`
- **Output / Publish Directory**: `dist`
- 导入 GitHub 仓库后直接点击 Deploy 即可一键上线。

---

## 💻 本地开发与测试

```bash
npm install
npm run dev      # 启动本地开发服务器
npm test         # 运行核心结算与规则单元测试
npm run build    # 构建生产环境静态包至 dist/
```
