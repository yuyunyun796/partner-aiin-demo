# 合作方 SSO 联调演示

模拟合作方网站，通过 iframe 集成 AiinStock H5，演示 SSO 联合登录流程。

租户名称可在 `server.js` 的 `CONFIG.tenantName` 中修改，前端会自动同步。

## 快速开始

```bash
# 安装依赖
npm install

# 启动服务
npm start
```

服务启动后访问: http://localhost:3000

## 测试账号

| 用户名 | 密码 | 邮箱 | 说明 |
|-------|------|------|------|
| demo | 123456 | demo@partnerdemo.com | 时区 Asia/Shanghai, 语种 zh-CN |
| test | 123456 | test@partnerdemo.com | 时区 America/New_York, 语种 en-US |

## 功能说明

### 1. 模拟登录
- 访问页面后，使用测试账号登录
- 登录成功后进入主页面，左侧为菜单，右侧为 AiinStock iframe

### 2. SSO 联合登录
- 主页面通过 iframe 加载 AiinStock H5
- 当 AiinStock H5 检测到需要登录时，会通过 postMessage 发送 `AIINSTOCK_SSO_REQUEST`
- 父页面收到请求后：
  1. 调用后端接口 `/api/aiinstock/sso-token` 获取 ssoToken
  2. 后端使用 apiSecret 签名并调用 AiinStock API
  3. 将 ssoToken 和 userCode 通过 postMessage 返回给 iframe
- AiinStock H5 使用 ssoToken 完成自动登录

### 3. 调试面板
- 页面底部有调试面板，显示所有 SSO 相关的日志
- 可以清空日志或收起面板

## 配置说明

在 `server.js` 中可以修改以下配置：

```javascript
const CONFIG = {
    // 租户名称（修改此处即可全局生效）
    tenantName: 'PartnerDemo',
    // AiinStock API 地址
    apiBaseUrl: 'https://dev-api.aiinstock.com',
    // AiinStock 前端地址（iframe 嵌入地址）
    frontendUrl: 'http://localhost:55411',
    // 合作方凭证
    apiKey: 'xxx',
    apiSecret: 'xxx'
};
```

## 目录结构

```
partner-sso-demo/
├── package.json      # 项目配置
├── server.js         # Express 后端服务
├── public/
│   └── index.html    # 前端页面
└── README.md         # 说明文档
```

## 注意事项

1. **apiSecret 安全**：apiSecret 存储在服务端，不会暴露到前端
2. **CORS**：iframe 跨域通信使用 postMessage，不存在 CORS 问题
3. **本地测试**：由于 iframe 加载的是 HTTPS 地址，本地测试需要确保网络通畅
