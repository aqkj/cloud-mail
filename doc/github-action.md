## Github Action 部署

**配置 Github 仓库**

1. Fork 或克隆仓库 [https://github.com/eoao/cloud-mail](https://github.com/eoao/cloud-mail)
2. 进入您的 GitHub 仓库设置
3. 转到 Settings → Secrets and variables → Actions → New Repository secrets
4. 添加以下 Secrets：

| Secret 名称             | 必需 | 用途                                                  |
| ----------------------- | :--: | ----------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  |  ✅  | Cloudflare API 令牌（需要 Workers 和相关资源权限）    |
| `CLOUDFLARE_ACCOUNT_ID` |  ✅  | Cloudflare 账户 ID                                    |
| `D1_DATABASE_ID`        |  ✅  | 您的 D1 数据库的 ID                                     |
| `KV_NAMESPACE_ID`       |  ✅  | 您的 KV 命名空间的 ID                                   |
| `R2_BUCKET_NAME`        |  ✅  | 您的 R2 存储桶的名称                                    |
| `DOMAIN`                |  ❌  | 兼容旧配置，邮箱域名 JSON 数组（例如 `["xx.xx"]`），域名较多时不要使用        |
| `DOMAIN_KV_KEY`         |  ❌  | 自定义 KV 域名列表 key；不配置时默认使用 `cloud-mail:domains`        |
| `ADMIN`                 |  ✅  | 您的管理员邮箱地址（例如 `admin@example.com`）      |
| `JWT_SECRET`            |  ✅  | 用于生成和验证 JWT 的随机长字符串                     |
| `INIT_URL`              |  ❌  | （可选）部署后用于初始化数据库的 Worker URL（格式参考下述手动初始化）           |

---

**获取 Cloudflare API 令牌**

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. 创建新的 API 令牌
3. 选择"编辑 Cloudflare Workers"模板，并参照下表添加相应权限
   ![dc2e1dc8dcd217644759c46c6c705de1](https://i.miji.bid/2025/07/07/dc2e1dc8dcd217644759c46c6c705de1.png)
4. 保存令牌并复制到 GitHub Secrets 中的 `CLOUDFLARE_API_TOKEN`

**获取 Cloudflare 账户 ID**
1. 账户 ID 可以在 Cloudflare 仪表盘的账户设置中找到。
2. 复制到 GitHub Secrets 中的 `CLOUDFLARE_ACCOUNT_ID`

**运行工作流**
1. 然后在Action页面手动运行工作流，后续同步上游后会自动部署到 Cloudflare Workers。如未配置 `INIT_URL`，则需要手动访问 `https://你的项目域名/api/init/你的jwt_secret` 进行数据库初始化。
2. 自动同步上游可使用bot或者手动点击Sync Upstream按钮。

**域名列表放到 KV**

当域名列表超过 Cloudflare Worker 环境变量大小限制时，可以把域名保存到 KV。默认 key 为 `cloud-mail:domains`，也可以在 Action 变量中配置 `DOMAIN_KV_KEY` 自定义 key。

1. 准备 JSON 文件，格式必须是域名规则数组，不要带 `@`。`example.com` 只匹配根域名，`*.example.com` 匹配 `a.example.com`、`b.c.example.com` 等子域名：

```json
[
  "example.com",
  "*.example.com",
  "example2.com"
]
```

2. 写入已绑定到 Worker 的 KV 命名空间，key 示例使用 `cloud-mail:domains`：

```bash
cd mail-worker
pnpm wrangler kv key put "cloud-mail:domains" --path domains.json --namespace-id <KV_NAMESPACE_ID>
```

3. 如需使用非默认 key，在 GitHub Secrets 或 Variables 中配置：

| 名称 | 示例 |
| ---- | ---- |
| `DOMAIN_KV_KEY` | `cloud-mail:domains` |

程序会优先从 KV 读取域名列表；`DOMAIN_KV_KEY` 未配置时使用默认 key `cloud-mail:domains`。如果默认 key 不存在，则兼容读取旧的 `DOMAIN` 环境变量。部署后也可以在后台系统设置页面管理域名，系统会写入 KV。

通配规则只控制系统内注册、添加账号、角色权限和站内发信的域名校验。实际收信仍需要在 Cloudflare Email Routing / Email Service 中接入对应域名或子域名，并把邮件路由到 Worker。
