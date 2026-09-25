const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');

const ROOT = __dirname;
const DATA_DIR = process.env.PAPERPILOT_DATA_DIR || path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}
const PORT = Number(process.env.PORT || 3000);
const WECHAT_PAY_ENABLED = process.env.WECHAT_PAY_ENABLED === 'true';
const WECHAT_APPID = process.env.WECHAT_APPID || '';
const WECHAT_MCHID = process.env.WECHAT_MCHID || '';
const WECHAT_API_V2_KEY = process.env.WECHAT_API_V2_KEY || '';
const WECHAT_NOTIFY_URL = process.env.WECHAT_NOTIFY_URL || '';
const RUIJING_SKU_URL = process.env.RUIJING_SKU_URL || '';
const RUIJING_SKU_TOKEN = process.env.RUIJING_SKU_TOKEN || '';
const OVERPASS_URL = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
const RESEARCH_MODEL_URL = (process.env.RESEARCH_MODEL_URL || 'http://127.0.0.1:8091').replace(/\/$/, '');
const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/$/, '');
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const EUROPE_PMC_URL = (process.env.EUROPE_PMC_URL || 'https://www.ebi.ac.uk/europepmc/webservices/rest').replace(/\/$/, '');
const pendingCheckouts = new Set();

const seed = {
  reagents: [
    { id: 'r-001', name: 'RNeasy Plus Mini Kit', brand: 'QIAGEN', category: 'RNA 提取', spec: '50 preps', price: 2680, stock: 18, seller: 'QIAGEN 官方旗舰店', rating: 4.9, tags: ['RNA-seq', '去基因组 DNA'], color: '#d8f36a' },
    { id: 'r-002', name: 'PrimeScript™ IV 1st strand cDNA Synthesis Mix', brand: 'Takara', category: '逆转录', spec: '100 rxns', price: 1980, stock: 32, seller: '宝生物科技', rating: 4.8, tags: ['cDNA', '高 GC'], color: '#94d8d2' },
    { id: 'r-003', name: 'TB Green® Premix Ex Taq™ II', brand: 'Takara', category: 'qPCR', spec: '200 rxns', price: 1680, stock: 9, seller: '宝生物科技', rating: 4.8, tags: ['qPCR', 'SYBR'], color: '#ffb49a' },
    { id: 'r-004', name: 'NEBNext® Ultra II RNA Library Prep Kit', brand: 'NEB', category: '建库', spec: '24 rxns', price: 12600, stock: 6, seller: '纽英伦生物', rating: 4.7, tags: ['RNA-seq', '建库'], color: '#c4b5fd' },
    { id: 'r-005', name: 'RNase Inhibitor, Murine', brand: 'NEB', category: '酶与抑制剂', spec: '2,500 units', price: 920, stock: 41, seller: '纽英伦生物', rating: 4.9, tags: ['RNase-free', '逆转录'], color: '#f5dd72' }
  ],
  papers: [
    { id: 'p-001', title: 'Single-cell transcriptomic analysis of the human lung', journal: 'Nature Communications', year: 2024, status: '已解析', reagentCount: 14, methodCount: 6, source: '用户工作区', addedAt: '今天 09:42' },
    { id: 'p-002', title: 'A scalable workflow for spatial transcriptomics', journal: 'Cell', year: 2023, status: '待复核', reagentCount: 9, methodCount: 4, source: 'PubMed', addedAt: '昨天 16:18' }
  ],
  cart: [{ reagentId: 'r-002', quantity: 1 }, { reagentId: 'r-005', quantity: 2 }],
  orders: [{ id: 'PP-20260904-018', status: '待商家确认', total: 3820, itemCount: 3, createdAt: '2026-09-04 10:06', seller: '宝生物科技' }],
  questions: [{
    id: 'q-demo',
    question: '肺组织单细胞测序中，怎样兼顾细胞活性与免疫细胞回收率？',
    status: '编辑审核中',
    createdAt: '2026-09-04 11:20',
    tasks: [
      { id: 'e-demo-1', angle: '样本解离策略', editor: '林编辑 · 单细胞', status: '已返回', entry: '冷保存时间控制在 6 小时内；将胶原酶 D 与 DNase I 联用，并用 40 μm 滤网去除团块。对纤维化样本应单独优化消化时间。', score: 92, selected: true },
      { id: 'e-demo-2', angle: '免疫细胞偏倚', editor: '陈编辑 · 免疫组学', status: '已返回', entry: '强消化会降低部分表面抗原并改变髓系细胞比例。建议用流式结果校验 scRNA-seq 的主要免疫亚群比例。', score: 88, selected: false },
      { id: 'e-demo-3', angle: '质控与可比性', editor: '周编辑 · 生信', status: '待审核', entry: '', score: null, selected: false }
    ]
  }],
  knowledgeBase: [{ id: 'kb-demo-1', questionId: 'q-demo', title: '样本解离策略', content: '冷保存时间控制在 6 小时内；将胶原酶 D 与 DNase I 联用，并用 40 μm 滤网去除团块。对纤维化样本应单独优化消化时间。', score: 92, source: '林编辑 · 单细胞', createdAt: '2026-09-04 11:48' }],
  ruijingCatalog: [
    { sku: 'RJ-RNA-001', name: 'RNeasy Plus Mini Kit', brand: 'QIAGEN', category: 'RNA 提取', spec: '50 preps', price: 2680, stock: 18, seller: 'QIAGEN 官方旗舰店', tags: ['RNA-seq', '去基因组 DNA'], source: '锐竞平台样例目录' },
    { sku: 'RJ-RT-014', name: 'PrimeScript™ IV 1st strand cDNA Synthesis Mix', brand: 'Takara', category: '逆转录', spec: '100 rxns', price: 1980, stock: 32, seller: '宝生物科技', tags: ['cDNA', '高 GC'], source: '锐竞平台样例目录' },
    { sku: 'RJ-QP-207', name: 'TB Green® Premix Ex Taq™ II', brand: 'Takara', category: 'qPCR', spec: '200 rxns', price: 1680, stock: 9, seller: '宝生物科技', tags: ['qPCR', 'SYBR'], source: '锐竞平台样例目录' },
    { sku: 'RJ-LIB-088', name: 'NEBNext® Ultra II RNA Library Prep Kit', brand: 'NEB', category: '建库', spec: '24 rxns', price: 12600, stock: 6, seller: '纽英伦生物', tags: ['RNA-seq', '建库'], source: '锐竞平台样例目录' }
  ],
  researchProjects: [],
  labProviders: [
    { id: 'lab-demo-1', name: '单细胞与组织处理服务平台', city: '深圳', capabilities: ['组织解离', '单细胞建库', '流式质控'], serviceCategories: ['单细胞测序'], verified: false, turnaround: '提交样本信息后评估', pricingNote: '按项目询价', contact: '平台站内联系', status: 'active', note: '平台示例服务范围，实验条件、档期与报价需由实验室确认。' },
    { id: 'lab-demo-2', name: '分子检测与表达分析平台', city: '广州', capabilities: ['RNA 提取', 'qPCR', '转录组建库'], serviceCategories: ['分子生物学'], verified: false, turnaround: '提交需求后评估', pricingNote: '按项目询价', contact: '平台站内联系', status: 'active', note: '平台示例服务范围，实验条件、档期与报价需由实验室确认。' }
  ],
  labRequests: [],
  skillRuns: [],
  models: [
    { id: 'model-deepseek-chat', name: 'DeepSeek Chat', version: 'v3.1', type: 'reasoning', description: '科研问题理解、研究方案拆解与采购上下文生成。', useCase: '研究问题路由', owner: '平台模型组', quality: 93, traffic: 62, calls: 842, status: 'active', evaluatedAt: '2026-09-22' },
    { id: 'model-methods-agent', name: 'Methods Agent', version: 'v2.0', type: 'methods', description: '从开放全文中抽取实验步骤、试剂和关键参数，并保留文献证据。', useCase: 'Methods 结构化', owner: '科研智能体组', quality: 91, traffic: 28, calls: 391, status: 'active', evaluatedAt: '2026-09-21' },
    { id: 'model-retrieval-reranker', name: 'Evidence Reranker', version: 'v0.8', type: 'retrieval', description: '对 PubMed 与 Europe PMC 结果进行相关性重排和开放全文优先筛选。', useCase: '文献检索', owner: '检索基础组', quality: 88, traffic: 10, calls: 144, status: 'canary', evaluatedAt: '2026-09-20' }
  ],
  users: [],
  sessions: [],
  settings: { wechatQr: '' }
};

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2));
}

function readStore() {
  ensureStore();
  const store = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  store.questions ||= seed.questions;
  store.knowledgeBase ||= seed.knowledgeBase;
  store.ruijingCatalog ||= seed.ruijingCatalog;
  store.researchProjects ||= [];
  store.researchTasks ||= [];
  store.labProviders ||= seed.labProviders;
  store.labRequests ||= [];
  store.skillRuns ||= [];
  store.models ||= seed.models;
  store.users ||= [];
  store.sessions ||= [];
  store.carts ||= {};
  store.reagents = (store.reagents || []).map(item => ({ status: 'active', tags: [], ...item }));
  for (const order of store.orders || []) if (order.status === '待支付' && order.expiresAt && Date.parse(order.expiresAt) < Date.now()) { order.status = '支付超时'; order.paymentStatus = 'expired'; }
  store.researchProjects = store.researchProjects.map(project => ({ ...project, papers: (project.papers || []).map(paper => ({ ...paper, title: cleanText(paper.title, 1000) })) }));
  const now = Date.now();
  store.sessions = store.sessions.filter(session => session.expiresAt > now);
  return store;
}

