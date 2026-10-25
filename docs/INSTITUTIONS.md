# NYAYA for institutions: who pays, and why

SATYA is free for people. NYAYA is what institutions pay for.

This document covers:
- the business case and each feature's reason to buy;
- how NYAYA prices;
- what makes it hard to copy;
- the seven-minute demo for judges.

> **Transaction monitoring sees the payment. SATYA sees the persuasion, before the payment.**
>
> A bank's fraud systems watch transactions. By the time money moves in a social-engineering fraud, the customer has already been persuaded: an SMS, a call or a cloned voice asked for something the bank has promised never to ask for. SATYA catches that ask on the customer's phone. NYAYA gives the institution what comes out of it: sealed reports, campaigns, mule accounts, and a payment check that a deepfake cannot talk its way past.

## Why now

| Fact | Source |
|---|---|
| Indians lost **Rs 22,845.73 crore** to cyber fraud in 2024, up about 206% from Rs 7,465 crore in 2023. There were **36,37,288** financial-fraud incidents on NCRP/CFCFRMS. | MHA written reply, Lok Sabha, July 2025 ([PTI via The Week](https://www.theweek.in/wire-updates/business/2025/07/22/del23-lsq-cyber-fraud.html), [Scroll](https://scroll.in/latest/1084796/indians-lost-rs-22845-crore-to-cyber-fraud-in-2024-a-206-rise-from-previous-year-centre)) |
| RBI's Master Directions on Fraud Risk Management (15 July 2024) strengthen Early Warning Signals, extend them to non-credit transactions, and require timely reporting to law enforcement. | [RBI Master Directions](https://www.rbi.org.in/Scripts/BS_ViewMasterDirections.aspx?id=12702) |
| Mule accounts are a regulator priority: RBI Innovation Hub's MuleHunter.AI was announced in December 2024 and adopted by 23 banks by December 2025. | [MediaNama, RTI reply](https://www.medianama.com/2025/12/223-rti-23-banks-mulehunter-mule-accounts/) |
| Fraud intelligence still stays largely inside the bank that sees it, which is why RBI and banks are building the Digital Payment Intelligence Platform. | [PTI via The Week, June 2025](https://www.theweek.in/wire-updates/business/2025/06/22/dcm13-biz-digital-fraud.html) |
| Official channels are now written down. Banks had to move to `.bank.in` domains by 31 October 2025, and service calls to the 1600 series (commercial banks by 1 January 2026). These are exactly the promises SATYA checks. | [RBI via The Week](https://www.theweek.in/wire-updates/business/2025/04/22/dcm87-biz-rbi-bank-domain.html), [TRAI via Outlook Business](https://www.outlookbusiness.com/news/trai-sets-firm-deadlines-for-bfsi-entities-to-adopt-1600-series-for-service-transactional-calls) |
| A deepfake video call of a "CFO" took HK$200 million (about US$25.6 million) from Arup's Hong Kong office in January 2024. | [CNN via ABC17](https://abc17news.com/money/cnn-business-consumer/2024/05/16/british-engineering-giant-arup-revealed-as-25-million-deepfake-scam-victim/) |

## Who pays, and for what

| Buyer | Their problem | What they buy | The number it moves |
|---|---|---|---|
| **Bank fraud desk** (FRM, cyber-fraud cell) | Learns about an impersonation campaign from complaints after customers have lost money. | Radar, sealed Case Review, One-Click Kill, Overview | Time from first report to block; customers warned |
| **Bank anti-money-laundering and mule teams** | Mule accounts are found from transaction patterns, after the money has landed. | Mule Watch | Mule accounts frozen before the next transfer |
| **Bank digital and contact centre** | "Is this message really from you?" calls take agent time and get inconsistent answers. | Scam Check copilot, Scam Check API | Handling time; consistent answers in English and Hindi |
| **Bank brand and compliance** | Genuine campaigns get flagged as phishing; regulators ask for an audit trail. | Promise Card Builder, Audit trail, Case register export | False alarms on genuine messages; audit readiness |
| **Company CFO and treasury** | Business email compromise and cloned-voice CEO fraud. | Pay Check, Verify Before Release, Evidence PDF | Money stopped by a callback (measured, not estimated) |

The bank is also the **channel to companies**: Pay Check can be offered inside a bank's corporate banking, with the bank sharing the revenue.

## The ten features

Six come from the original specification (I1, I2, I3, I5, I6 with I7, I8 with I9). Four were added because they are what an institution renews on.

| # | Feature | Why an institution pays | What to show a judge |
|---|---|---|---|
| 1 | **Fraud Overview** (new) | The renewal screen: reports, speed, and customers warned, turned into loss avoided with the assumption on screen. | SBI → Overview. Change "1 in N" and the rupee figure follows. |
| 2 | **Impersonation Radar** (I2) | One scammer UPI ID can reach dozens of customers. The desk acts once per campaign, not once per complaint. | SBI → Radar: the live KYC-fee campaign with 7 reports from one UPI ID. |
| 3 | **Case Review** (I3) | The full evidence in one click: the message, the broken promise with its official source, and the scammer's values. It is opened with the bank's own key, and SATYA cannot read it. | Inbox → open a report. It decrypts in the browser. |
| 4 | **One-Click Kill** (I5) | A confirmed fake is blocked on every SATYA phone at the next sync, for every bank's customers. | Block the KYC-fee UPI ID: all 7 reports close and the Radar campaign turns Blocked. |
| 5 | **Mule Watch** (new) | Routes each confirmed scam account to the bank that holds it. That bank freezes it before the next victim pays. | SBI → Mule Watch: HDFC confirmed `rahul.kyc99@oksbi`. Load the sample list and match it privately. |
| 6 | **Promise Card Builder** (I1, free tier) | The bank, not SATYA, says what is official, signed with its own key. Fewer false alarms on genuine campaigns. | SBI → Promise Card: the YONO Business SMS breaks G02. Add `yonobusiness.sbi`, sign and publish, and it passes. |
| 7 | **Scam Check copilot and API** (new) | The same check inside the bank's app, IVR and chatbot, with the words for an agent to say. Billed per call. | Scam Check → "KYC link". API access → create a key → Try it. |
| 8 | **Pay Check with Pay Rules** (I6, I7) | A cloned CFO voice still breaks the company's own rules: a new account, the wrong channel, over the limit, urgent and secret. | Acme → Pay Check → "CFO voice note" → HOLD. The network adds "confirmed fake by AXIS". |
| 9 | **Verify Before Release and Evidence PDF** (I8, I9) | A cloned voice cannot answer a call the company places. Every decision is signed, for auditors, insurers and the police. | "Called: they did not ask" → Blocked → Download Evidence PDF. |
| 10 | **Named analysts and Audit trail** (new) | Who blocked what, and when. Regulators and internal audit ask for this first. | Audit trail: every step above, with names. |

## Pricing (hypotheses for pilots)

The pilot will test these; they are not quotes.

- **Free:** Promise Card Builder and the Scam Check console.
  - Every bank that publishes a card makes SATYA more accurate for its customers.
  - The cost is near zero, because the rules run on the phone.
- **Fraud Desk licence** (per bank, per year, tiered by customer base) covers Radar, Case Review, Kill, Mule Watch, Overview and the audit trail.
  - We would anchor the price to the Overview's own number. In a pilot, the fee is capped at a fixed share of the loss the bank agrees was avoided.
- **Scam Check API:** per 1,000 checks, in slabs. Rules-only calls (`"ai": false`) cost less because they make no AI call.
- **Pay Check:** per company per month, sold directly or through the bank's corporate banking, with the bank sharing the revenue.

The unit of value is easy to check. One prevented fraud is worth Rs 62,810 on the 2024 average, so a bank needs to prevent only a handful a month for the licence to pay for itself.

## Why this is hard to copy

1. **Network effect across banks.** Each block protects every bank's customers at once, and each block of a mule account is routed to the bank that holds it. One bank cannot build this alone.
2. **Bank-signed truth.** The Promise Cards are signed by SATYA's root key and then by each bank's own key, and every phone verifies them.
3. **Privacy architecture.** Reports are sealed on the phone to the bank's key, and the gateway stores a box it cannot open. Account lookups send only 5-character prefixes. Pay Check requests never leave the company's browser. This is easier to defend under the DPDP Act than a system that collects content.
4. **Rules decide; AI explains.** "Breaks promise" comes only from written, sourced promises, so a verdict is explainable to a customer, a regulator or a court. The AI (Sarvam) adds plain-language explanations in English and Hindi, and can only add "Looks like a scam".

## How SATYA fits next to what exists

| Category | What it sees | SATYA's place |
|---|---|---|
| Caller-ID apps | Who is calling | SATYA checks what is being *asked*, on every channel |
| Bank transaction monitoring (FRM) | The payment | SATYA sees the persuasion before the payment, and feeds the desk |
| Brand-protection and takedown services | Fake sites and apps on the web | SATYA sees what reached the customer and blocks it on phones in minutes |
| RBI MuleHunter.AI | Mule patterns in transaction data | Mule Watch adds customer-reported, bank-confirmed mule accounts. The two complement each other. |
| Digital Payment Intelligence Platform | Real-time intelligence shared between banks | SATYA's blocks and herd counts are the kind of signal it is meant to share |

## Demo script (7 minutes)

Before the session, run `npm run demo:seed` in `web/` and import `keys/demo_keys.json` once in the browser.

1. **SBI → Overview** (1 min): the loss avoided, the 1-in-N assumption, and customers warned.
2. **Radar → the live KYC-fee campaign → open a case** (1 min). It decrypts in the browser; read out the broken promise and its source.
3. **Block for everyone** (30 s): 7 reports close, and the phone shows "Confirmed fake by SBI" at its next sync.
4. **Mule Watch** (1 min): HDFC's block of `rahul.kyc99@oksbi` lands at SBI. Load the sample list, match it, and point out that nothing left the browser.
5. **Promise Card** (1 min): "Add yonobusiness.sbi (demo)". The preview flips from Breaks promise to No broken promise; then sign and publish.
6. **Sign in as Acme → Pay Check → "CFO voice note"** (1.5 min): HOLD on five reasons, including "confirmed fake by AXIS". Verify before release, "they did not ask", and download the Evidence PDF.
7. **Audit trail** (30 s): everything you just did, with names.

## What is real and what is demo

| Part | Status |
|---|---|
| Rules engine, sealing, signatures, prefix lookups, all ten console features | Real; 103 unit tests and the 25-step `scripts/smoke.ts` |
| Demo reports, campaigns, mules and Acme history | Written by `scripts/demo-data.ts`, flagged and labelled "Demo", removed by `npm run demo:clean` |
| Deepfake voice score in Pay Check | Not hosted; the decision does not depend on it (VIVEK runs self-hosted, Section 11) |
| Analyst identity | A name plus a shared or per-organisation password; SSO and maker-checker for blocks are next |
| Storage | Private Vercel Blob with compare-and-swap; the Section 12 Postgres schema is the path to bank scale |

## Next 90 days

- Postgres (Section 12), SSO, and maker-checker approval for blocks.
- Bank advisories pushed to phones with the registry.
- I4C and DPIP data feeds.
- The hosted deepfake service (VIVEK).
- A pilot with one bank's fraud desk and one corporate-banking client.
