// ============ 配置 ============
let CONFIG = {
    tenantName: 'PartnerDemo',
    frontendUrl: 'http://localhost:55411'
};

// ============ 状态 ============
let currentUser = null;
let authToken = null;
let ssoData = null;  // 存储 ssoToken 和 userCode
let aiinstockLoaded = false;

// ============ 租户名称应用 ============
function applyTenantName(name) {
    document.title = `${name} - 模拟合作方网站`;
    document.getElementById('tenantLogo').innerHTML = name;
    document.getElementById('loginTitle').textContent = `登录 ${name}`;
    document.getElementById('tenantTabName').textContent = name;
    document.getElementById('welcomeDesc').textContent =
        `这是 ${name} 模拟页面。点击上方「AiinStock 行情」标签，将通过 SSO 联合登录进入 AiinStock 平台查看实时行情数据。`;
}

// ============ 初始化 ============
async function init() {
    // 获取配置
    try {
        const resp = await fetch('/api/config');
        const data = await resp.json();
        CONFIG.tenantName = data.tenantName || CONFIG.tenantName;
        CONFIG.frontendUrl = data.frontendUrl;
        applyTenantName(CONFIG.tenantName);
    } catch (e) {
        console.error('获取配置失败', e);
    }

    // localStorage 保存的 URL 优先
    const savedUrl = localStorage.getItem('tenant_frontend_url');
    if (savedUrl) {
        CONFIG.frontendUrl = savedUrl;
    }
    document.getElementById('frontendUrlInput').value = CONFIG.frontendUrl;

    // 检查本地存储的登录状态
    const savedToken = localStorage.getItem('tenant_token');
    if (savedToken) {
        authToken = savedToken;
        await loadUserInfo();
    }

    log('info', '页面初始化完成');
}

// ============ H5 地址配置 ============
function applyFrontendUrl() {
    const input = document.getElementById('frontendUrlInput');
    const url = input.value.trim();
    if (!url) {
        log('error', 'H5 地址不能为空');
        return;
    }
    CONFIG.frontendUrl = url;
    localStorage.setItem('tenant_frontend_url', url);
    // 重置 iframe 状态，重新加载
    aiinstockLoaded = false;
    resetAiinStockTab();
    loadAiinStock();
    log('info', `H5 地址已更新: ${url}`);
}

// ============ 登录相关 ============
async function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('loginError');

    errorEl.classList.add('hidden');

    try {
        const resp = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await resp.json();

        if (data.success) {
            authToken = data.data.token;
            localStorage.setItem('tenant_token', authToken);
            currentUser = data.data.user;

            log('success', `登录成功: ${currentUser.email}`);
            await loadUserInfo();
        } else {
            errorEl.textContent = data.message;
            errorEl.classList.remove('hidden');
            log('error', `登录失败: ${data.message}`);
        }
    } catch (error) {
        errorEl.textContent = '网络错误，请重试';
        errorEl.classList.remove('hidden');
        log('error', `登录异常: ${error.message}`);
    }
}

