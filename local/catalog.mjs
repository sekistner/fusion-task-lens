import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const source = 'https://api.deepinfra.com/models/list';
const sourcePage = 'https://deepinfra.com/deepseek-ai/DeepSeek-V4.1-Flash';
export function parseDeepInfra(rows, now = new Date().toISOString()) {
  const row = rows.find(row => row.model_name === 'deepseek-ai/DeepSeek-V4.1-Flash');
  const p = row?.pricing;
  if (!p || p.type !== 'tokens' || ![p.cents_per_input_token, p.cents_per_output_token, p.rate_per_input_token_cached].every(n => Number.isFinite(n) && n >= 0)) throw new Error('Provider price format unavailable');
  const discount = p.discount ?? 0;
  if (!Number.isFinite(discount) || discount < 0 || discount >= 1) throw new Error('Invalid provider discount');
  const active = !p.discount_ends_at || Date.parse(p.discount_ends_at) > Date.parse(now);
  const factor = active ? 1 - discount : 1;
  const input = p.cents_per_input_token * 10_000 * factor;
  return { prices: { input, output: p.cents_per_output_token * 10_000 * factor, cacheRead: input * p.rate_per_input_token_cached },
    priceSource: sourcePage, priceAsOf: now, priceFresh: true, providerContextTokens: row.max_tokens,
    promotionExpiresAt: active && discount > 0 ? p.discount_ends_at ?? null : null, promotion: active && discount > 0 ? `${Math.round(discount * 100)}% provider promotion; standard tier` : 'Standard tier' };
}
export async function catalogSnapshot(root, refresh = false) {
  const models = JSON.parse(await readFile(join(root, 'local-models.json'), 'utf8'));
  let saved;
  try { saved = JSON.parse(await readFile(join(root, 'prices.json'), 'utf8')); } catch {}
  if (refresh || !saved || Date.now() - Date.parse(saved.priceAsOf) > 900_000 || (saved.promotionExpiresAt && Date.parse(saved.promotionExpiresAt) <= Date.now())) {
    try {
      const response = await fetch(source, { signal: AbortSignal.timeout(5000), redirect: 'error' });
      if (!response.ok) throw new Error('Provider price lookup unavailable');
      saved = parseDeepInfra(await response.json());
      await writeFile(join(root, 'prices.json'), JSON.stringify(saved), { mode: 0o600 });
    } catch { if (saved) saved.priceFresh = false; }
  }
  return models.map(model => model.id === 'flash' ? { ...model, ...saved, priceFresh: saved?.priceFresh === true && Date.now() - Date.parse(saved.priceAsOf) < 900_000 && (!saved.promotionExpiresAt || Date.parse(saved.promotionExpiresAt) > Date.now()) } : model);
}