function writeStore(store) {
  const temporary = `${DATA_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(store, null, 2));
  fs.renameSync(temporary, DATA_FILE);
}

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(part => {
    const index = part.indexOf('=');
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }));
}

function sessionCookie(token, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `paperpilot_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function currentUser(req, store) {
  const token = parseCookies(req).paperpilot_session;
  const session = store.sessions.find(item => item.token === token && item.expiresAt > Date.now());
  return session ? store.users.find(user => user.id === session.userId) : null;
}

function passwordDigest(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password, digest) {
  const [salt, expected] = String(digest || '').split(':');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString('hex');
  return expected.length === actual.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

function createSession(store, user, res) {
  const token = crypto.randomBytes(32).toString('hex');
  store.sessions = store.sessions.filter(session => session.userId !== user.id);
  store.sessions.push({ token, userId: user.id, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  writeStore(store);
  res.setHeader('Set-Cookie', sessionCookie(token, 7 * 24 * 60 * 60));
}

function publicState(store, user) {
  return {
    reagents: store.reagents,
    cart: store.carts[user.id] || [],
    orders: store.orders.filter(order => order.userId === user.id),
    merchantOrders: store.orders.filter(order => (order.fulfillments || []).some(group => group.merchantId === user.id)).map(order => ({ id: order.id, status: order.status, paymentStatus: order.paymentStatus, createdAt: order.createdAt, shipping: order.paymentStatus === 'paid' ? order.shipping : null, fulfillments: order.fulfillments.filter(group => group.merchantId === user.id) })),
    ruijingCatalog: store.ruijingCatalog,
    researchProjects: store.researchProjects.filter(project => project.createdBy === user.id),
    researchTasks: store.researchTasks.filter(task => task.userId === user.id),
    publishedTasks: store.researchTasks.filter(task => task.status === '已发布' && task.visibility === 'public').slice(0, 30).map(({ id, topic, createdAt }) => ({ id, topic, createdAt })),
    labProviders: store.labProviders,
    labRequests: store.labRequests.filter(request => request.userId === user?.id || store.labProviders.find(provider => provider.id === request.labId)?.ownerUserId === user?.id),
    settings: { paymentEnabled: WECHAT_PAY_ENABLED },
    models: store.models,
    user: publicUser(user)
  };
}

function xmlEscape(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function xmlFromObject(values) {
  return `<xml>${Object.entries(values).map(([key, value]) => `<${key}><![CDATA[${String(value)}]]></${key}>`).join('')}</xml>`;
}

function wechatV2Sign(values) {
  const content = Object.entries(values).filter(([key, value]) => key !== 'sign' && value !== undefined && value !== null && String(value) !== '').sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${key}=${value}`).join('&');
  return crypto.createHash('md5').update(`${content}&key=${WECHAT_API_V2_KEY}`).digest('hex').toUpperCase();
}

function xmlFields(xml) {
  const values = {};
  for (const match of String(xml).matchAll(/<([a-z][a-z0-9_]*)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))<\/\1>/gi)) values[match[1]] = match[2] ?? match[3];
  return values;
}

function wechatTime(date) {
  // WeChat Pay V2 expects Asia/Shanghai wall-clock time, not UTC.
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 19).replace(/[-:T]/g, '');
}

async function wechatRequest(pathname, params) {
  params.sign = wechatV2Sign(params);
  const response = await fetch(`${process.env.WECHAT_PAY_API_BASE || 'https://api.mch.weixin.qq.com'}${pathname}`, { method: 'POST', headers: { 'Content-Type': 'application/xml; charset=utf-8' }, body: xmlFromObject(params), signal: AbortSignal.timeout(12000) });
  const values = xmlFields(await response.text());
  if (!response.ok || values.return_code !== 'SUCCESS' || values.result_code !== 'SUCCESS') throw new Error(values.err_code_des || values.return_msg || `微信接口错误: ${response.status}`);
  if (!values.sign || wechatV2Sign(values) !== values.sign) throw new Error('微信响应签名校验失败');
  return values;
}

async function createWechatNativeOrder(outTradeNo, amountCents, description) {
  if (!WECHAT_PAY_ENABLED || !WECHAT_APPID || !WECHAT_MCHID || !WECHAT_API_V2_KEY || !WECHAT_NOTIFY_URL) throw new Error('微信支付尚未配置完整');
  const params = {
    appid: WECHAT_APPID,
    mch_id: WECHAT_MCHID,
    nonce_str: crypto.randomBytes(16).toString('hex'),
    body: description.slice(0, 120),
    out_trade_no: outTradeNo,
    total_fee: String(amountCents),
    spbill_create_ip: '8.163.113.5',
    notify_url: WECHAT_NOTIFY_URL,
    trade_type: 'NATIVE',
    time_expire: wechatTime(new Date(Date.now() + 2 * 60 * 60 * 1000))
  };
  const values = await wechatRequest('/pay/unifiedorder', params);
  if (!values.code_url?.startsWith('weixin://')) throw new Error('微信未返回有效的 Native 二维码');
  return { mode: 'wechat-native', outTradeNo, qrUrl: await QRCode.toDataURL(values.code_url, { width: 280, margin: 2, errorCorrectionLevel: 'M' }) };
}

function orderLines(store, user, reagentIds) {
  const items = (store.carts[user.id] || []).filter(item => reagentIds.includes(item.reagentId)).map(item => ({ ...item, reagent: store.reagents.find(reagent => reagent.id === item.reagentId) })).filter(item => item.reagent && item.reagent.status !== 'inactive');
  return { items, total: items.reduce((sum, item) => sum + item.reagent.price * item.quantity, 0) };
}

function availableStock(store, reagentId) {
  const reagent = store.reagents.find(item => item.id === reagentId);
  const reserved = (store.orders || []).filter(order => order.paymentStatus === 'pending' && Date.parse(order.expiresAt || 0) > Date.now()).flatMap(order => order.items || []).filter(item => item.reagentId === reagentId).reduce((sum, item) => sum + item.quantity, 0);
  return (reagent?.stock || 0) - reserved;
}

function removeOrderItemsFromCart(store, order) {
  const ids = (order.items || []).map(item => item.reagentId);
  store.carts[order.userId] = (store.carts[order.userId] || []).filter(item => !ids.includes(item.reagentId));
}

function markOrderPaid(store, order, transactionId) {
  if (order.paymentStatus === 'paid') return;
  order.paymentStatus = 'paid'; order.status = '待商家确认'; order.transactionId = transactionId;
  order.paidAt = new Date().toISOString();
  for (const item of order.items) {
    const reagent = store.reagents.find(entry => entry.id === item.reagentId);
    if (reagent) reagent.stock = Math.max(0, reagent.stock - item.quantity);
  }
  removeOrderItemsFromCart(store, order);
  writeStore(store);
}

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function body(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 8e6) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (error) { reject(error); } });
    req.on('error', reject);
  });
}

function fallbackReply(messages, store) {
  const latest = messages[messages.length - 1]?.content || '';
  const mentioned = store.reagents.filter(item => latest.toLowerCase().includes(item.name.toLowerCase()) || latest.includes(item.category));
  const names = (mentioned.length ? mentioned : store.reagents.slice(0, 3)).map(item => item.name);
  if (latest.includes('试剂') || latest.includes('RNA')) {
    return `我先把这条需求拆成可执行步骤：\n\n1. 样本处理：优先确认是否需要去除基因组 DNA。\n2. RNA 提取：${names[0]}适合 50 个样本以内的小批量验证。\n3. 逆转录与定量：建议用 ${names[1] || 'PrimeScript™ IV'} 做 cDNA，再用 ${names[2] || 'TB Green® Premix'} 完成 qPCR。\n\n已从商城匹配 ${names.length} 个可采购试剂。你可以直接点“加入清单”，我会保留规格、库存和供应商，方便后续比价。`;
  }
  return `已收到。我可以帮你做三件事：检索同主题论文、抽取论文中的试剂与分析方法、把可购买的试剂整理进购物清单。\n\n当前工作区有 ${store.papers.length} 篇论文和 ${store.reagents.length} 个在售试剂。告诉我你的研究对象、实验类型或直接粘贴一段 Methods，我会继续拆解。`;
}

function keywordScore(text, item) {
  const source = `${item.name} ${item.brand} ${item.category} ${(item.tags || []).join(' ')}`.toLowerCase();
  const terms = String(text).toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/i).filter(term => term.length > 1);
  return terms.reduce((score, term) => score + (source.includes(term) ? (item.category.toLowerCase().includes(term) ? 4 : 2) : 0), 0) + (/(rna|转录组|单细胞|肺组织)/i.test(text) && /rna|建库|逆转录|qpcr/i.test(source) ? 2 : 0);
}

function recommendReagents(content, store) {
  return store.reagents.map(item => ({ ...item, matchScore: keywordScore(content, item), reason: `${item.category} · ${item.tags?.slice(0, 2).join(' / ') || '科研常用'}` })).sort((a, b) => b.matchScore - a.matchScore || b.rating - a.rating).slice(0, 3);
}

function fallbackArticle(text, store) {
  const reagents = store.reagents.filter(item => new RegExp(`${item.name}|${item.brand}|${item.category}|试剂|kit|reagent`, 'i').test(text)).slice(0, 8).map(item => ({ name: item.name, brand: item.brand, sku: item.sku || '', spec: item.spec, role: item.category, confidence: item.name === 'RNeasy Plus Mini Kit' ? 0.96 : 0.8 }));
  const methods = ['样本处理与解离', 'RNA 提取与质控', '文库构建或逆转录', '测序 / qPCR 数据分析'].filter(method => new RegExp(method.split('与')[0].split(' / ')[0].replace(/[（）]/g, ''), 'i').test(text) || text.length > 100).map(name => ({ name, keyParameters: '请回到 Methods 复核浓度、时间、温度和循环参数', analysis: '保留原始图表与统计阈值' }));
  return { summary: '已完成首轮结构化拆解，建议对货号、浓度、批次和关键参数进行原文复核。', reagents, methods: methods.length ? methods : [{ name: 'Methods 待进一步定位', keyParameters: '需要完整正文或补充材料', analysis: '待识别' }], parameters: ['样本来源', '处理时间', '质控阈值', '统计方法'], checks: ['货号与规格', '浓度与反应体系', '对照组与排除标准'] };
}

async function decomposeArticle(text, store) {
  try {
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const network = await callResearchNetwork('/v1/k2', {
      title: lines[0] || '未命名论文',
      methods: text,
      catalog: store.reagents,
      top_k: 8
    });
    const routes = network?.k2?.routes || [];
    const requirements = network?.adapter2?.requirements || [];
    if (routes.length || requirements.length) {
      const routedReagents = routes.map(item => ({
        ...(item.reagent || {}),
        name: item.reagent?.name || item.name || '未命名试剂',
        brand: item.reagent?.brand || '',
        sku: item.reagent?.sku || '',
        spec: item.reagent?.spec || '',
        role: item.reagent?.category || item.route || '其他',
        confidence: Math.min(0.98, 0.55 + Number(item.score || 0) / 20),
        route: item.route,
        reason: item.reason
      }));
      return {
        summary: 'Adapter2 已从标题与 Methods 抽取试剂需求，K2 已将需求路由到当前目录候选。请对原文证据、货号和规格进行复核。',
        reagents: routedReagents,
        methods: [{ name: 'Methods 结构化路由', keyParameters: requirements.map(item => item.name || item.role).join('；') || '请复核原文中的浓度、时间、温度和循环参数', analysis: 'K2 reagent route' }],
        parameters: ['样本来源', '处理时间', '质控阈值', '统计方法'],
        checks: ['原文证据位置', '货号与规格', '浓度与反应体系', '对照组与排除标准'],
        network: { adapter2: network.adapter2, k2: network.k2 }
      };
    }
  } catch (error) {
    console.warn(`[research-network] K2 unavailable: ${error.message}`);
  }
  if (!process.env.DEEPSEEK_API_KEY) return fallbackArticle(text, store);
  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({ model: DEEPSEEK_MODEL, temperature: 0.1, response_format: { type: 'json_object' }, messages: [
      { role: 'system', content: '你是科研文章拆解 skill。只根据用户给出的原文，不要补写未出现的货号和参数。返回 JSON：{"summary":"...","reagents":[{"name":"","brand":"","sku":"","spec":"","role":"","confidence":0}],"methods":[{"name":"","keyParameters":"","analysis":""}],"parameters":[],"checks":[]}。' },
      { role: 'user', content: text.slice(0, 50000) }
    ] })
  });
  if (!response.ok) throw new Error(`DeepSeek request failed: ${response.status}`);
  return JSON.parse((await response.json()).choices[0].message.content);
}

async function callDeepSeek(messages, store) {
  if (!process.env.DEEPSEEK_API_KEY) return fallbackReply(messages, store);
  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({ model: DEEPSEEK_MODEL, temperature: 0.25, messages: [
      { role: 'system', content: '你是 PaperPilot 的科研采购助手。回答要严谨、可追溯、简洁。解析论文时分成试剂、分析方法、关键参数和待核对项；不能捏造论文内容。若上下文有商城试剂，只推荐匹配度高的商品并说明依据。' },
      ...messages
    ] })
  });
  if (!response.ok) throw new Error(`DeepSeek request failed: ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || fallbackReply(messages, store);
}

async function decomposeQuestion(question) {
  try {
    const network = await callResearchNetwork('/v1/k1', { title: question, conclusion: '', max_subquestions: 5 });
    const routes = network?.k1?.routes || [];
    if (routes.length) return routes.map(route => ({ angle: route.aspect || route.route, editor: `K1 · ${route.route}`, question: route.subquestion, evidence: route.evidence }));
  } catch (error) {
    console.warn(`[research-network] K1 unavailable: ${error.message}`);
  }
  if (!process.env.DEEPSEEK_API_KEY) return [
    { angle: '研究边界与变量', editor: '王编辑 · 实验设计' },
    { angle: '实验方法与关键参数', editor: '林编辑 · 方法学' },
    { angle: '数据分析与评价指标', editor: '周编辑 · 生信分析' }
  ];
  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({ model: DEEPSEEK_MODEL, temperature: 0.1, response_format: { type: 'json_object' }, messages: [
      { role: 'system', content: '你是科研问题路由器 K 网络。把问题拆成 3 个可由专业编辑独立审核的方向。只返回 JSON：{"tasks":[{"angle":"方向","editor":"编辑专业角色"}]}。' },
      { role: 'user', content: question }
    ] })
  });
  if (!response.ok) throw new Error(`DeepSeek request failed: ${response.status}`);
  const data = await response.json();
  return JSON.parse(data.choices[0].message.content).tasks.slice(0, 5);
}

async function callResearchNetwork(endpoint, payload) {
  const response = await fetch(`${RESEARCH_MODEL_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(Number(process.env.RESEARCH_MODEL_TIMEOUT || 15000))
  });
  if (!response.ok) throw new Error(`research model request failed: ${response.status}`);
  return response.json();
}

async function getResearchNetwork(endpoint) {
  const response = await fetch(`${RESEARCH_MODEL_URL}${endpoint}`, {
    signal: AbortSignal.timeout(Number(process.env.RESEARCH_MODEL_TIMEOUT || 15000))
  });
  if (!response.ok) throw new Error(`research model request failed: ${response.status}`);
  return response.json();
}

function cleanText(value, limit = 10000) {
  return String(value || '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function extractMethodsFromXml(xml) {
  const sections = [];
  const sectionPattern = /<sec\b[^>]*>[\s\S]*?<title\b[^>]*>\s*(?:materials?\s+and\s+methods?|methods?|experimental\s+procedures?|methodology)\s*<\/title>([\s\S]*?)<\/sec>/gi;
  for (const match of String(xml || '').matchAll(sectionPattern)) sections.push(cleanText(match[1], 18000));
  if (sections.length) return sections.filter(Boolean).join('\n').slice(0, 30000);
  const text = cleanText(xml, 120000);
  const start = text.search(/\b(?:materials? and methods?|experimental procedures?|methodology)\b/i);
  if (start < 0) return '';
  const tail = text.slice(start);
  const next = tail.slice(80).search(/\b(?:results?|discussion|conclusions?)\b/i);
  return tail.slice(0, next >= 0 ? next + 80 : 30000).slice(0, 30000);
}

function parseJsonContent(content) {
  const cleaned = String(content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
  try { return JSON.parse(cleaned); } catch (_) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('模型未返回有效 JSON');
  }
}

async function deepSeekJson(system, user, timeout = 90000) {
  if (!process.env.DEEPSEEK_API_KEY) throw new Error('DeepSeek 未配置');
  const payload = { model: DEEPSEEK_MODEL, temperature: 0.1, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
  const request = async withFormat => fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify(withFormat ? { ...payload, response_format: { type: 'json_object' } } : payload),
    signal: AbortSignal.timeout(timeout)
  });
  let response = await request(true);
  if (!response.ok && [400, 404, 422].includes(response.status)) response = await request(false);
  if (!response.ok) throw new Error(`DeepSeek request failed: ${response.status}`);
  const data = await response.json();
  return parseJsonContent(data.choices?.[0]?.message?.content);
}

async function buildPubMedQuery(topic) {
  try {
    const result = await deepSeekJson(
      '你是 PubMed 检索智能体。把用户的科研课题转成简洁的英文 PubMed 检索式，只使用主题关键词和常用同义词，不写解释。只返回 JSON：{"query":"..."}。',
      String(topic).slice(0, 1000),
      30000
    );
    return cleanText(result.query, 600) || topic;
  } catch (error) {
    console.warn(`[pubmed-agent] query expansion unavailable: ${error.message}`);
    return topic;
  }
}

async function fetchPaperMethods(pmcid) {
  if (!pmcid) return { methodsText: '', methodsSource: '摘要' };
  try {
    const response = await fetch(`${EUROPE_PMC_URL}/${encodeURIComponent(pmcid)}/fullTextXML`, { headers: { Accept: 'application/xml' }, signal: AbortSignal.timeout(25000) });
    if (!response.ok) return { methodsText: '', methodsSource: '摘要' };
    const methodsText = extractMethodsFromXml(await response.text());
    return { methodsText, methodsSource: methodsText ? 'PubMed Central 全文 Methods' : '摘要' };
  } catch (error) {
    console.warn(`[pubmed-agent] full text ${pmcid} unavailable: ${error.message}`);
    return { methodsText: '', methodsSource: '摘要' };
  }
}

async function ncbiPubMedSearch(topic) {
  const searchParams = new URLSearchParams({ db: 'pubmed', term: topic, retmax: '5', retmode: 'json', sort: 'relevance' });
  const searchResponse = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${searchParams}`, { headers: { 'User-Agent': 'PaperPilot/1.0 (www.cellbubble.cn)' }, signal: AbortSignal.timeout(30000) });
  if (!searchResponse.ok) throw new Error(`NCBI PubMed 检索失败: ${searchResponse.status}`);
  const ids = (await searchResponse.json()).esearchresult?.idlist || [];
  if (!ids.length) return [];
  const summaryParams = new URLSearchParams({ db: 'pubmed', id: ids.join(','), retmode: 'json' });
  const abstractParams = new URLSearchParams({ db: 'pubmed', id: ids.join(','), retmode: 'xml' });
  const [summaryResponse, abstractResponse] = await Promise.all([
    fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?${summaryParams}`, { headers: { 'User-Agent': 'PaperPilot/1.0 (www.cellbubble.cn)' }, signal: AbortSignal.timeout(30000) }),
    fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?${abstractParams}`, { headers: { 'User-Agent': 'PaperPilot/1.0 (www.cellbubble.cn)' }, signal: AbortSignal.timeout(30000) })
  ]);
  if (!summaryResponse.ok) throw new Error(`NCBI PubMed 题录读取失败: ${summaryResponse.status}`);
  const summary = (await summaryResponse.json()).result || {};
  const abstractXml = abstractResponse.ok ? await abstractResponse.text() : '';
  const abstractMap = new Map();
  for (const block of abstractXml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/gi) || []) {
    const pmid = cleanText(block.match(/<PMID[^>]*>(.*?)<\/PMID>/i)?.[1], 30);
    const abstract = (block.match(/<AbstractText\b[^>]*>[\s\S]*?<\/AbstractText>/gi) || []).map(value => cleanText(value, 8000)).join(' ');
    if (pmid) abstractMap.set(pmid, abstract);
  }
  return ids.map((id, index) => {
    const item = summary[id] || {};
    const articleIds = item.articleids || [];
    const doi = articleIds.find(value => value.idtype === 'doi')?.value || '';
    const pmcid = articleIds.find(value => value.idtype === 'pmc')?.value || '';
    return { id: `pubmed-${id}`, rank: index + 1, pmid: id, pmcid, doi, title: cleanText(item.title, 1000) || '未命名文献', authors: (item.authors || []).map(author => author.name).filter(Boolean).join(', '), journal: cleanText(item.fulljournalname || item.source, 300) || 'PubMed', year: cleanText(item.pubdate, 30).match(/\d{4}/)?.[0] || '', abstract: abstractMap.get(id) || '', citedByCount: 0, url: `https://pubmed.ncbi.nlm.nih.gov/${id}/` };
  });
}

async function searchPubMed(topic) {
  const searchQuery = await buildPubMedQuery(topic);
  const params = new URLSearchParams({ query: `(${searchQuery}) AND SRC:MED`, format: 'json', resultType: 'core', pageSize: '12' });
  let response = await fetch(`${EUROPE_PMC_URL}/search?${params}`, { headers: { Accept: 'application/json', 'User-Agent': 'PaperPilot/1.0 (www.cellbubble.cn)' }, signal: AbortSignal.timeout(30000) });
  if (response.status === 429 || response.status >= 500) {
    await new Promise(resolve => setTimeout(resolve, 350));
    response = await fetch(`${EUROPE_PMC_URL}/search?${params}`, { headers: { Accept: 'application/json', 'User-Agent': 'PaperPilot/1.0 (www.cellbubble.cn)' }, signal: AbortSignal.timeout(30000) });
  }
  let data = response.ok ? await response.json() : {};
  let results = data.resultList?.result || [];
  if ((!response.ok || !results.length) && searchQuery !== topic) {
    const fallbackParams = new URLSearchParams({ query: `(${topic}) AND SRC:MED`, format: 'json', resultType: 'core', pageSize: '12' });
    response = await fetch(`${EUROPE_PMC_URL}/search?${fallbackParams}`, { headers: { Accept: 'application/json', 'User-Agent': 'PaperPilot/1.0 (www.cellbubble.cn)' }, signal: AbortSignal.timeout(30000) });
    if (response.ok) { data = await response.json(); results = data.resultList?.result || []; }
  }
  let base = results.filter(item => item.pmid || item.id).slice(0, 5).map((item, index) => ({
    id: `pubmed-${item.pmid || item.id}`,
    rank: index + 1,
    pmid: item.pmid || item.id || '',
    pmcid: item.pmcid || '',
    doi: item.doi || '',
    title: cleanText(item.title, 1000) || '未命名文献',
    authors: cleanText(item.authorString, 600),
    journal: cleanText(item.journalTitle || item.journalInfo?.journal?.title, 300) || 'PubMed',
    year: item.pubYear || item.firstPublicationDate?.slice(0, 4) || '',
    abstract: cleanText(item.abstractText, 12000),
    citedByCount: Number(item.citedByCount || 0),
    url: `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(item.pmid || item.id)}/`
  }));
  if (!base.length) base = await ncbiPubMedSearch(topic);
  if (!base.length) throw new Error('PubMed 未找到相关文献，请尝试补充研究对象、疾病或实验方法');
  const methodResults = await Promise.allSettled(base.map(item => fetchPaperMethods(item.pmcid)));
  const papers = base.map((item, index) => ({ ...item, ...(methodResults[index].status === 'fulfilled' ? methodResults[index].value : { methodsText: '', methodsSource: '摘要' }) }));
  return { searchQuery, papers };
}

const methodRules = [
  { name: '样本采集与预处理', category: '样本处理', pattern: /sample collection|specimen|biopsy|tissue collection|样本采集|取材/i },
  { name: '组织解离与细胞制备', category: '样本处理', pattern: /dissociat|enzymatic digest|collagenase|single.cell suspension|组织解离|酶消化/i },
  { name: '细胞分选与富集', category: '细胞分选', pattern: /flow cytometr|FACS|cell sort|magnetic.*bead|MACS|细胞分选|磁珠/i },
  { name: '细胞培养与处理', category: '细胞实验', pattern: /cell culture|cultured|incubat|transfect|细胞培养|转染/i },
  { name: '核酸提取与质量控制', category: '分子实验', pattern: /RNA extraction|DNA extraction|nucleic acid|RIN|nanodrop|核酸提取|RNA 提取/i },
  { name: '文库构建', category: '测序', pattern: /library prep|library construction|10x genomics|文库构建|建库/i },
  { name: '测序与数据采集', category: '测序', pattern: /sequenc|Illumina|NovaSeq|read depth|测序/i },
  { name: '定量 PCR', category: '分子实验', pattern: /qPCR|quantitative PCR|RT-PCR|real.time PCR/i },
  { name: '计算分析与质量控制', category: '数据分析', pattern: /bioinformatic|alignment|clustering|differential expression|Cell Ranger|Seurat|数据分析/i }
];

const resourceRules = [
  { type: 'reagent', name: 'Collagenase', role: '组织消化酶', pattern: /collagenase/i },
  { type: 'reagent', name: 'DNase I', role: '降低游离 DNA 导致的细胞团聚', pattern: /DNase\s*I/i },
  { type: 'reagent', name: 'Trypsin', role: '细胞或组织消化', pattern: /trypsin/i },
  { type: 'reagent', name: 'TRIzol', role: 'RNA 提取', pattern: /TRIzol/i },
  { type: 'reagent', name: 'PBS', role: '洗涤与缓冲', pattern: /\bPBS\b/i },
  { type: 'reagent', name: 'Fetal bovine serum', role: '培养或终止消化', pattern: /fetal bovine serum|\bFBS\b/i },
  { type: 'reagent', name: 'RBC lysis buffer', role: '红细胞裂解', pattern: /red blood cell lysis|RBC lysis/i },
  { type: 'material', name: 'Cell strainer', role: '去除细胞团块', pattern: /cell strainer|cell sieve|μm filter/i },
  { type: 'material', name: 'Microfluidic single-cell system', role: '单细胞捕获与建库', pattern: /10x genomics|Chromium controller|microfluidic/i },
  { type: 'material', name: 'Flow cytometer', role: '细胞分选或表型检测', pattern: /flow cytometr|cell sorter|FACS/i },
  { type: 'material', name: 'Sequencing platform', role: '文库测序', pattern: /Illumina|NovaSeq|HiSeq|NextSeq/i }
];

function evidenceCorpus(papers) {
  return papers.map(paper => `${paper.title}\n${paper.abstract}\n${paper.methodsText}`);
}

function catalogMatch(resource, store) {
  const ranked = (store.reagents || []).filter(item => item.status !== 'inactive').map(item => ({ item, score: keywordScore(`${resource.name} ${resource.role || ''}`, item) })).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score <= 0) return { catalogId: null, catalogMatch: null };
  const item = best.item;
  return { catalogId: item.id, catalogMatch: { id: item.id, name: item.name, brand: item.brand, spec: item.spec, price: item.price, stock: item.stock, seller: item.seller } };
}

