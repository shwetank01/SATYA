// What SATYA asks Sarvam, and how answers are checked before anyone sees them. The phone's rules
// still decide "Breaks promise"; these answers label the ask, explain it in plain words, and can
// raise "Looks like a scam" only when the rules had nothing to say (see Android CheckRunner).
import { chatJson, SarvamError, type ChatMessage } from './sarvam';
import { mask } from '../satya/mask';

export const ASK_TYPES = ['share_secret', 'remote_access', 'move_money', 'pay_fee', 'click_link', 'kyc_update', 'call_back', 'sales_offer', 'info_only', 'other'] as const;
export const BANKS = ['SBI', 'HDFC', 'ICICI', 'AXIS', 'PNB', 'OTHER', 'NONE'] as const;
export const RISKS = ['scam', 'suspicious', 'safe', 'unclear'] as const;

export interface Analysis {
  ask_type: (typeof ASK_TYPES)[number] | 'unknown';
  claimed_bank: (typeof BANKS)[number];
  urgency: 'high' | 'normal';
  confidence: number;
  risk: (typeof RISKS)[number];
  summary: string;
  summary_hi: string;
  reasons: string[];
  advice: string;
  advice_hi: string;
  source: 'ai' | 'fallback';
  model: string;
  /** Why the fallback was used (e.g. sarvam_http_429); never contains the key or the text. */
  error?: string;
}

// The labelling half is VIVEK's Appendix H prompt + guidance (19/20 tuning, 13/14 held out on Qwen3-4B),
// unchanged so the ask types stay identical to AskMapping on the phone. The explanation half is new.
const SYSTEM = `You are SATYA, a fraud checker for Indian bank customers. You read one message, call transcript or screen text and say what it asks the reader to do.
The text is masked: tokens like [UPI_1], [LINK_1], [PHONE_1], [CODE], [ACCOUNT], [NAME] replace real values. It may be English, Hindi or Hinglish. It may contain unrelated screen text (buttons, times); ignore it.

What banks, the RBI and NPCI have promised, in writing, never to do:
- ask for an OTP, PIN, UPI PIN, CVV, password or full card number, by any channel;
- ask you to install a screen-sharing or remote app (AnyDesk, TeamViewer, QuickSupport, RustDesk);
- ask you to move money to a "safe", "secure" or "verification" account;
- ask for a fee, fine or charge to complete or keep KYC;
- send a link by SMS, WhatsApp or email to update KYC or log in;
- call from a personal 10-digit mobile number for service or offers (they use 1600 / 140 series and official toll-free numbers).
A genuine OTP SMS, debit or credit alert, or "never share your OTP" warning asks nothing: that is info_only and safe.

Reply with ONLY one JSON object:
{"ask_type":"...","claimed_bank":"...","urgency":"high|normal","confidence":0.0,"risk":"scam|suspicious|safe|unclear","summary":"...","summary_hi":"...","reasons":["..."],"advice":"...","advice_hi":"..."}

ask_type, one of:
share_secret (asks for OTP, PIN, UPI PIN, CVV, password or card details),
remote_access (asks to install or open a screen-share or remote-control app),
move_money (asks to transfer money to another, safe, secure or verification account),
pay_fee (asks to pay a fee, fine, charge or penalty),
click_link (asks to open a link to log in, verify or update),
kyc_update (asks to update KYC, PAN or Aadhaar),
call_back (asks to call a number),
sales_offer (loan, card or product offer),
info_only (informs, asks nothing),
other.
Several asks: pick the most dangerous, in this order: share_secret, remote_access, move_money, pay_fee, click_link, kyc_update, call_back, sales_offer.
Asking to tell, say, read out or send any code, OTP, PIN or "number that came on your phone" is share_secret in any language (batao, bata dijiye, bolo, बताइए, बोलिए, भेजें).
"pin code" or "पिन कोड" with an address or delivery is a postal code: other.
Paying any amount (fee, charge, clearance, penalty, fine) is pay_fee, even when a link is given.
claimed_bank, one of SBI, HDFC, ICICI, AXIS, PNB, OTHER, NONE. YONO is SBI, iMobile is ICICI, PayZapp is HDFC, PNB ONE is PNB. OTHER only when another bank, wallet or regulator is named (Kotak, RBI, Paytm). NONE when no bank is named.

risk:
scam = it asks for something a bank promised never to ask for, or pressures the reader to pay or act now with threats;
suspicious = it asks the reader to act (click, call, pay, install) and something is off, but no promise is clearly broken;
safe = it asks nothing risky (alerts, OTP delivery, plain information);
unclear = too little text to tell.
summary: one plain English sentence, at most 25 words, saying what the message wants and why it is or is not risky. No jargon, no masked tokens.
summary_hi: the same sentence in simple Hindi (Devanagari).
reasons: 1 to 3 short English phrases naming the warning signs actually present in the text. Empty for safe.
advice: one short English sentence telling the reader what to do next (for scams: do not reply, pay or share; report to the bank; call 1930 if money was lost).
advice_hi: the same advice in simple Hindi.
confidence: 0 to 1, how sure you are of ask_type.`;

