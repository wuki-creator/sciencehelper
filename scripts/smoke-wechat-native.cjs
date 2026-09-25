// Run on an isolated release directory with its production .env. Creates one unpaid 0.01 CNY prepay only.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

async function port() {
  const server = http.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const result = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return result;
}
async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sciencehelper-native-smoke-'));
  const appPort = await port();
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(appPort), PAPERPILOT_DATA_DIR: dataDir, NODE_ENV: 'test' }, stdio: 'ignore' });
  const base = `http://127.0.0.1:${appPort}`;
  let cookie = '';
  async function api(url, payload) {
    const response = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(payload) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    const result = await response.json();
    if (!response.ok) throw new Error(`${url}: ${response.status} ${result.error}`);
    return result;
  }
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch(base)).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error('Local smoke server did not start');
    await api('/api/auth/register', { name: 'Native 隔离测试', email: `native-smoke-${Date.now()}@example.invalid`, password: 'local-smoke-password' });
    const product = await api('/api/reagents', { name: '隔离测试试剂', price: 0.01, stock: 1, seller: '隔离测试商家' });
    await api('/api/cart', { reagentId: product.id, quantity: 1 });
    const result = await api('/api/orders/prepare-payment', { reagentIds: [product.id], recipient: '隔离测试', phone: '13800138000', address: '深圳市南山区仅供隔离验证的测试地址' });
    if (result.payment.mode !== 'wechat-native' || !result.payment.qrUrl?.startsWith('data:image/png;base64,')) throw new Error('Native payment did not return a local QR image');
    console.log(JSON.stringify({ prepay: 'SUCCESS', qrImage: 'local PNG data URL', orderStatus: result.order.status, amountCents: 1, note: 'Unpaid prepay only; no real transaction or production data written' }));
  } finally {
    child.kill();
    await new Promise(resolve => child.once('exit', resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