function sourcePaperIdsFor(text, papers) {
  const tokens = cleanText(text, 200).toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/).filter(token => token.length >= 3);
  if (!tokens.length) return [];
  return papers.filter(paper => {
    const source = `${paper.title} ${paper.abstract} ${paper.methodsText}`.toLowerCase();
    return tokens.some(token => source.includes(token));
  }).map(paper => paper.id);
}

function normalizeAgentAnalysis(raw, papers, store, fallbackReason = '') {
  const corpus = evidenceCorpus(papers).join('\n');
  const nodes = Array.isArray(raw.methodTree) ? raw.methodTree : Array.isArray(raw.methods) ? raw.methods : [];
  const normalized = nodes.slice(0, 12).map((node, index) => {
    const name = cleanText(node.name || node.method, 180) || `方法步骤 ${index + 1}`;
    const paperIds = [...new Set((Array.isArray(node.paperIds) ? node.paperIds : sourcePaperIdsFor(name, papers)).filter(id => papers.some(paper => paper.id === id)))];
    const normalizeResource = (resource, type) => {
      const value = typeof resource === 'string' ? { name: resource } : resource || {};
      const resourceName = cleanText(value.name, 180);
      if (!resourceName) return null;
      const ids = [...new Set((Array.isArray(value.paperIds) ? value.paperIds : sourcePaperIdsFor(resourceName, papers)).filter(id => papers.some(paper => paper.id === id)))];
      if (!ids.length && !corpus.toLowerCase().includes(resourceName.toLowerCase())) return null;
      return { name: resourceName, role: cleanText(value.role, 240), paperIds: ids, selected: false, ...(type === 'reagent' ? catalogMatch({ name: resourceName, role: value.role }, store) : {}) };
    };
    return {
      id: `method-${crypto.randomUUID().slice(0, 8)}`,
      order: index + 1,
      name,
      category: cleanText(node.category, 100) || '其他方法',
      description: cleanText(node.description || node.summary, 800),
      paperIds,
      supportCount: paperIds.length,
      reagents: (Array.isArray(node.reagents) ? node.reagents : []).map(item => normalizeResource(item, 'reagent')).filter(Boolean),
      materials: (Array.isArray(node.materials) ? node.materials : []).map(item => normalizeResource(item, 'material')).filter(Boolean),
      selected: false
    };
  });
  const categoryMap = new Map();
  normalized.forEach(node => {
    const item = categoryMap.get(node.category) || { name: node.category, methodCount: 0, reagentCount: 0, paperIds: new Set() };
    item.methodCount += 1; item.reagentCount += node.reagents.length; node.paperIds.forEach(id => item.paperIds.add(id)); categoryMap.set(node.category, item);
  });
  return {
    summary: cleanText(raw.summary, 1200) || '已按文献中的 Methods 证据整理实验步骤。',
    methodCategories: [...categoryMap.values()].map(item => ({ name: item.name, methodCount: item.methodCount, reagentCount: item.reagentCount, supportCount: item.paperIds.size })),
    methodTree: normalized,
    evidenceNote: fallbackReason || cleanText(raw.evidenceNote, 500) || 'Methods 来自可获取的 PubMed Central 全文；无开放全文的文献仅使用题录与摘要。'
  };
}