const FEW_SHOT: [string, Partial<Analysis>][] = [
  ['Kotak se bol rahe hain, aapke phone pe jo OTP aaya hai wo bolo warna card band ho jayega', {
    ask_type: 'share_secret', claimed_bank: 'OTHER', urgency: 'high', confidence: 0.95, risk: 'scam',
    summary: 'A caller claiming to be Kotak wants the OTP on your phone and threatens to block your card. Banks never ask for OTPs.',
    summary_hi: 'कोटक के नाम पर कोई आपके फ़ोन पर आया OTP माँग रहा है और कार्ड बंद करने की धमकी दे रहा है। बैंक कभी OTP नहीं माँगते।',
    reasons: ['Asks for an OTP', 'Threatens to block the card'],
    advice: 'Do not share the OTP. Hang up and call the number on the back of your card.',
    advice_hi: 'OTP न बताएँ। फ़ोन काटें और कार्ड के पीछे लिखे नंबर पर कॉल करें।',
  }],
  ['[CODE] is your OTP to log in to HDFC NetBanking. Never share it with anyone. Not you? Call 18002586161', {
    ask_type: 'info_only', claimed_bank: 'HDFC', urgency: 'normal', confidence: 0.9, risk: 'safe',
    summary: 'This is a normal HDFC login OTP message. It asks you for nothing and warns you not to share the code.',
    summary_hi: 'यह HDFC का सामान्य लॉगिन OTP संदेश है। यह कुछ नहीं माँगता और कोड किसी को न बताने को कहता है।',
    reasons: [], advice: 'If you did not try to log in, call HDFC on its official number.',
    advice_hi: 'अगर आपने लॉग इन नहीं किया, तो HDFC के आधिकारिक नंबर पर कॉल करें।',
  }],
  ['Your FASTag is suspended. Pay Rs 99 reactivation charge at [LINK_1] today', {
    ask_type: 'pay_fee', claimed_bank: 'NONE', urgency: 'high', confidence: 0.9, risk: 'scam',
    summary: 'The message asks you to pay a reactivation charge through a link today. Fee-by-link messages are a common scam.',
    summary_hi: 'संदेश आज ही एक लिंक से शुल्क भरने को कहता है। लिंक से फ़ीस माँगना आम ठगी है।',
    reasons: ['Asks for a payment through a link', 'Creates urgency'],
    advice: 'Do not pay through the link. Check FASTag status only in your bank or NHAI app.',
    advice_hi: 'लिंक से भुगतान न करें। FASTag की स्थिति सिर्फ़ अपने बैंक या NHAI ऐप में देखें।',
  }],
];

const FALLBACK: Omit<Analysis, 'model'> = {
  ask_type: 'unknown', claimed_bank: 'NONE', urgency: 'normal', confidence: 0, risk: 'unclear',
  summary: '', summary_hi: '', reasons: [], advice: '', advice_hi: '', source: 'fallback',
};

const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const pick = <T extends readonly string[]>(v: unknown, allowed: T, dflt: T[number]): T[number] =>
  (typeof v === 'string' && (allowed as readonly string[]).includes(v) ? v : dflt) as T[number];

/** Never trust the model's shape: every field is clamped to the documented enum or length. */
export function cleanAnalysis(raw: any, model: string): Analysis {
  const askType = pick(raw?.ask_type, ASK_TYPES, 'other');
  const risk = pick(raw?.risk, RISKS, 'unclear');
  const conf = Number(raw?.confidence);
  return {
    ask_type: askType,
    claimed_bank: pick(raw?.claimed_bank, BANKS, 'NONE'),
    urgency: raw?.urgency === 'high' ? 'high' : 'normal',
    confidence: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0.5,
    risk,
    summary: clip(raw?.summary, 240),
    summary_hi: clip(raw?.summary_hi, 240),
    reasons: Array.isArray(raw?.reasons) ? raw.reasons.map((r: unknown) => clip(r, 80)).filter(Boolean).slice(0, 3) : [],
    advice: clip(raw?.advice, 200),
    advice_hi: clip(raw?.advice_hi, 200),
    source: 'ai',
    model,
  };
}

export function analysisMessages(maskedText: string, hint: { bank?: string | null; channel?: string | null; sender?: string | null } = {}): ChatMessage[] {
  const msgs: ChatMessage[] = [{ role: 'system', content: SYSTEM }];
  for (const [text, answer] of FEW_SHOT) msgs.push({ role: 'user', content: text }, { role: 'assistant', content: JSON.stringify(answer) });
  const ctx = [hint.channel && `channel: ${hint.channel}`, hint.sender && `sender: ${hint.sender}`, hint.bank && `bank the phone detected: ${hint.bank}`].filter(Boolean).join('; ');
  msgs.push({ role: 'user', content: (ctx ? `[${ctx}]\n` : '') + maskedText });
  return msgs;
}