async function loadUserInfo() {
    try {
        const resp = await fetch('/api/user', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await resp.json();

        if (data.success) {
            currentUser = data.data;
            showMainPage();
        } else {
            logout();
        }
    } catch (error) {
        logout();
    }
}

function logout() {
    authToken = null;
    currentUser = null;
    ssoData = null;
    aiinstockLoaded = false;
    localStorage.removeItem('tenant_token');

    document.getElementById('loginPage').classList.remove('hidden');
    document.getElementById('mainPage').classList.add('hidden');
    document.getElementById('userInfo').classList.add('hidden');

    // 重置 iframe
    resetAiinStockTab();

    log('info', '已退出登录');
}

function showMainPage() {
    document.getElementById('loginPage').classList.add('hidden');
    document.getElementById('mainPage').classList.remove('hidden');
    document.getElementById('userInfo').classList.remove('hidden');

    // 更新用户信息显示
    const name = currentUser.nickname || currentUser.email;
    document.getElementById('userName').textContent = name;
    document.getElementById('userAvatar').textContent = name[0].toUpperCase();
    document.getElementById('welcomeName').textContent = name;

    // 更新账户信息
    document.getElementById('infoEmail').textContent = currentUser.email;
    document.getElementById('infoNickname').textContent = currentUser.nickname || '-';
    document.getElementById('infoTimezone').textContent = currentUser.timezone || '-';
    document.getElementById('infoLanguage').textContent = currentUser.language || '-';
}

// ============ Tab 切换 ============
function switchTab(tabName) {
    // 更新 tab 样式
    document.querySelectorAll('.tab-nav .tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // 更新内容显示
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabName}`);
    });

    log('info', `切换到 ${tabName} 标签`);

    // 如果切换到 AiinStock 且未加载过，则加载
    if (tabName === 'aiinstock' && !aiinstockLoaded) {
        loadAiinStock();
    }
}

// ============ AiinStock 加载 ============
async function loadAiinStock() {
    const loading = document.getElementById('aiinstockLoading');
    const errorBox = document.getElementById('aiinstockError');
    const iframe = document.getElementById('aiinstockIframe');

    // 显示 loading
    loading.classList.remove('hidden');
    errorBox.classList.add('hidden');
    iframe.classList.add('hidden');

    try {
        // Step 1: 获取 SSO Token
        updateLoadingStatus('正在获取 SSO Token...', '调用 /api/aiinstock/sso-token');
        log('api', '请求获取 SSO Token...');

        const resp = await fetch('/api/aiinstock/sso-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await resp.json();

        if (!data.success) {
            throw new Error(data.message || '获取 SSO Token 失败');
        }

        ssoData = data.data;
        log('success', `获取 SSO Token 成功: ssoToken=${ssoData.ssoToken.substring(0, 10)}..., userCode=${ssoData.userCode}`);

        // Step 2: 构造 URL 并加载 iframe
        updateLoadingStatus('正在加载 AiinStock...', '');

        const iframeUrl = `${CONFIG.frontendUrl}/#/main?ssoToken=${ssoData.ssoToken}&userCode=${ssoData.userCode}`;
        log('info', `加载 iframe: ${iframeUrl}`);

        iframe.onload = () => {
            loading.classList.add('hidden');
            iframe.classList.remove('hidden');
            aiinstockLoaded = true;
            log('success', 'AiinStock 页面加载完成');
        };

        iframe.onerror = () => {
            showAiinStockError('iframe 加载失败');
        };

        iframe.src = iframeUrl;

    } catch (error) {
        log('error', `加载失败: ${error.message}`);
        showAiinStockError(error.message);
    }
}

function updateLoadingStatus(status, detail) {
    document.getElementById('loadingStatus').textContent = status;
    document.getElementById('loadingDetail').textContent = detail;
}

function showAiinStockError(message) {
    document.getElementById('aiinstockLoading').classList.add('hidden');
    document.getElementById('aiinstockError').classList.remove('hidden');
    document.getElementById('errorMessage').textContent = message;
}

function resetAiinStockTab() {
    const loading = document.getElementById('aiinstockLoading');
    const errorBox = document.getElementById('aiinstockError');
    const iframe = document.getElementById('aiinstockIframe');

    loading.classList.remove('hidden');
    errorBox.classList.add('hidden');
    iframe.classList.add('hidden');
    iframe.src = 'about:blank';

    updateLoadingStatus('正在获取登录凭证...', '');
}

