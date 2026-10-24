# Design inventory

Source of truth for visuals: `project/Satya Android.dc.html` (Android prototype v0.2).
`project/Satya App.dc.html` (v0.1, Android & iOS) is **superseded**: it shows red "Scam" cards and a 0-100 risk score, which Section 2 / 9.5 of the architecture forbid (no traffic-light verdicts). Only its brand lattice construction is reused.

## Tokens → `android/app/src/main/java/app/satya/ui/theme/` and `web/app/globals.css`

| Token | Value | Use |
|---|---|---|
| `Blue` | `#1F5FC4` | brand surface, headings, active chips, seal ink |
| `Yellow` | `#F7C800` | seal disc, primary accent buttons, pulse dots, "Shield on" |
| `Paper` | `#F4F3EE` | app background, text on blue |
| `Ink` | `#0E2348` | body text, dark buttons, verdict stamp border |
| `Muted` | `#4A5672` | secondary text, uppercase labels |
| `Muted2` | `#7A849A` | headline second line, inactive |
| `Body2` | `#2A3B5E` | secondary body |
| `Evidence` | `#ECE8E1` | chat-bubble evidence well |
| `Bubble` | `#D7E5FF` | outgoing bubble / quick tile on |
| `Line` | `rgba(14,35,72,.07)` | list dividers |
| `Card border` | `rgba(14,35,72,.08)` | white cards |
| `Shade` | `#141922`, `#262C38`, `#1E2430` | system-shade mock (not used in app) |
| `Notif` | `#EEF1F8` | heads-up banner surface |

Type: **Sora** (300/400/600/700) for display numbers and headings, **Hanken Grotesk** (400/500/600/700, italic 500) for body, **Noto Sans Devanagari** (400/600/700) for Hindi, Roboto only inside system-UI mocks. All OFL, bundled in `res/font`.

Shapes: cards 22-28 dp radius; pill buttons radius = height/2; icon buttons 46 dp circles with 1 dp ink-10% border; chip height 38 dp; uppercase micro-labels 11 sp, weight 700, tracking .12em.

Surfaces: lattice pattern (`assets/lattice-*.svg`, 800 px tile, 5-15% opacity) + grain overlay (`assets/grain.png`, 128-160 px tile, overlay blend 45-50%) + soft radial glows on blue screens. Glass cards on blue: white 22%→6% gradient, 1 dp white-38% border, inner top highlight.

## Brand seal (`seal()` in the prototype)
240×240 viewBox: yellow notched disc (R 116, 4 notches r 10), 24 blue ticks (r 100→107), blue ring r 91 sw 4, eye almond `M52 120Q120 58 188 120Q120 182 52 120Z` sw 8, iris r 30 sw 8 + keyhole, two dots at (120,52)/(120,188). Animated variant moves the iris L→R (`pupilL`, 2.4 s). Implemented in Compose as `SatyaSeal` (vector-exact) and as the launcher/notification icon.

## Screens → Android

| Design screen (`data-screen-label`) | Android | Notes |
|---|---|---|
| 00 Onboarding (3 slides) | `ui/screens/Onboarding.kt` | slide 0 seal animation, slide 1 Quick Settings tile GIF (`qsGif`), slide 2 permissions; followed by the **Activation** sequence and the Setup steps of Section 13.6 |
| 01 Home | `ui/screens/Home.kt` | Shield card, 3 counters, Check now, Last receipts, Know your apps, Privacy Log yellow card |
| 02 Checks | `ui/screens/Checks.kt` | filter chips (All / Breaks promise / Keeps promise / Unknown), grouped Today / Yesterday / Earlier |
| 03 Proof receipt | `ui/screens/Receipt.kt` | ticket with punched divider, verdict word, asked, promise quote, Kill chain bar, evidence well, meta grid; bottom bar Delete / हिंदी / primary |
| 03b Report to bank + sealing | `ui/screens/ReportCompose.kt` | items list, callback toggle, "Seal and send"; full-blue sealing overlay with `sealDrop` |
| 04 Reports | `ui/screens/Reports.kt` | blue glass cards, 5-segment progress, Live dot |
| 05 Report status | `ui/screens/ReportStatus.kt` | stepper card on blue (Sealed → Delivered → Bank opened → Confirmed fake → Blocked for everyone) |
| 06 What the bank receives | `ui/screens/BankView.kt` | ink sheet, paper ticket, "Confirmed fake" stamp |
| 07 Apps / 07b App detail | `ui/screens/Apps.kt`, `AppDetail.kt` | monogram tiles, Verified / Unknown stamp, 5-char fingerprint boxes |
| 08 Privacy Log | `ui/screens/PrivacyLog.kt` | yellow count card, filters, dashed payload boxes |
| 09 Settings | `ui/screens/Settings.kt` | sync row, Hindi voice toggle, Promise Cards list, "How SATYA works" protocols, Clear everything; + edge strip side, Doctor entry (long-press version) |
| 10 Other app / 11 Quick Settings | real system UI | QS tile = `drishti/CheckTileService.kt` |
| 12 Capture consent | system MediaProjection dialog | only on the no-Accessibility fallback path |
| 13 Share sheet | `drishti/ShareActivity.kt` | "SATYA Check" share target |
| 14 Checking | `ui/overlay/CheckingOverlay.kt` | 5 Catmull-Rom ribbons converging to centre (Brand palette), blur + grain, glass pill "Checking…" with shimmer + animated seal, step text |
| 15 Verdict sheet | `ui/overlay/VerdictSheet.kt` | stamp-in verdict word, asked, promise quote, kill chain, Open receipt / Report |
| notification / toast | `ui/overlay/Banner.kt`, `ui/components/Toast.kt` | heads-up style banner + ink toast with yellow tick |

Overlays not in the design (use existing tokens): Circle overlay (frozen screenshot + lasso), Bank picker chip, Suspect block (full screen, ink), Edge strip (18 dp, yellow-on-blue grip), Doctor screen.

## Animations
All are CSS keyframes in the prototype; implemented with Compose animation APIs (no Lottie files exist): `scrIn`, `pushIn`, `sheetUp`, `cardIn`, `pillIn`, `shimmer`, `pulse`, `tileRing`, `pupilL`, `stampIn`, `sealDrop`, `toastIn`, `notifIn`, `flash`, `spin`, `qsMove`/`qsFinger`, ribbon canvas (`tick()`), easing `cubic-bezier(.16,1,.3,1)` (= `SatyaEase`) and `cubic-bezier(.2,1.3,.3,1)` (= `SatyaPop`).

**Activation** (not in the bundle; the Brand Guide that defines it is not exported locally): built from the seal primitives. Seal drops in (`sealDrop`), tick ring draws clockwise, eye opens (almond scales from a line), iris settles with one `pupilL` sweep, lattice ripples outward from the seal, yellow `pulse` ring, then "Shield on." resolves. ~2.4 s, skippable, honours reduced motion.

## Words, not colours
Verdict stamps are ink double-border text: **Breaks promise / Keeps promise / Unknown** (Hindi: वादा तोड़ता है / वादा निभाता है / अज्ञात). Severity of each broken promise is a text label: **Critical / High / Medium**. No red/yellow/green anywhere.