function fallbackResearchAnalysis(papers, store, reason) {
  const sources = evidenceCorpus(papers);
  const methodTree = methodRules.map(rule => {
    const paperIds = papers.filter((_, index) => rule.pattern.test(sources[index])).map(paper => paper.id);
    if (!paperIds.length) return null;
    const relevantText = papers.filter(paper => paperIds.includes(paper.id)).map(paper => `${paper.abstract} ${paper.methodsText}`).join(' ');
    const resources = resourceRules.filter(resource => resource.pattern.test(relevantText)).map(resource => ({ name: resource.name, role: resource.role, paperIds }));
    return { name: rule.name, category: rule.category, description: `该步骤在 ${paperIds.length} 篇入选文献中出现，关键参数需回到原文复核。`, paperIds, reagents: resources.filter(item => resourceRules.find(ruleItem => ruleItem.name === item.name)?.type === 'reagent'), materials: resources.filter(item => resourceRules.find(ruleItem => ruleItem.name === item.name)?.type === 'material') };
  }).filter(Boolean);
  return normalizeAgentAnalysis({ summary: '已使用可追溯规则从开放全文与摘要中整理方法分类；请在实验前复核原文中的浓度、时间、温度和样本条件。', methodTree }, papers, store, `DeepSeek Methods 解析暂不可用，当前为规则提取结果：${reason}`);
}

