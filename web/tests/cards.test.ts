// Promise Card publishing: the gateway refuses anything a phone would reject, and anything outside
// the console's editing contract (official-channel lists only).
import { describe, expect, it } from 'vitest';
import { BUNDLE } from '../lib/bundle';
import { checkCard } from '../lib/registry';
import { signHex, signKeypair } from '../lib/satya/crypto';
import { evaluate, ruleBookFromCards } from '../lib/satya/rules';

const root = BUNDLE.banks.find((b) => b.bank_id === 'SBI')!.card.card_json;
const card = JSON.parse(root);
const next = (over: Record<string, unknown> = {}) => JSON.stringify({ ...card, issued_at: '2026-10-25T09:00:00.000Z', ...over });

describe('Promise Card publishing', async () => {
  const kp = await signKeypair();
  const other = await signKeypair();
  const check = async (json: string, by = kp) => checkCard('SBI', json, await signHex(json, by.sk), root, kp.pk);

  it('accepts a newer card that only changes official-channel lists, signed by the bank', async () => {
    expect(await check(next({ extra_allowed_link_hosts: [...card.extra_allowed_link_hosts, 'yonobusiness.sbi'] }))).toBeNull();
  });

  it('refuses a signature from any other key', async () => {
    expect((await check(next(), other))?.problem).toBe('bad_signature');
  });

  it('refuses a change to the promises, the name or the bank id', async () => {
    expect(await check(next({ promises: [] }))).toEqual({ problem: 'locked_field_changed', field: 'promises' });
    expect((await check(next({ name: 'Not SBI' })))?.problem).toBe('locked_field_changed');
    expect((await check(next({ bank_id: 'HDFC' })))?.problem).toBe('wrong_bank');
  });

  it('refuses malformed entries and a card that is not newer', async () => {
    expect(await check(next({ sms_headers: ['sbi inb'] }))).toEqual({ problem: 'bad_entry', field: 'sms_headers' });
    expect((await check(next({ web_domains: ['https://sbi.bank.in/x'] })))?.problem).toBe('bad_entry');
    expect((await check(next({ issued_at: card.issued_at })))?.problem).toBe('not_newer');
  });

  it('the stage demo: a genuine new SBI host is flagged by the root card and passes after publishing', () => {
    const g = JSON.parse(BUNDLE.global.card_json);
    const cards = BUNDLE.banks.map((b) => JSON.parse(b.card.card_json));
    const msg = { text: 'Dear Customer, your YONO Business cashback of Rs 500 is credited. View details at yonobusiness.sbi/offers - SBI', channel: 'sms' as const, sender: 'VM-SBIINB' };
    expect(evaluate(ruleBookFromCards(g, cards), msg).hits).toEqual([['G02_LINK_BANK_IN', 'high']]);
    cards[0].extra_allowed_link_hosts.push('yonobusiness.sbi');
    expect(evaluate(ruleBookFromCards(g, cards), msg).hits).toEqual([]);
  });
});
