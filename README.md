# NotCCBot

NOTCC Bot

- 关键词列表（每条规则支持多个关键词）
- 正则表达式匹配
- 每条规则多个回复（随机回复）
- 关键词文件热重载（修改后自动生效）
- 归一化映射文件热重载（修改后自动生效）
- 未命中不回复
- Token 通过环境变量配置
- 关键词规则独立 YAML 文件配置
- 用户 ID / 群组 ID 白名单
- 可选代理环境变量

## 使用方法

1. 安装依赖

```bash
pnpm install
```

2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`：
- `TELEGRAM_BOT_TOKEN`：你的 Telegram Bot Token
- `KEYWORD_RULES_FILE`：规则 YAML 文件路径（默认 `keywords.yml`）
- `NORMALIZE_MAP_FILE`：归一化映射 YAML 文件路径（默认 `normalize.yml`）
- `USER_ID_WHITELIST`：用户白名单（逗号分隔）
- `CHAT_ID_WHITELIST`：群组/会话白名单（逗号分隔）
- `TELEGRAM_PROXY_URL`：可选代理地址（如 `http://127.0.0.1:7890`）

白名单逻辑：
- `USER_ID_WHITELIST` 为空：不限制用户
- `CHAT_ID_WHITELIST` 为空：不限制群组/会话
- 不为空时，必须命中对应白名单才会继续匹配关键词并回复
- 未命中关键词时不会回复

3. 启动

```bash
pnpm start
```

## 规则格式

`keywords.yml` 示例：

```yaml
- name: not-cc
  strict: false
  patterns:
    - "^c{4,}$"
  replies:
    - "NOT CC"
  flags: "i"

- name: smart-cc
  strict: true
  patterns:
    - "聪明cc"
  replies:
    - "对的对的"
```

说明：
- `strict`：是否严格匹配。`true` 时使用文本全等匹配，不使用正则；`false` 或不填时使用正则匹配
- `patterns`：字符串数组。`strict=true` 时按全等匹配；否则作为正则表达式处理
- `replies`：回复文本数组，命中后随机回复一条
- `flags`：仅在 `strict=false` 时生效，正则 flags（如 `i`、`im`），不填默认 `i`

匹配逻辑：
- 按规则顺序匹配
- 命中第一条规则后立即回复并停止继续匹配

## 归一化映射格式

`normalize.yml` 示例：

```yaml
- from: "с"
  to: "c"

- from: "С"
  to: "C"

- from: "㏄"
  to: "cc"
```

说明：
- 程序会先执行 Unicode NFKC 归一化，再按 `normalize.yml` 映射表逐条替换
- 映射表变更后会自动热重载