async function analyzeResearchPapers(topic, papers, store) {
  const compactPapers = papers.map(paper => ({ id: paper.id, title: paper.title, abstract: paper.abstract, methodsSource: paper.methodsSource, methods: paper.methodsText.slice(0, 24000) }));
  try {
    const raw = await deepSeekJson(
      '你是 Methods 解析智能体。只能使用给出的文献证据，不得补写文中没有的试剂、材料、货号、浓度或参数。把 5 篇文章按实验执行顺序合并成方法树，并统计方法分类。paperIds 必须使用输入 id。只返回 JSON：{"summary":"","evidenceNote":"","methodTree":[{"name":"","category":"","description":"","paperIds":[],"reagents":[{"name":"","role":"","paperIds":[]}],"materials":[{"name":"","role":"","paperIds":[]}]}]}。',
      JSON.stringify({ topic, papers: compactPapers }).slice(0, 115000),
      120000
    );
    return { ...normalizeAgentAnalysis(raw, papers, store), provider: 'deepseek' };
  } catch (error) {
    console.warn(`[methods-agent] fallback: ${error.message}`);
    return { ...fallbackResearchAnalysis(papers, store, error.message), provider: 'rules' };
  }
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const radians = value => value * Math.PI / 180;
  const deltaLat = radians(lat2 - lat1);
  const deltaLng = radians(lng2 - lng1);
  const value = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

async function nearbyLaboratories(lat, lng, radius) {
  const query = `[out:json][timeout:18];(nwr(around:${radius},${lat},${lng})["healthcare"="laboratory"];nwr(around:${radius},${lat},${lng})["amenity"="research_institute"];nwr(around:${radius},${lat},${lng})["office"="research"];nwr(around:${radius},${lat},${lng})["laboratory"];);out center tags;`;
  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'PaperPilot/1.0 (www.cellbubble.cn)' },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`地图数据服务暂不可用: ${response.status}`);
  const data = await response.json();
  return (data.elements || []).map(element => {
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    const tags = element.tags || {};
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    const name = tags['name:zh'] || tags.name || tags.operator || '未命名实验室';
    const address = tags['addr:full'] || [tags['addr:province'], tags['addr:city'], tags['addr:district'], tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join('') || '地图暂未收录详细地址';
    const type = tags.healthcare === 'laboratory' ? '医学检验实验室' : tags.amenity === 'research_institute' || tags.office === 'research' ? '科研机构' : '实验室';
    return { id: `${element.type}-${element.id}`, name, type, lat: latitude, lng: longitude, address, phone: tags.phone || tags['contact:phone'] || '', website: tags.website || tags['contact:website'] || '', distanceKm: Number(distanceKm(lat, lng, latitude, longitude).toFixed(2)) };
  }).filter(Boolean).sort((left, right) => left.distanceKm - right.distanceKm).slice(0, 40);
}