// ============ postMessage 回调（SSO 消息通信）============
// 监听来自 AiinStock iframe 的消息
window.addEventListener('message', async (event) => {
    // 安全校验：仅允许来自 AiinStock 域名的消息
    if (!event.origin.endsWith('.aiinstock.com')) {
        return;
    }

    // 记录所有收到的消息（用于调试）
    log('msg-recv', `收到 postMessage`, {
        origin: event.origin,
        data: event.data
    });

    const messageType = event.data?.type;

    // 处理 Token 过期通知
    if (messageType === 'AIINSTOCK_TOKEN_EXPIRED') {
        log('info', 'AiinStock 通知 Token 已过期，等待 SSO 请求...');
        return;
    }

    // 处理关闭 WebView 请求
    if (messageType === 'AIINSTOCK_CLOSE_WEBVIEW') {
        log('info', 'AiinStock 请求关闭 WebView');
        // 在实际应用中可能需要执行关闭操作
        return;
    }

    // 处理 SSO 请求
    if (messageType !== 'AIINSTOCK_SSO_REQUEST') {
        log('info', `未知消息类型: ${messageType}`);
        return;
    }

    log('info', `识别为 SSO 请求，requestId=${event.data.requestId}`);

    // 检查用户登录状态
    if (!authToken || !currentUser) {
        const errorResponse = {
            type: 'AIINSTOCK_SSO_RESPONSE',
            requestId: event.data.requestId,
            error: '用户未登录'
        };
        log('msg-send', `发送 postMessage (错误响应)`, {
            target: event.origin,
            data: errorResponse
        });
        event.source.postMessage(errorResponse, event.origin);
        return;
    }

    try {
        // 调用后端获取 ssoToken
        log('api', '调用后端接口获取 SSO Token...');
        const response = await fetch('/api/aiinstock/sso-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();
        log('api', `后端响应`, data);

        if (!data.success) {
            throw new Error(data.message || '获取 SSO Token 失败');
        }

        // 更新本地存储的 ssoData
        ssoData = data.data;

        // 构造响应消息
        const successResponse = {
            type: 'AIINSTOCK_SSO_RESPONSE',
            requestId: event.data.requestId,
            ssoToken: ssoData.ssoToken,
            userCode: ssoData.userCode
        };

        log('msg-send', `发送 postMessage (成功响应)`, {
            target: event.origin,
            data: {
                ...successResponse,
                ssoToken: ssoData.ssoToken.substring(0, 10) + '...'  // 日志中隐藏完整 token
            }
        });

        // 通过 postMessage 返回结果
        event.source.postMessage(successResponse, event.origin);

    } catch (error) {
        const errorResponse = {
            type: 'AIINSTOCK_SSO_RESPONSE',
            requestId: event.data.requestId,
            error: error.message || '获取登录凭证失败'
        };
        log('msg-send', `发送 postMessage (错误响应)`, {
            target: event.origin,
            data: errorResponse
        });
        event.source.postMessage(errorResponse, event.origin);
    }
});

// ============ 调试日志 ============
function log(type, message, data = null) {
    const logsEl = document.getElementById('debugLogs');
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });

    const entry = document.createElement('div');
    entry.className = 'log-entry';

    // 为 postMessage 相关日志添加特殊样式
    if (type === 'msg-recv') {
        entry.classList.add('msg-recv');
    } else if (type === 'msg-send') {
        entry.classList.add('msg-send');
    }

    // 构建日志 HTML
    let html = `
        <div class="log-header">
            <span class="log-time">${time}</span>
            <span class="log-type ${type}">${formatLogType(type)}</span>
        </div>
        <div class="log-message">${escapeHtml(message)}</div>
    `;

    // 如果有数据，格式化显示
    if (data !== null) {
        const dataStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        html += `<div class="log-data">${escapeHtml(dataStr)}</div>`;
    }

    entry.innerHTML = html;
    logsEl.insertBefore(entry, logsEl.firstChild);

    // 限制日志数量
    while (logsEl.children.length > 100) {
        logsEl.removeChild(logsEl.lastChild);
    }
}

