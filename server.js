const express = require('express');
const crypto = require('crypto');
const path = require('path');

// 使用 node-fetch v2 (CommonJS)
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============ 配置 ============
const CONFIG = {
    // 租户名称（合作方名称，修改此处即可全局生效）
    tenantName: 'PartnerDemo',
    // AiinStock API 地址
    apiBaseUrl: 'https://dev-api.aiinstock.com',
    // AiinStock 前端地址（iframe 嵌入地址）
    frontendUrl: 'http://localhost:55411',
    // 合作方凭证（生产环境应从环境变量或配置中心读取）
    apiKey: 'G2UbbwueT76qJ7y55AjbHbAKloEmQyxpTmYuddGK8bVEo8khBxHzszKKcmm64Er2',
    apiSecret: '04LPm7FZS7xs4r96v376gR5CJNZaWjOsHg8YvsXmjJNzeXfav8TNf8Gkr9wwpWHQ'
};

// ============ 模拟用户数据库 ============
const MOCK_USERS = {
    'demo': {
        id: 1,
        email: 'demo@partnerdemo.com',
        nickname: 'Demo User',
        password: '123456',
        timezone: 'Asia/Shanghai',
        language: 'zh-CN'
    },
    'test': {
        id: 2,
        email: 'test@partnerdemo.com',
        nickname: 'Test User',
        password: '123456',
        timezone: 'America/New_York',
        language: 'en-US'
    }
};

// 用户会话存储（内存存储，仅用于演示）
const sessions = new Map();

// ============ 工具函数 ============

/**
 * URL 编码（与 Java URLEncoder.encode 行为一致）
 * Java URLEncoder 将空格编码为 +，而 encodeURIComponent 编码为 %20
 */
function urlEncode(value) {
    if (!value) return '';
    // encodeURIComponent 编码后，将 %20 替换为 +，以匹配 Java URLEncoder 行为
    return encodeURIComponent(value).replace(/%20/g, '+');
}

/**
 * 构造签名字符串（apiKey 不参与签名）
 */
function buildSignString(email, language, nickname, nonce, timestamp, timezone, walletAddress) {
    const params = [];
    if (email) params.push(`email=${urlEncode(email)}`);
    if (language) params.push(`language=${urlEncode(language)}`);
    if (nickname) params.push(`nickname=${urlEncode(nickname)}`);
    params.push(`nonce=${urlEncode(nonce)}`);
    params.push(`timestamp=${timestamp}`);
    if (timezone) params.push(`timezone=${urlEncode(timezone)}`);
    if (walletAddress) params.push(`walletAddress=${urlEncode(walletAddress)}`);
    return params.join('&');
}

/**
 * HMAC-SHA256 签名
 */
function sign(apiSecret, signString) {
    return crypto.createHmac('sha256', apiSecret).update(signString).digest('hex');
}

/**
 * 生成 UUID
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// ============ API 路由 ============

/**
 * 模拟登录接口
 */
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    const user = MOCK_USERS[username];
    if (!user || user.password !== password) {
        return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }

    // 生成会话 token
    const sessionToken = generateUUID();
    sessions.set(sessionToken, { userId: user.id, username });

    res.json({
        success: true,
        data: {
            token: sessionToken,
            user: {
                id: user.id,
                email: user.email,
                nickname: user.nickname
            }
        }
    });
});

/**
 * 获取当前用户信息
 */
app.get('/api/user', (req, res) => {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    const session = sessions.get(token);

    if (!session) {
        return res.status(401).json({ success: false, message: '未登录' });
    }

    const user = MOCK_USERS[session.username];
    res.json({
        success: true,
        data: {
            id: user.id,
            email: user.email,
            nickname: user.nickname,
            timezone: user.timezone,
            language: user.language
        }
    });
});

/**
 * 获取 AiinStock SSO Token
 * 此接口由前端调用，后端负责保管 apiSecret 并调用 AiinStock API
 */
app.post('/api/aiinstock/sso-token', async (req, res) => {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    const session = sessions.get(token);

    if (!session) {
        return res.status(401).json({ success: false, message: '未登录' });
    }

    const user = MOCK_USERS[session.username];

    try {
        const timestamp = Date.now();
        const nonce = generateUUID();

        // 构造签名
        const signString = buildSignString(
            user.email,
            user.language,
            user.nickname,
            nonce,
            timestamp,
            user.timezone,
            null  // walletAddress
        );
        const signature = sign(CONFIG.apiSecret, signString);

        console.log('');
        console.log('========== SSO Token Request ==========');
        console.log('User:', user.email);
        console.log('Timestamp:', timestamp);
        console.log('Nonce:', nonce);
        console.log('Sign String:', signString);
        console.log('Signature:', signature);
        console.log('API Key:', CONFIG.apiKey);
        console.log('API Secret (first 10):', CONFIG.apiSecret.substring(0, 10) + '...');
        console.log('========================================');
        console.log('');

        // 构造请求体
        const requestBody = {
            email: user.email,
            nickname: user.nickname,
            timezone: user.timezone,
            language: user.language,
            timestamp: timestamp,
            nonce: nonce,
            sign: signature
        };

        console.log('Request Body:', JSON.stringify(requestBody, null, 2));

        // 调用 AiinStock API
        const response = await fetch(`${CONFIG.apiBaseUrl}/member/sso/public/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': CONFIG.apiKey
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        console.log('AiinStock Response:', JSON.stringify(data, null, 2));

        const isSuccess = data.success === true || data.code === 0 || data.code === 'SUCCESS';
        if (isSuccess && data.data?.ssoToken) {
            res.json({
                success: true,
                data: {
                    ssoToken: data.data.ssoToken,
                    userCode: data.data.userCode
                }
            });
        } else {
            res.status(400).json({
                success: false,
                message: data.message || '获取 SSO Token 失败',
                detail: data
            });
        }
    } catch (error) {
        console.error('SSO Token Error:', error);
        res.status(500).json({
            success: false,
            message: '服务器错误: ' + error.message
        });
    }
});

/**
 * 获取配置信息（前端使用）
 */
app.get('/api/config', (req, res) => {
    res.json({
        tenantName: CONFIG.tenantName,
        frontendUrl: CONFIG.frontendUrl
    });
});

// ============ 启动服务 ============
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log('');
    console.log('========================================');
    console.log(`  ${CONFIG.tenantName} Demo Server`);
    console.log('========================================');
    console.log(`  本地地址: http://localhost:${PORT}`);
    console.log('');
    console.log('  测试账号:');
    console.log('    用户名: demo  密码: 123456');
    console.log('    用户名: test  密码: 123456');
    console.log('');
    console.log('  AiinStock H5: ' + CONFIG.frontendUrl);
    console.log('========================================');
    console.log('');
});