async function route(req, res) {
  const store = readStore();
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'POST' && url.pathname === '/api/auth/register') {
      const payload = await body(req);
      const name = String(payload.name || '').trim();
      const email = String(payload.email || '').trim().toLowerCase();
      const password = String(payload.password || '');
      if (name.length < 2) return json(res, 400, { error: '姓名至少需要 2 个字符' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: '请输入有效邮箱' });
      if (password.length < 8) return json(res, 400, { error: '密码至少需要 8 位' });
      if (store.users.some(user => user.email === email)) return json(res, 409, { error: '该邮箱已注册' });
      const user = { id: `u-${crypto.randomUUID().slice(0, 12)}`, name, email, passwordHash: passwordDigest(password), createdAt: new Date().toISOString() };
      store.users.push(user);
      createSession(store, user, res);
      return json(res, 201, { user: publicUser(user) });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const payload = await body(req);
      const email = String(payload.email || '').trim().toLowerCase();
      const user = store.users.find(item => item.email === email);
      if (!user || !verifyPassword(String(payload.password || ''), user.passwordHash)) return json(res, 401, { error: '邮箱或密码不正确' });
      createSession(store, user, res);
      return json(res, 200, { user: publicUser(user) });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      const token = parseCookies(req).paperpilot_session;
      store.sessions = store.sessions.filter(session => session.token !== token);
      writeStore(store);
      res.setHeader('Set-Cookie', sessionCookie('', 0));
      return json(res, 200, { loggedOut: true });
    }
    const removedEndpoints = new Set([
      '/api/chat',
      '/api/skills/reagent-recommend',
      '/api/skills/article-decompose',
      '/api/questions',
      '/api/papers/analyze'
    ]);
    if (removedEndpoints.has(url.pathname) || /^\/api\/questions\/[^/]+\/entries\/[^/]+\/select$/.test(url.pathname)) {
      return json(res, 404, { error:'Not found' });
    }
    const user = currentUser(req, store);
    if (req.method === 'GET' && url.pathname === '/api/me') return user ? json(res, 200, { user: publicUser(user) }) : json(res, 401, { error: '请先登录' });
    if (!user && url.pathname !== '/api/wechat/notify') return json(res, 401, { error: '请先登录或注册' });
    if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, publicState(store, user));
    if (req.method === 'GET' && url.pathname === '/api/research/network') {
      try { return json(res, 200, await getResearchNetwork('/v1/model-info')); }
      catch (error) { return json(res, 503, { error: '研究网络服务暂不可用', detail: error.message }); }
    }
    if (req.method === 'POST' && url.pathname === '/api/research/k1') {
      const payload = await body(req);
      if (!String(payload.title || '').trim()) return json(res, 400, { error: '请提供论文标题' });
      try { return json(res, 200, await callResearchNetwork('/v1/k1', payload)); }
      catch (error) { return json(res, 503, { error: 'K1 研究问题路由暂不可用', detail: error.message }); }
    }
    if (req.method === 'POST' && url.pathname === '/api/research/k2') {
      const payload = await body(req);
      if (!String(payload.title || payload.methods || '').trim()) return json(res, 400, { error: '请提供论文标题或 Methods' });
      try { return json(res, 200, await callResearchNetwork('/v1/k2', { ...payload, catalog: payload.catalog || store.reagents })); }
      catch (error) { return json(res, 503, { error: 'K2 试剂路由暂不可用', detail: error.message }); }
    }
    if (req.method === 'POST' && url.pathname === '/api/research/pipeline') {
      const payload = await body(req);
      if (!String(payload.title || '').trim()) return json(res, 400, { error: '请提供论文标题' });
      try { return json(res, 200, await callResearchNetwork('/v1/pipeline', { ...payload, catalog: payload.catalog || store.reagents })); }
      catch (error) { return json(res, 503, { error: '研究网络暂不可用', detail: error.message }); }
    }
    if (req.method === 'POST' && url.pathname === '/api/research/workflows') {
      const payload = await body(req);
      const topic = cleanText(payload.topic, 1200);
      if (topic.length < 4) return json(res, 400, { error: '请填写完整的科研课题' });
      const retrieved = await searchPubMed(topic);
      const analysis = await analyzeResearchPapers(topic, retrieved.papers, store);
      const project = {
        id: `project-${crypto.randomUUID().slice(0, 10)}`,
        topic,
        searchQuery: retrieved.searchQuery,
        status: 'ready',
        agent1: { name: 'PubMed 文献检索智能体', status: 'completed', resultCount: retrieved.papers.length, source: 'PubMed / Europe PMC' },
        agent2: { name: 'Methods 解析智能体', status: 'completed', provider: analysis.provider },
        papers: retrieved.papers.map(paper => ({ ...paper, methodsText: paper.methodsText.slice(0, 10000) })),
        summary: analysis.summary,
        evidenceNote: analysis.evidenceNote,
        methodCategories: analysis.methodCategories,
        methodTree: analysis.methodTree,
        createdAt: new Date().toISOString(),
        createdBy: user.id
      };
      store.researchProjects.unshift(project);
      store.researchProjects = store.researchProjects.slice(0, 30);
      writeStore(store);
      return json(res, 201, { project });
    }
    if (req.method === 'POST' && url.pathname === '/api/research/tasks') {
      const payload = await body(req);
      const project = payload.projectId ? store.researchProjects.find(item => item.id === payload.projectId && item.createdBy === user.id) : null;
      if (payload.projectId && !project) return json(res, 404, { error: '研究方案不存在或不属于当前用户' });
      const topic = project?.topic || cleanText(payload.topic, 1200);
      if (topic.length < 4) return json(res, 400, { error: '请填写至少 4 个字符的科研任务描述' });
      if (payload.visibility !== undefined && !['private', 'public'].includes(payload.visibility)) return json(res, 400, { error: '任务公开范围无效' });
      const existing = project && store.researchTasks.find(item => item.projectId === project.id && item.userId === user.id);
      if (existing) return json(res, 200, { task: existing });
      const task = { id: `task-${crypto.randomUUID().slice(0, 10)}`, projectId: project?.id || '', userId: user.id, topic, visibility: payload.visibility || 'private', status: '已发布', createdAt: new Date().toISOString() };
      store.researchTasks.unshift(task); writeStore(store); return json(res, 201, { task });
    }
    if (req.method === 'PATCH' && /^\/api\/research\/tasks\/[^/]+$/.test(url.pathname)) {
      const task = store.researchTasks.find(item => item.id === url.pathname.split('/')[4] && item.userId === user.id);
      if (!task) return json(res, 404, { error: '任务不存在或无权操作' });
      const payload = await body(req);
      if (!['private', 'public'].includes(payload.visibility)) return json(res, 400, { error: '任务公开范围无效' });
      task.visibility = payload.visibility;
      task.updatedAt = new Date().toISOString(); writeStore(store); return json(res, 200, { task });
    }
    if (req.method === 'POST' && url.pathname === '/api/lab/providers') {
      const payload = await body(req);
      const name = cleanText(payload.name, 160);
      const city = cleanText(payload.city, 80);
      if (!name || !city) return json(res, 400, { error: '请填写实验室名称和所在城市' });
      const provider = {
        id: `lab-${crypto.randomUUID().slice(0, 10)}`,
        name,
        city,
        capabilities: (Array.isArray(payload.capabilities) ? payload.capabilities : String(payload.capabilities || '').split(/[，,]/)).map(value => cleanText(value, 80)).filter(Boolean).slice(0, 12),
        serviceCategories: (Array.isArray(payload.serviceCategories) ? payload.serviceCategories : String(payload.serviceCategories || '').split(/[，,]/)).map(value => cleanText(value, 80)).filter(Boolean).slice(0, 8),
        verified: false,
        turnaround: cleanText(payload.turnaround, 160) || '提交样本信息后评估',
        pricingNote: cleanText(payload.pricingNote, 160) || '按项目询价',
        contact: cleanText(payload.contact, 200) || '平台站内联系',
        status: 'review',
        note: cleanText(payload.note, 500),
        ownerUserId: user.id,
        createdAt: new Date().toISOString()
      };
      store.labProviders.unshift(provider); writeStore(store); return json(res, 201, provider);
    }
    if (req.method === 'PATCH' && /^\/api\/lab\/providers\/[^/]+$/.test(url.pathname)) {
      const id = url.pathname.split('/').pop();
      const provider = store.labProviders.find(item => item.id === id);
      if (!provider) return json(res, 404, { error: '实验室不存在' });
      if (provider.ownerUserId && provider.ownerUserId !== user.id) return json(res, 403, { error: '只能管理自己入驻的实验室' });
      const payload = await body(req);
      for (const key of ['name', 'city', 'turnaround', 'pricingNote', 'contact', 'note']) if (payload[key] !== undefined) provider[key] = cleanText(payload[key], key === 'note' ? 500 : 200);
      for (const key of ['capabilities', 'serviceCategories']) if (payload[key] !== undefined) provider[key] = (Array.isArray(payload[key]) ? payload[key] : String(payload[key]).split(/[，,]/)).map(value => cleanText(value, 80)).filter(Boolean).slice(0, 12);
      if (['active', 'paused', 'review'].includes(payload.status)) provider.status = payload.status;
      writeStore(store); return json(res, 200, provider);
    }
    if (req.method === 'POST' && url.pathname === '/api/lab/requests') {
      const payload = await body(req);
      const provider = store.labProviders.find(item => item.id === payload.labId && item.status !== 'paused');
      if (!provider) return json(res, 404, { error: '请选择可接洽的实验室' });
      const selectedMethods = (Array.isArray(payload.selectedMethods) ? payload.selectedMethods : []).map(value => cleanText(value, 180)).filter(Boolean).slice(0, 20);
      if (!selectedMethods.length) return json(res, 400, { error: '请至少选择一个实验方法' });
      const request = { id: `labreq-${crypto.randomUUID().slice(0, 10)}`, projectId: cleanText(payload.projectId, 80), labId: provider.id, labName: provider.name, selectedMethods, sampleInfo: cleanText(payload.sampleInfo, 1000), contact: cleanText(payload.contact, 240), status: '待实验室评估', userId: user.id, createdAt: new Date().toISOString() };
      store.labRequests.unshift(request); writeStore(store); return json(res, 201, request);
    }
    if (req.method === 'PATCH' && /^\/api\/lab\/requests\/[^/]+$/.test(url.pathname)) {
      const id = url.pathname.split('/').pop();
      const request = store.labRequests.find(item => item.id === id);
      if (!request) return json(res, 404, { error: '委托需求不存在' });
      const provider = store.labProviders.find(item => item.id === request.labId);
      if (request.userId !== user.id && provider?.ownerUserId !== user.id) return json(res, 403, { error: '无权更新该委托' });
      const payload = await body(req);
      if (['待实验室评估', '已接洽', '方案确认中', '执行中', '已完成', '已关闭'].includes(payload.status)) request.status = payload.status;
      writeStore(store); return json(res, 200, request);
    }
    if (req.method === 'GET' && url.pathname === '/api/labs/nearby') {
      const lat = Number(url.searchParams.get('lat'));
      const lng = Number(url.searchParams.get('lng'));
      const radius = Math.min(50000, Math.max(1000, Number(url.searchParams.get('radius') || 10000)));
      if (!url.searchParams.get('lat')?.trim() || !url.searchParams.get('lng')?.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radius) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return json(res, 400, { error: '定位坐标无效' });
      try {
        const labs = await nearbyLaboratories(lat, lng, radius);
        return json(res, 200, { labs, radius, source: 'OpenStreetMap / Overpass', updatedAt: new Date().toISOString() });
      } catch (error) {
        return json(res, 503, { error: error.message });
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/reagents') {
      const query = (url.searchParams.get('q') || '').toLowerCase();
      return json(res, 200, { reagents: store.reagents.filter(item => !query || `${item.name} ${item.brand} ${item.category} ${item.tags.join(' ')}`.toLowerCase().includes(query)) });
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/models') {
      return json(res, 200, { models: store.models || [] });
    }
    if (req.method === 'PATCH' && /^\/api\/admin\/models\/[^/]+$/.test(url.pathname)) {
      const id = url.pathname.split('/').pop();
      const model = (store.models || []).find(item => item.id === id);
      if (!model) return json(res, 404, { error: '模型不存在' });
      const payload = await body(req);
      if (['active', 'paused', 'canary'].includes(payload.status)) model.status = payload.status;
      if (payload.traffic !== undefined && Number.isFinite(Number(payload.traffic)) && Number(payload.traffic) >= 0 && Number(payload.traffic) <= 100) model.traffic = Number(payload.traffic);
      writeStore(store);
      return json(res, 200, { model });
    }
    if (req.method === 'GET' && url.pathname === '/api/merchant/ruijing/catalog') {
      return json(res, 200, { connected: Boolean(RUIJING_SKU_URL), source: RUIJING_SKU_URL ? '锐竞 API' : '锐竞平台样例目录', catalog: store.ruijingCatalog || [] });
    }
    if (req.method === 'POST' && url.pathname === '/api/merchant/ruijing/sync') {
      let catalog = store.ruijingCatalog || []; let source = '锐竞平台样例目录';
      if (RUIJING_SKU_URL) {
        const headers = { Accept: 'application/json' };
        if (RUIJING_SKU_TOKEN) headers.Authorization = `Bearer ${RUIJING_SKU_TOKEN}`;
        const response = await fetch(RUIJING_SKU_URL, { headers });
        if (!response.ok) throw new Error(`锐竞 SKU 同步失败: ${response.status}`);
        const data = await response.json(); catalog = data.items || data.skus || data.data || data; source = '锐竞 API';
        if (!Array.isArray(catalog)) throw new Error('锐竞 API 返回格式不是数组');
      }
      store.ruijingCatalog = catalog.map(item => ({ sku: item.sku || item.SKU || item.skuCode, name: item.name || item.title, brand: item.brand || '', category: item.category || item.type || '其他', spec: item.spec || item.package || '', price: Number(item.price || 0), stock: Number(item.stock || 0), seller: item.seller || item.vendor || '锐竞平台商家', tags: item.tags || [], source }));
      writeStore(store); return json(res, 200, { connected: Boolean(RUIJING_SKU_URL), source, catalog: store.ruijingCatalog });
    }
    if (req.method === 'POST' && url.pathname === '/api/merchant/ruijing/import') {
      const wanted = new Set((await body(req)).skus || []); const imported = [];
      for (const item of (store.ruijingCatalog || []).filter(entry => wanted.has(entry.sku))) {
        const existing = store.reagents.find(reagent => reagent.sku === item.sku);
        if (existing) { if (existing.ownerUserId !== user.id) continue; Object.assign(existing, { ...item, sourcePlatform: '锐竞平台' }); imported.push(existing); continue; }
        const reagent = { id: `r-${crypto.randomUUID().slice(0, 8)}`, ...item, sourcePlatform: '锐竞平台', rating: 5, color: '#9ae6b4', status: 'active', ownerUserId: user.id };
        store.reagents.unshift(reagent); imported.push(reagent);
      }
      writeStore(store); return json(res, 201, { imported });
    }
    if (req.method === 'POST' && url.pathname === '/api/reagents') {
      const payload = await body(req);
      const reagent = { id: `r-${crypto.randomUUID().slice(0, 8)}`, name: payload.name, brand: payload.brand || '未填写品牌', category: payload.category || '其他', spec: payload.spec || '按包装', price: Number(payload.price || 0), stock: Number(payload.stock || 0), seller: payload.seller || '我的店铺', rating: 5, tags: ['新上架'], color: '#9ae6b4', status: 'active', ownerUserId: user.id };
      if (!cleanText(reagent.name, 200) || !Number.isFinite(reagent.price) || !Number.isInteger(reagent.price * 100) || reagent.price <= 0 || !Number.isInteger(reagent.stock) || reagent.stock < 0) return json(res, 400, { error: '请填写试剂名称、精确到分的价格和有效库存' });
      store.reagents.unshift(reagent); writeStore(store); return json(res, 201, reagent);
    }
    if (req.method === 'PATCH' && /^\/api\/reagents\/[^/]+$/.test(url.pathname)) {
      const id = url.pathname.split('/').pop();
      const reagent = store.reagents.find(item => item.id === id);
      if (!reagent) return json(res, 404, { error: '商品不存在' });
      if (reagent.ownerUserId !== user.id) return json(res, 403, { error: '只能管理自己的商品' });
      const payload = await body(req);
      for (const key of ['name', 'brand', 'category', 'spec', 'seller']) if (payload[key] !== undefined) reagent[key] = cleanText(payload[key], 200);
      if (payload.price !== undefined) {
        const price = Number(payload.price);
        if (!Number.isFinite(price) || !Number.isInteger(price * 100) || price <= 0) return json(res, 400, { error: '价格必须大于零且精确到分' });
        reagent.price = price;
      }
      if (payload.stock !== undefined && Number.isInteger(Number(payload.stock)) && Number(payload.stock) >= 0) reagent.stock = Number(payload.stock);
      if (['active', 'inactive'].includes(payload.status)) reagent.status = payload.status;
      writeStore(store); return json(res, 200, reagent);
    }
    if (req.method === 'DELETE' && /^\/api\/reagents\/[^/]+$/.test(url.pathname)) {
      const id = url.pathname.split('/').pop();
      const reagent = store.reagents.find(item => item.id === id);
      if (!reagent) return json(res, 404, { error: '商品不存在' });
      if (reagent.ownerUserId !== user.id) return json(res, 403, { error: '只能删除自己的商品' });
      if (store.orders.some(order => order.items?.some(item => item.reagentId === id))) return json(res, 409, { error: '商品已有订单，请改为下架' });
      store.reagents = store.reagents.filter(item => item.id !== id);
      for (const userId of Object.keys(store.carts)) store.carts[userId] = store.carts[userId].filter(item => item.reagentId !== id);
      writeStore(store); return json(res, 200, { deleted: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/cart') {
      const payload = await body(req); const cart = store.carts[user.id] ||= []; const existing = cart.find(item => item.reagentId === payload.reagentId);
      const reagent = store.reagents.find(item => item.id === payload.reagentId);
      const quantity = Number(payload.quantity ?? 1);
      if (!reagent) return json(res, 404, { error: '商品不存在' });
      if (!reagent.ownerUserId) return json(res, 409, { error: '商品尚未绑定履约商家，暂不能在线购买' });
      if (reagent.status === 'inactive' || !Number.isInteger(quantity) || quantity < 1 || quantity + (existing?.quantity || 0) > availableStock(store, reagent.id)) return json(res, 400, { error: '商品已下架或数量超过可售库存' });
      const project = store.researchProjects.find(item => item.id === payload.projectId && item.createdBy === user.id);
      if (existing) existing.quantity += quantity; else cart.push({ reagentId: payload.reagentId, quantity, projectId: project?.id || '' });
      writeStore(store); return json(res, 200, cart);
    }
    if (req.method === 'PATCH' && /^\/api\/cart\/[^/]+$/.test(url.pathname)) {
      const reagentId = url.pathname.split('/').pop();
      const cart = store.carts[user.id] ||= []; const line = cart.find(item => item.reagentId === reagentId);
      const reagent = store.reagents.find(item => item.id === reagentId);
      if (!line || !reagent) return json(res, 404, { error: '商品不在购物清单中' });
      const quantity = Number((await body(req)).quantity);
      if (reagent.status === 'inactive' || !Number.isInteger(quantity) || quantity < 1 || quantity > availableStock(store, reagent.id)) return json(res, 400, { error: '商品已下架或数量超过可售库存' });
      line.quantity = quantity;
      writeStore(store); return json(res, 200, cart);
    }
    if (req.method === 'DELETE' && url.pathname.startsWith('/api/cart/')) {
      const reagentId = url.pathname.split('/').pop(); store.carts[user.id] = (store.carts[user.id] || []).filter(item => item.reagentId !== reagentId); writeStore(store); return json(res, 200, store.carts[user.id]);
    }
    if (req.method === 'POST' && url.pathname === '/api/orders/prepare-payment') {
      if (!WECHAT_PAY_ENABLED) return json(res, 503, { error: '微信 Native 支付暂未开通，请稍后再试' });
      const payload = await body(req); const reagentIds = Array.isArray(payload.reagentIds) ? payload.reagentIds : []; const { items, total } = orderLines(store, user, reagentIds);
      if (pendingCheckouts.has(user.id)) return json(res, 409, { error: '订单正在创建，请勿重复提交' });
      const existingOrder = store.orders.find(order => order.userId === user.id && order.paymentStatus === 'pending' && Date.parse(order.expiresAt || 0) > Date.now());
      if (existingOrder) return json(res, 409, { error: `已有待支付订单 ${existingOrder.id}，请到购买记录继续扫码或等待过期` });
      if (!items.length) return json(res, 400, { error: '购物清单为空' });
      if (!Number.isSafeInteger(Math.round(total * 100)) || total <= 0) return json(res, 400, { error: '订单金额无效，请联系商家核对价格' });
      if (items.some(item => !item.reagent.ownerUserId)) return json(res, 409, { error: '部分商品尚未绑定履约商家，不能生成支付订单' });
      if (items.some(item => item.quantity > availableStock(store, item.reagentId))) return json(res, 409, { error: '部分商品库存不足，请刷新购物清单' });
      const shipping = { recipient: cleanText(payload.recipient, 80), phone: cleanText(payload.phone, 40), address: cleanText(payload.address, 400) };
      if (!shipping.recipient || !/^1\d{10}$/.test(shipping.phone) || shipping.address.length < 6) return json(res, 400, { error: '请填写收件人、11 位手机号和完整收货地址' });
      const task = store.researchTasks.find(entry => entry.id === payload.taskId && entry.userId === user.id);
      const id = `PP-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const outTradeNo = `PP${Date.now()}${crypto.randomBytes(3).toString('hex')}`.slice(0, 32);
      let payment;
      pendingCheckouts.add(user.id);
      try { payment = await createWechatNativeOrder(outTradeNo, Math.round(total * 100), `PaperPilot 试剂订单 ${id}`); } catch (error) { pendingCheckouts.delete(user.id); console.error('Wechat native order failed:', error.message); return json(res, 502, { error: '微信 Native 下单失败，请稍后重试' }); }
      try {
      const latest = readStore();
      const currentItems = orderLines(latest, user, reagentIds).items;
      if (currentItems.length !== items.length || currentItems.some(item => {
        const initial = items.find(entry => entry.reagentId === item.reagentId);
        return !initial || item.quantity !== initial.quantity || item.reagent.price !== initial.reagent.price || item.reagent.ownerUserId !== initial.reagent.ownerUserId || item.quantity > availableStock(latest, item.reagentId);
      })) {
        return json(res, 409, { error: '下单期间商品价格或库存发生变化，请刷新购物清单后重试' });
      }
      const fulfillments = [...new Set(items.map(item => item.reagent.ownerUserId).filter(Boolean))].map(merchantId => ({ merchantId, status: '待确认', items: items.filter(item => item.reagent.ownerUserId === merchantId).map(item => ({ reagentId: item.reagentId, name: item.reagent.name, spec: item.reagent.spec, quantity: item.quantity })) }));
      const order = { id, userId: user.id, taskId: task?.id || '', shipping, status: '待支付', paymentStatus: 'pending', expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), outTradeNo, payment: { mode: payment.mode, qrUrl: payment.qrUrl }, items: items.map(item => ({ reagentId: item.reagentId, name: item.reagent.name, unitPrice: item.reagent.price, quantity: item.quantity })), fulfillments, total, itemCount: items.reduce((sum, item) => sum + item.quantity, 0), createdAt: new Date().toISOString(), seller: fulfillments.length === 1 ? items.find(item => item.reagent.ownerUserId === fulfillments[0].merchantId).reagent.seller : '多供应商订单' };
      latest.orders.unshift(order); writeStore(latest); return json(res, 201, { order, payment });
      } finally { pendingCheckouts.delete(user.id); }
    }
    if (req.method === 'GET' && /^\/api\/orders\/[^/]+\/payment$/.test(url.pathname)) {
      const order = store.orders.find(item => item.id === url.pathname.split('/')[3] && item.userId === user.id);
      if (!order) return json(res, 404, { error: '订单不存在' });
      if (['pending', 'expired'].includes(order.paymentStatus) && order.payment?.mode === 'wechat-native' && WECHAT_PAY_ENABLED) {
        try {
          const result = await wechatRequest('/pay/orderquery', { appid: WECHAT_APPID, mch_id: WECHAT_MCHID, out_trade_no: order.outTradeNo, nonce_str: crypto.randomBytes(16).toString('hex') });
          if (result.trade_state === 'SUCCESS' && result.appid === WECHAT_APPID && result.mch_id === WECHAT_MCHID && result.out_trade_no === order.outTradeNo && result.transaction_id && Number(result.total_fee) === Math.round(order.total * 100)) {
            const latest = readStore(); const current = latest.orders.find(item => item.id === order.id);
            if (current) markOrderPaid(latest, current, result.transaction_id);
          }
        } catch (error) { console.error('Wechat payment query failed:', error.message); return json(res, 502, { error: '暂时无法向微信核对付款，请稍后重试' }); }
      }
      const current = readStore().orders.find(item => item.id === order.id) || order;
      return json(res, 200, { id: current.id, status: current.status, paymentStatus: current.paymentStatus, payment: current.payment });
    }
    if (req.method === 'POST' && url.pathname === '/api/wechat/notify') {
      const raw = await new Promise((resolve, reject) => { let value = ''; req.on('data', chunk => { value += chunk; if (value.length > 65536) req.destroy(); }); req.on('end', () => resolve(value)); req.on('error', reject); });
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      const values = xmlFields(raw); const order = store.orders.find(item => item.outTradeNo === values.out_trade_no);
      if (!WECHAT_PAY_ENABLED || !values.sign || wechatV2Sign(values) !== values.sign || !order || order.payment?.mode !== 'wechat-native' || values.appid !== WECHAT_APPID || values.mch_id !== WECHAT_MCHID || Number(values.total_fee) !== Math.round(order.total * 100) || values.return_code !== 'SUCCESS' || values.result_code !== 'SUCCESS' || !values.transaction_id) return res.end(xmlFromObject({ return_code: 'FAIL', return_msg: '订单或签名无效' }));
      const latest = readStore(); const current = latest.orders.find(item => item.id === order.id);
      if (!current) return res.end(xmlFromObject({ return_code: 'FAIL', return_msg: '订单不存在' }));
      markOrderPaid(latest, current, values.transaction_id);
      return res.end(xmlFromObject({ return_code: 'SUCCESS', return_msg: 'OK' }));
    }
    if (req.method === 'POST' && url.pathname === '/api/orders/confirm-payment') return json(res, 410, { error: '已停用手动确认，请等待微信支付通知或查询支付状态' });
    if (req.method === 'POST' && url.pathname === '/api/orders') return json(res, 410, { error: '请从购物清单使用安全支付流程下单' });
    if (req.method === 'PATCH' && /^\/api\/merchant\/orders\/[^/]+\/ship$/.test(url.pathname)) {
      const order = store.orders.find(item => item.id === url.pathname.split('/')[4]);
      const fulfillment = order?.fulfillments?.find(item => item.merchantId === user.id);
      if (!fulfillment) return json(res, 404, { error: '没有可管理的商家订单' });
      if (order.paymentStatus !== 'paid') return json(res, 409, { error: '订单尚未由微信确认支付，不能发货' });
      if (fulfillment.status === '已发货') return json(res, 409, { error: '该订单已经发货' });
      const payload = await body(req);
      const carrier = cleanText(payload.carrier, 80), trackingNo = cleanText(payload.trackingNo, 80);
      if (!carrier || !/^[A-Za-z0-9-]{5,80}$/.test(trackingNo)) return json(res, 400, { error: '请填写物流公司和有效运单号' });
      Object.assign(fulfillment, { status: '已发货', carrier, trackingNo, shippedAt: new Date().toISOString() });
      order.status = order.fulfillments.every(item => item.status === '已发货') ? '已发货' : '部分发货';
      writeStore(store); return json(res, 200, { orderId: order.id, fulfillment });
    }
    if (req.method === 'POST' && url.pathname === '/api/settings/wechat-qr') return json(res, 410, { error: '已停用静态收款码；请使用逐单生成的 Native 二维码' });
    return json(res, 404, { error: 'Not found' });
  } catch (error) { console.error(error); return json(res, 500, { error: error.message }); }
}

function serve(req, res) {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  const filePath = pathname === '/' ? path.join(ROOT, 'public', 'index.html') : path.join(ROOT, 'public', pathname.replace(/^\//, ''));
  if (!filePath.startsWith(path.join(ROOT, 'public'))) return res.writeHead(403).end();
  fs.readFile(filePath, (error, data) => { if (error) return res.writeHead(404).end('Not found'); const ext = path.extname(filePath); const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }; res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data); });
}

ensureStore();
http.createServer((req, res) => req.url.startsWith('/api/') ? route(req, res) : serve(req, res)).listen(PORT, () => console.log(`PaperPilot running at http://localhost:${PORT}`));