function formatLogType(type) {
    const typeMap = {
        'info': 'INFO',
        'api': 'API',
        'error': 'ERROR',
        'success': 'OK',
        'msg-recv': 'RECV',
        'msg-send': 'SEND'
    };
    return typeMap[type] || type.toUpperCase();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function clearLogs() {
    document.getElementById('debugLogs').innerHTML = '';
}

function toggleDebugPanel() {
    const panel = document.getElementById('debugPanel');
    const btn = panel.querySelector('.btns button:last-child');

    panel.classList.toggle('collapsed');
    btn.textContent = panel.classList.contains('collapsed') ? '展开' : '收起';
}

// ============ 测试功能 ============

// 测试：主动向 iframe 发送 SSO 响应（模拟完整流程）
async function testSendSsoResponse() {
    const iframe = document.getElementById('aiinstockIframe');
    if (!iframe || !iframe.contentWindow) {
        log('error', '测试失败: iframe 未加载');
        return;
    }

    if (!authToken || !currentUser) {
        log('error', '测试失败: 用户未登录');
        return;
    }

    try {
        log('api', '测试: 获取新的 SSO Token...');
        const response = await fetch('/api/aiinstock/sso-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.message || '获取 SSO Token 失败');
        }

        ssoData = data.data;

        // 向 iframe 发送测试响应
        const testResponse = {
            type: 'AIINSTOCK_SSO_RESPONSE',
            requestId: 'test_' + Date.now(),
            ssoToken: ssoData.ssoToken,
            userCode: ssoData.userCode
        };

        log('msg-send', '测试: 向 iframe 发送 SSO 响应', {
            target: CONFIG.frontendUrl,
            data: {
                ...testResponse,
                ssoToken: testResponse.ssoToken.substring(0, 10) + '...'
            }
        });

        iframe.contentWindow.postMessage(testResponse, CONFIG.frontendUrl);
        log('success', '测试响应已发送');
    } catch (error) {
        log('error', `测试失败: ${error.message}`);
    }
}

// ============ JS Bridge 模拟 ============

function toggleBridgeSim() {
    document.getElementById('bridgeSim').classList.toggle('collapsed');
}

/** 重置所有步骤到初始状态 */
function resetBridgeSteps() {
    for (let i = 1; i <= 5; i++) {
        const step = document.getElementById(`bridgeStep${i}`);
        step.className = 'bridge-step';
    }
    document.getElementById('bridgeStep1Code').textContent = 'window.AiinStockBridge — 等待启动';
    document.getElementById('bridgeStep2Code').textContent = '等待上一步...';
    document.getElementById('bridgeStep3Code').textContent = '等待上一步...';
    document.getElementById('bridgeStep4Code').textContent = '等待上一步...';
    document.getElementById('bridgeStep5Code').textContent = '等待上一步...';
}

/** 设置步骤状态 */
function setStepState(stepNum, state, codeText) {
    const step = document.getElementById(`bridgeStep${stepNum}`);
    step.className = `bridge-step ${state}`;
    if (codeText !== undefined) {
        document.getElementById(`bridgeStep${stepNum}Code`).textContent = codeText;
    }
}

/** 延迟工具 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/** 运行 JS Bridge 模拟流程 */
async function runBridgeSimulation() {
    const btn = document.getElementById('bridgeSimBtn');

    // 检查登录
    if (!authToken || !currentUser) {
        log('error', '[Bridge 模拟] 请先登录');
        return;
    }

    // 禁用按钮
    btn.disabled = true;
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" style="animation:spin 0.8s linear infinite"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="30 70"/></svg> 模拟中...';

    resetBridgeSteps();
    log('info', '[Bridge 模拟] ===== 开始 JS Bridge 模拟 =====');

    try {
        // ── Step 1: H5 检测 Bridge ──
        setStepState(1, 'active', 'typeof window.AiinStockBridge → "object" ✓');
        log('info', '[Bridge 模拟] Step 1: H5 检测到 window.AiinStockBridge 存在');
        await delay(600);
        setStepState(1, 'done');

        // ── Step 2: H5 调用 getSsoToken ──
        const callbackName = `__aiinstock_sso_cb_${Date.now()}`;
        setStepState(2, 'active', `AiinStockBridge.getSsoToken("${callbackName}")`);
        log('info', `[Bridge 模拟] Step 2: H5 调用 getSsoToken`, {
            code: `AiinStockBridge.getSsoToken("${callbackName}")`,
            callbackName: callbackName
        });
        await delay(800);
        setStepState(2, 'done');

        // ── Step 3: App 调用后端 ──
        setStepState(3, 'active', 'POST /api/aiinstock/sso-token ...');
        log('api', '[Bridge 模拟] Step 3: App 调用合作方后端获取 SSO Token...');

        const response = await fetch('/api/aiinstock/sso-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.message || '获取 SSO Token 失败');
        }

        ssoData = data.data;
        const tokenPreview = ssoData.ssoToken.substring(0, 20) + '...';

        setStepState(3, 'done', `✓ ssoToken=${tokenPreview}, userCode=${ssoData.userCode}`);
        log('success', '[Bridge 模拟] Step 3: 后端返回成功', {
            ssoToken: tokenPreview,
            userCode: ssoData.userCode
        });
        await delay(500);

        // ── Step 4: App 执行回调 ──
        const callbackPayload = {
            ssoToken: ssoData.ssoToken,
            userCode: ssoData.userCode
        };
        const callbackCode = `window["${callbackName}"](${JSON.stringify({ ssoToken: tokenPreview, userCode: ssoData.userCode })})`;

        setStepState(4, 'active', callbackCode);
        log('info', `[Bridge 模拟] Step 4: App 执行回调`, {
            code: callbackCode,
            实际payload: { ssoToken: tokenPreview, userCode: ssoData.userCode }
        });

        // 真正在 window 上注册并执行回调，模拟完整流程
        window[callbackName] = function(result) {
            log('success', `[Bridge 模拟] 回调 ${callbackName} 被调用`, result);
        };
        window[callbackName]({ ssoToken: tokenPreview, userCode: ssoData.userCode });
        delete window[callbackName];

        await delay(600);
        setStepState(4, 'done');

        // ── Step 5: H5 完成登录 ──
        setStepState(5, 'active', '使用 ssoToken 调用登录接口...');
        log('info', '[Bridge 模拟] Step 5: H5 使用 ssoToken 完成登录');
        await delay(500);
        setStepState(5, 'done', `✓ 登录成功 (userCode=${ssoData.userCode})`);

        log('success', '[Bridge 模拟] ===== JS Bridge 模拟完成 =====');

    } catch (error) {
        // 找到当前激活的步骤并标记为错误
        for (let i = 1; i <= 5; i++) {
            const step = document.getElementById(`bridgeStep${i}`);
            if (step.classList.contains('active')) {
                setStepState(i, 'error', `✗ ${error.message}`);
                break;
            }
        }
        log('error', `[Bridge 模拟] 失败: ${error.message}`);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14"><polygon points="5,3 19,12 5,21" fill="currentColor"/></svg> 开始模拟';
    }
}

// ============ 代码示例 Tab 切换 ============
function switchCodeTab(tabName) {
    // 更新 tab 高亮
    document.querySelectorAll('.code-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.codeTab === tabName);
    });
    // 切换内容
    document.querySelectorAll('.code-tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `codeTab-${tabName}`);
    });
    // 切换后重新初始化复制按钮（新显示的 pre 需要按钮）
    initCopyButtons();
}

