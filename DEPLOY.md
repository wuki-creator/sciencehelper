# 部署到阿里云

`www.sciencehelper.cn` 是本算法协作平台的项目站点。前端、登录注册、需求、入驻和收益模块统一部署到该站点。

当前检查结果（2026-09-18）：

- `www.sciencehelper.cn` 已解析到 `8.163.113.5`
- 本项目使用 `www.sciencehelper.cn`
- HTTPS 证书需覆盖 `www.sciencehelper.cn`

## 1. 补充 DNS

在阿里云 DNS 中增加：

| 主机记录 | 类型 | 记录值 |
| --- | --- | --- |
| `www` | `A` | `8.163.113.5` |

## 2. 上传站点

将 `index.html` 上传到你指定的服务器目录 `/algrism_platform`：

```bash
sudo mkdir -p /algrism_platform
sudo cp index.html /algrism_platform/index.html
sudo chown -R www-data:www-data /algrism_platform
```

如果服务器使用 CentOS/Alibaba Cloud Linux，Nginx 用户通常是 `nginx`，将最后一行改为：

```bash
sudo chown -R nginx:nginx /algrism_platform
```

## 3. 启用 Nginx

把 `deploy/nginx-sciencehelper.conf` 放到 `/etc/nginx/conf.d/sciencehelper.conf`，然后检查并重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 4. 开通 HTTPS

确认两个域名都已解析后，使用 Certbot 申请证书：

```bash
sudo certbot --nginx -d www.sciencehelper.cn
```

选择将 HTTP 自动跳转到 HTTPS。完成后验证：

```bash
curl -I https://www.sciencehelper.cn
```

## 5. 微信 Native 支付

阿里云现有项目已经实现微信 Native 支付。算法平台可以复用底层商户配置与支付 SDK；算法入驻支付仍建议使用独立订单类型，避免与会员权益混用。

线上现有前端使用的接口契约是：

```text
POST /api/youxin/membership/order
GET  /api/youxin/membership/order/{out_trade_no}
```

下单成功后返回 `qr_url`、`amount`、`out_trade_no` 与 `mode`，前端每 3 秒查询订单状态，收到 `status: "paid"` 后开通权益。

该接口目前绑定的是“由心会员”档位与会员权益，不能直接用于算法个体 ¥299 入驻。后端应复用同一个 Native 支付服务，但新增独立的商品、订单类型与权益处理，例如：

```text
plan_code: algorithm_provider_year_299
order_type: algorithm_provider_onboarding
amount: 29900  # 单位：分，由服务端固定，禁止信任前端金额
```

推荐为算法平台增加独立接口：

```text
POST /api/sciencehelper/provider/orders
GET  /api/sciencehelper/provider/orders/{out_trade_no}
```

支付回调完成金额核对和幂等处理后，将申请人的 `provider_status` 更新为 `active`。前端再使用返回的真实 `qr_url` 替换当前演示二维码，并根据轮询结果自动进入需求大厅。

## 6. 登录注册接口

当前 `index.html` 已包含完整的登录/注册交互与本地会话演示。生产环境将浏览器本地会话替换为服务端认证接口：

```text
POST /api/auth/register       # 手机号/邮箱、密码、显示名称
POST /api/auth/login          # 手机号/邮箱 + 密码
POST /api/auth/logout         # 撤销当前会话
GET  /api/auth/me             # 返回当前用户
POST /api/auth/password/reset # 通过安全的账户恢复流程重置密码
```

注册不再使用短信验证码或验证码倒计时。实现要求：密码使用 Argon2id 或 bcrypt 哈希，注册与登录接口做 IP/账号频控和设备风控，登录使用 HttpOnly、Secure、SameSite Cookie，会话服务端可撤销；不要把密码或真实支付凭证写入 `localStorage`。当前本地原型的 `localStorage` 仅用于离线演示。

## 7. 通知与站内交流

当前页面提供通知已读、需求方会话、消息发送和移动端会话切换。生产环境建议将本地数据替换为：

```text
GET   /api/notifications                # 通知列表与未读数
POST  /api/notifications/read           # 标记单条或全部已读
GET   /api/conversations                # 当前用户会话列表
GET   /api/conversations/{id}/messages  # 会话消息
POST  /api/conversations/{id}/messages  # 发送站内消息
```

消息接口需要校验当前用户是否属于会话，服务端保存发送者、接收者、项目关联关系和时间戳；涉及交付文件时使用受控文件空间，不要把敏感数据直接塞进消息正文。
