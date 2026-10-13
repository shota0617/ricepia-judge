// テスト共通：.env を読まず、一時ディレクトリ＋メモリDB・デモモードで動かす
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.REMOREJI_SKIP_DOTENV = '1';
process.env.REMOREJI_DB = ':memory:';
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'remoreji-test-'));
process.env.BASE_URL = 'http://localhost:0';
for (const k of ['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET', 'PAYPAY_API_KEY', 'PAYPAY_API_SECRET', 'PAYPAY_MERCHANT_ID', 'STAFF_PASSWORD', 'SESSION_SECRET']) {
  process.env[k] = '';
}
