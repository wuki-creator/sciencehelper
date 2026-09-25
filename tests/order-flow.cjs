const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const key = '12345678901234567890123456789012';
function fields(xml) {
  return Object.fromEntries([...xml.matchAll(/<([a-z][a-z0-9_]*)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))<\/\1>/gi)].map(m => [m[1], m[2] ?? m[3]]));
}
function sign(values) {
  const query = Object.entries(values).filter(([k, v]) => k !== 'sign' && v !== '').sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${k}=${v}`).join('&');
  return crypto.createHash('md5').update(`${query}&key=${key}`).digest('hex').toUpperCase();
}
function xml(values) { return `<xml>${Object.entries(values).map(([k, v]) => `<${k}><![CDATA[${v}]]></${k}>`).join('')}</xml>`; }
function listen(server) { return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port))); }
function close(server) { return new Promise(resolve => server.close(resolve)); }
async function waitFor(url) {
  for (let attempt = 0; attempt < 50; attempt++) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error('API failed to start');
}

test('research task → cart → Native payment → merchant shipment, isolated by user', async () => {
  let paid = false, unified = null, failUnifiedOnce = false;
  const mock = http.createServer(async (req, res) => {
    if (req.url.startsWith('/europe/search')) {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ resultList: { result: Array.from({ length: 5 }, (_, i) => ({ pmid: String(100000 + i), title: `RNA sequencing in immune cells ${i}`, abstractText: 'RNA extraction and single cell sequencing of immune cells.', journalTitle: 'Research Test', pubYear: '2025' })) } }));
    }
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const input = fields(Buffer.concat(chunks).toString());
    if (req.url === '/pay/unifiedorder') {
      assert.equal(input.trade_type, 'NATIVE');
      assert.equal(input.sign, sign(input));
      if (failUnifiedOnce) { failUnifiedOnce = false; return res.writeHead(502).end('Temporary payment gateway failure'); }
      unified = input;
      const result = { return_code: 'SUCCESS', result_code: 'SUCCESS', appid: input.appid, mch_id: input.mch_id, nonce_str: 'mocknonce', code_url: 'weixin://wxpay/bizpayurl?pr=mock123' };
      return res.end(xml({ ...result, sign: sign(result) }));
    }
    if (req.url === '/pay/orderquery') {
      const result = { return_code: 'SUCCESS', result_code: 'SUCCESS', appid: input.appid, mch_id: input.mch_id, nonce_str: 'mocknonce', out_trade_no: input.out_trade_no, trade_state: paid ? 'SUCCESS' : 'NOTPAY', total_fee: unified.total_fee, transaction_id: paid ? 'wx-test-transaction' : '' };
      return res.end(xml({ ...result, sign: sign(result) }));
    }
    res.writeHead(404).end();
  });
  const mockPort = await listen(mock);
  const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sciencehelper-order-test-'));
  const apiServer = http.createServer((req, res) => res.writeHead(404).end());
  const appPort = await listen(apiServer); await close(apiServer);
  const app = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(appPort), PAPERPILOT_DATA_DIR: storeDir, WECHAT_PAY_ENABLED: 'true', WECHAT_APPID: 'wxmockappid123456', WECHAT_MCHID: '1234567890', WECHAT_API_V2_KEY: key, WECHAT_NOTIFY_URL: `http://127.0.0.1:${appPort}/api/wechat/notify`, WECHAT_PAY_API_BASE: `http://127.0.0.1:${mockPort}`, EUROPE_PMC_URL: `http://127.0.0.1:${mockPort}/europe`, NODE_ENV: 'test', DEEPSEEK_API_KEY: '' }, stdio: 'pipe' });
  let appError = ''; app.stderr.on('data', chunk => { appError += chunk; });
  const base = `http://127.0.0.1:${appPort}`;
  const client = () => {
    let cookie = '';
    return async (url, method = 'GET', data) => {
      const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: data === undefined ? undefined : JSON.stringify(data) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      const result = await response.json(); return { status: response.status, data: result };
    };
  };
  try {
    await waitFor(base + '/');
    const buyer = client(), merchant = client(), stranger = client(), applicant = client();
    const buyerUser = (await buyer('/api/auth/register', 'POST', { name: '科研用户', email: 'buyer@test.local', password: 'pass-word-123' })).data.user;
    assert.equal((await buyer('/api/reagents', 'POST', { name: '越权商品', price: 1, stock: 1 })).status, 403);
    const merchantUser = (await merchant('/api/auth/merchant-register', 'POST', { name: '商家用户', email: 'seller@test.local', password: 'pass-word-123', businessName: '测试生命科学店', licenseNo: '91440300TEST12345', phone: '13800138001', address: '深圳市南山区科研路 1 号', description: '分子生物学试剂' })).data.user;
    assert.equal(merchantUser.role, 'merchant');
    const applicantResult = await applicant('/api/auth/register', 'POST', { name: '待入驻用户', email: 'applicant@test.local', password: 'pass-word-123' });
    assert.equal((await applicant('/api/merchant/applications', 'POST', { businessName: '申请店铺', licenseNo: '91440300TEST54321', contactName: '待入驻用户', phone: '13800138002', address: '深圳市南山区科研路 2 号' })).status, 201);
    assert.equal((await applicant('/api/state')).data.user.role, 'merchant');
    await stranger('/api/auth/register', 'POST', { name: '其他用户', email: 'other@test.local', password: 'pass-word-123' });
    const workflow = await buyer('/api/research/workflows', 'POST', { topic: '单细胞免疫细胞 RNA 测序实验' });
    assert.equal(workflow.status, 201, JSON.stringify(workflow.data));
    const project = workflow.data.project;
    assert.equal(project.papers.length, 5);
    const task = await buyer('/api/research/tasks', 'POST', { projectId: project.id });
    assert.equal(task.status, 201);
    assert.equal((await stranger('/api/research/tasks', 'POST', { projectId: project.id })).status, 404);
    const directTask = await stranger('/api/research/tasks', 'POST', { topic: '直接发布的科研采购任务' });
    assert.equal(directTask.status, 201);
    assert.equal(directTask.data.task.projectId, '');
    assert.equal(directTask.data.task.visibility, 'private');
    assert.ok(!(await buyer('/api/state')).data.publishedTasks.some(item => item.id === directTask.data.task.id));
    assert.equal((await buyer(`/api/research/tasks/${directTask.data.task.id}`, 'PATCH', { visibility: 'public' })).status, 404);
    assert.equal((await stranger(`/api/research/tasks/${directTask.data.task.id}`, 'PATCH', { visibility: 'public' })).status, 200);
    assert.ok((await buyer('/api/state')).data.publishedTasks.some(item => item.id === directTask.data.task.id));
    assert.equal((await buyer('/api/cart', 'POST', { reagentId: 'r-001', quantity: 1 })).status, 409);
    const product = await merchant('/api/reagents', 'POST', { name: 'RNA 检测试剂盒', price: 199, stock: 3, seller: '测试商家' });
    assert.equal(product.status, 201);
    assert.equal(product.data.ownerUserId, merchantUser.id);
    assert.equal((await buyer(`/api/reagents/${product.data.id}`, 'PATCH', { price: 1 })).status, 403);
    assert.equal((await buyer('/api/cart', 'POST', { reagentId: product.data.id, quantity: 1, projectId: project.id })).status, 200);
    assert.equal((await stranger('/api/state')).data.cart.length, 0);
    assert.equal((await merchant('/api/state')).data.researchProjects.length, 0);
    assert.equal((await buyer('/api/orders/prepare-payment', 'POST', { reagentIds: [product.data.id] })).status, 400);
    const checkoutPayload = { reagentIds: [product.data.id], taskId: task.data.task.id, recipient: '测试收件人', phone: '13800138000', address: '深圳市南山区科研路 100 号' };
    failUnifiedOnce = true;
    assert.equal((await buyer('/api/orders/prepare-payment', 'POST', checkoutPayload)).status, 502);
    const checkout = await buyer('/api/orders/prepare-payment', 'POST', checkoutPayload);
    assert.equal(checkout.status, 201, JSON.stringify(checkout.data));
    const order = checkout.data.order;
    assert.equal(order.userId, buyerUser.id);
    assert.equal(order.taskId, task.data.task.id);
    assert.equal((await buyer('/api/orders/prepare-payment', 'POST', { reagentIds: [product.data.id], recipient: '测试收件人', phone: '13800138000', address: '深圳市南山区科研路 100 号' })).status, 409);
    assert.match(order.payment.qrUrl, /^data:image\/png;base64,/);
    assert.ok(Date.parse(order.expiresAt) > Date.now());
    const shanghaiExpiration = new Date(Date.parse(order.expiresAt) + 8 * 3600000).toISOString().slice(0, 19).replace(/[-:T]/g, '');
    assert.equal(unified.time_expire.slice(0, 12), shanghaiExpiration.slice(0, 12));
    assert.equal((await stranger('/api/state')).data.orders.length, 0);
    assert.equal((await merchant(`/api/merchant/orders/${order.id}/ship`, 'PATCH', { carrier: '顺丰', trackingNo: 'SF1234567890' })).status, 409);
    assert.equal((await buyer('/api/orders/confirm-payment', 'POST', { orderId: order.id })).status, 410);
    const badNotify = await fetch(base + '/api/wechat/notify', { method: 'POST', body: xml({ out_trade_no: order.outTradeNo, sign: 'INVALID' }) });
    assert.match(await badNotify.text(), /FAIL/);
    assert.equal((await buyer(`/api/orders/${order.id}/payment`)).data.paymentStatus, 'pending');
    const wrongAmount = { return_code: 'SUCCESS', result_code: 'SUCCESS', appid: unified.appid, mch_id: unified.mch_id, out_trade_no: order.outTradeNo, total_fee: '1', transaction_id: 'wx-test-transaction' };
    const rejected = await fetch(base + '/api/wechat/notify', { method: 'POST', body: xml({ ...wrongAmount, sign: sign(wrongAmount) }) });
    assert.match(await rejected.text(), /FAIL/);
    const valid = { ...wrongAmount, total_fee: unified.total_fee };
    for (let i = 0; i < 2; i++) {
      const notify = await fetch(base + '/api/wechat/notify', { method: 'POST', body: xml({ ...valid, sign: sign(valid) }) });
      assert.match(await notify.text(), /SUCCESS/);
    }
    paid = true;
    assert.equal((await buyer(`/api/orders/${order.id}/payment`)).data.paymentStatus, 'paid');
    assert.equal((await buyer(`/api/orders/${order.id}/payment`)).data.paymentStatus, 'paid');
    assert.equal((await stranger(`/api/orders/${order.id}/payment`)).status, 404);
    assert.equal((await buyer(`/api/merchant/orders/${order.id}/ship`, 'PATCH', { carrier: '顺丰', trackingNo: 'SF1234567890' })).status, 403);
    const shipping = await merchant(`/api/merchant/orders/${order.id}/ship`, 'PATCH', { carrier: '顺丰', trackingNo: 'SF1234567890' });
    assert.equal(shipping.status, 200, JSON.stringify(shipping.data));
    assert.equal((await merchant(`/api/merchant/orders/${order.id}/ship`, 'PATCH', { carrier: '顺丰', trackingNo: 'SF1234567890' })).status, 409);
    const buyerState = (await buyer('/api/state')).data;
    assert.equal(buyerState.orders[0].status, '已发货');
    assert.equal(buyerState.orders[0].fulfillments[0].trackingNo, 'SF1234567890');
    assert.equal(buyerState.cart.length, 0);
    assert.equal(buyerState.reagents.find(item => item.id === product.data.id).stock, 2);
    const merchantState = (await merchant('/api/state')).data;
    assert.equal(merchantState.merchantOrders[0].fulfillments[0].status, '已发货');
  } finally {
    app.kill(); await close(mock); fs.rmSync(storeDir, { recursive: true, force: true });
    if (appError) console.error(appError);
  }
});