/**
 * Masks again (defence in depth: the phone already masked) and asks Sarvam. Never throws: a failed
 * call returns the documented fallback so a check is never blocked on the cloud.
 */
export async function analyze(text: string, hint: { bank?: string | null; channel?: string | null; sender?: string | null } = {}, model = 'sarvam-105b'): Promise<Analysis> {
  const masked = mask(text).slice(0, 4000);
  if (!masked.trim()) return { ...FALLBACK, model };
  try {
    const raw = await chatJson<any>(analysisMessages(masked, { ...hint, sender: hint.sender ? mask(hint.sender) : null }), { maxTokens: 600, timeoutMs: 15_000 });
    return cleanAnalysis(raw, model);
  } catch (e) {
    return { ...FALLBACK, model, error: e instanceof SarvamError ? e.message : 'ai_failed' };
  }
}

// ---------------------------------------------------------------- Know Your App

export interface AppOpinion {
  impersonates: string | null;
  risk: 'high' | 'medium' | 'low';
  reason: string;
  source: 'ai' | 'fallback';
}

const APP_SYSTEM = `You help Indian phone users spot fake banking and KYC apps. You get ONLY an installed app's public metadata: its name, package id and how it was installed. No personal data.
Real bank and UPI apps come from the Play Store or Galaxy Store under the bank's own package id (for example com.sbi.lotusintouch for SBI YONO, com.csam.icici.bank.imobile for ICICI iMobile, com.snapwork.hdfc for HDFC, com.axis.mobile for Axis, com.phonepe.app, net.one97.paytm, com.google.android.apps.nbu.paisa.user).
Scam apps are usually APKs sent over WhatsApp, SMS or a website, with names like "SBI KYC Update", "YONO Rewards", "Bank Customer Support" or "PM Kisan", and package ids that do not belong to the bank.
A normal app that is not about banking (a game, a shopping app, a utility) is low risk even if sideloaded.
Reply with ONLY JSON: {"impersonates":"SBI|HDFC|ICICI|AXIS|PNB|OTHER|null","risk":"high|medium|low","reason":"one plain sentence, at most 25 words"}`;

export async function appOpinion(app: { label: string; pkg: string; installer: string | null; source: string }): Promise<AppOpinion> {
  const user = `name: ${clip(app.label, 80)}\npackage: ${clip(app.pkg, 120)}\ninstalled by: ${clip(app.installer ?? 'unknown', 80)} (${clip(app.source, 60)})`;
  try {
    const raw = await chatJson<any>([{ role: 'system', content: APP_SYSTEM }, { role: 'user', content: user }], { maxTokens: 200, timeoutMs: 12_000 });
    const imp = typeof raw?.impersonates === 'string' && ['SBI', 'HDFC', 'ICICI', 'AXIS', 'PNB', 'OTHER'].includes(raw.impersonates) ? raw.impersonates : null;
    return { impersonates: imp, risk: pick(raw?.risk, ['high', 'medium', 'low'] as const, 'medium'), reason: clip(raw?.reason, 200), source: 'ai' };
  } catch {
    return { impersonates: null, risk: 'medium', reason: '', source: 'fallback' };
  }
}

// ---------------------------------------------------------------- NYAYA case brief

export interface CaseBrief {
  headline: string;
  what_happened: string;
  modus_operandi: string;
  recommended_action: 'block' | 'investigate' | 'dismiss';
  action_reason: string;
  source: 'ai' | 'fallback';
}

const BRIEF_SYSTEM = `You write a short case brief for a bank's fraud desk from a customer's report. The customer's own details are already masked; the scammer's UPI IDs, numbers and links are real and the bank needs them.
Reply with ONLY JSON: {"headline":"max 12 words","what_happened":"2 sentences","modus_operandi":"1 sentence naming the scam pattern","recommended_action":"block|investigate|dismiss","action_reason":"1 sentence"}
Recommend block when the message clearly impersonates the bank and asks for something the bank never asks for; investigate when it is likely fraud but evidence is thin; dismiss when it is a genuine bank message.`;

export async function caseBrief(report: unknown): Promise<CaseBrief> {
  try {
    const raw = await chatJson<any>([{ role: 'system', content: BRIEF_SYSTEM }, { role: 'user', content: JSON.stringify(report).slice(0, 6000) }], { maxTokens: 400, timeoutMs: 15_000 });
    return {
      headline: clip(raw?.headline, 120), what_happened: clip(raw?.what_happened, 400), modus_operandi: clip(raw?.modus_operandi, 240),
      recommended_action: pick(raw?.recommended_action, ['block', 'investigate', 'dismiss'] as const, 'investigate'),
      action_reason: clip(raw?.action_reason, 240), source: 'ai',
    };
  } catch {
    return { headline: '', what_happened: '', modus_operandi: '', recommended_action: 'investigate', action_reason: '', source: 'fallback' };
  }
}