// ============ 文档模块切换 ============
function initGuideNav() {
    document.querySelectorAll('.guide-nav .nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const section = item.dataset.section;
            // 更新导航高亮
            document.querySelectorAll('.guide-nav .nav-item').forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            // 切换内容区
            document.querySelectorAll('.guide-section').forEach(s => s.classList.remove('active'));
            document.getElementById(`guide-${section}`).classList.add('active');
        });
    });
}

// ============ 代码块复制按钮 ============
function initCopyButtons() {
    // 复制图标 SVG
    const copyIcon = '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    // 勾选图标 SVG
    const checkIcon = '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';

    document.querySelectorAll('.guide-page pre, .tenant-page .code-block pre').forEach(pre => {
        // 避免重复添加
        if (pre.querySelector('.btn-copy')) return;
        const btn = document.createElement('button');
        btn.className = 'btn-copy';
        btn.title = '复制代码';
        btn.innerHTML = copyIcon;
        btn.addEventListener('click', async () => {
            const code = pre.querySelector('code');
            const text = (code || pre).textContent;
            try {
                await navigator.clipboard.writeText(text);
                btn.innerHTML = checkIcon;
                btn.classList.add('copied');
                setTimeout(() => {
                    btn.innerHTML = copyIcon;
                    btn.classList.remove('copied');
                }, 2000);
            } catch (e) {
                // fallback
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.cssText = 'position:fixed;opacity:0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                btn.innerHTML = checkIcon;
                btn.classList.add('copied');
                setTimeout(() => {
                    btn.innerHTML = copyIcon;
                    btn.classList.remove('copied');
                }, 2000);
            }
        });
        pre.appendChild(btn);
    });
}

// ============ 启动 ============
init();
initGuideNav();
initCopyButtons();
