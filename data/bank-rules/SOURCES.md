# Bank-rule sources

Every promise in `spec/satya_bank_promises.json` cites one of these documents. Copies live here and in
`D:\SATYA MAIN CODE BASE\DATA SETE` (plus HTML snapshots of the bank pages there). Documents belong to
their publishers and are kept for reference. Checked on 2026-10-24.

## In this folder

| File | Publisher | Backs promise | Key statement |
|---|---|---|---|
| `Banks/PNB_Contact_Us_tollfree_numbers_receive_calls_only.pdf` | Punjab National Bank, [pnb.bank.in/contact-us.html](https://pnb.bank.in/contact-us.html) | PNB01_TOLLFREE_NEVER_CALLS_OUT | "Toll Free No. 1800 1800, 1800 2021, 1800 180 2222, 1800 103 2222 ... The Toll Free numbers are used to receive calls only and not for making outward calls." (verbatim from the page snapshot) |
| `Banks/SBI_Cyber_security_KYC_link_advisory.pdf` | State Bank of India, [sbi.co.in cyber security](https://sbi.co.in/web/personal-banking/cyber-security) | SBI01_NO_KYC_LINKS, G01 | "Do not click on any links on the SMS. Please call the bank for help or refer to the information only on the official website." |
| `Banks/AXIS_Identify_genuine_communication_official_email_domains.pdf` | Axis Bank, [identify genuine communication](https://application.axis.bank.in/WebForms/axis-support/Blogs/identify_genuine.aspx) | AXIS_EMAIL_SENDER_MISMATCH | Genuine senders: alerts@axis.bank.in, cc.statements@axis.bank.in, info@digital.axisbankmail.bank.in |
| `Banks/AXIS_Phishing_alert_never_asks.pdf` | Axis Bank, [phishing alert](https://www.axis.bank.in/fraud-awareness/prevent-frauds/phishing-alert) | G07_NO_SAFE_ACCOUNT, G01 | The bank never requests money transfers by email or any other medium |
| `Banks/ICICI_Fraud_prevention_never_asks.pdf` | ICICI Bank, [fraud prevention](https://www.icici.bank.in/personal-banking/debt-service/fraud-prevention) | G01_NO_SECRETS | Employees never ask for CVV, PIN, password, OTP, card or account number |
| `TRAI-DoT/TRAI_TCCCPR_2018_consolidated_21May2026.pdf` | TRAI (consolidated text, May 2026) | G05_SMS_FROM_HEADER_NOT_NUMBER | Commercial communication only through registered headers (regulation 3) |
| `TRAI-DoT/TRAI_PR_135_2025_BFSI_1600_series_deadlines.pdf` | TRAI Press Release 135/2025 | G03_SERVICE_CALLS_1600, G04 | 1600 series for BFSI service/transactional calls; banks onboard by 1 Jan 2026 |

## Save these by hand (RBI's site serves a browser check that scripts must not bypass)

Open each link in a browser, click the PDF, and save it into `DATA SETE\RBI\` with the file name shown.
Then copy them here and update the `source_doc` paths in the registry if a name differs.

| Save as | Open | Backs promise |
|---|---|---|
| `RBI_2025-26_28_Migration_to_bank.in_domain_22Apr2025.pdf` | https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12837 | G02_LINK_BANK_IN |
| `RBI_2024-25_105_Frauds_via_voice_calls_SMS_1600_140_series_17Jan2025.pdf` | https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12770 | G03_SERVICE_CALLS_1600 |
| `RBI_BEAWARE_Booklet_Modus_Operandi_Financial_Frauds_2022.pdf` | https://www.rbi.org.in/scripts/BS_PressReleaseDisplay.aspx?prid=53372 | G07, PNB02 |
| `RBI_PR_1794_Cautions_against_KYC_updation_frauds_02Feb2024.pdf` | https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=57244 | G08_NO_KYC_FEE |
| `RBI_PR_851_Cautions_against_KYC_updation_frauds_13Sep2021.pdf` | https://rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=52216 | G01_NO_SECRETS |
| `NPCI_UPI_Safety_Shield.pdf` (print the page to PDF) | https://www.npci.org.in/what-we-do/upi/upi-safety-shield | G06_NO_REMOTE_ACCESS, G01 (UPI PIN is not needed to receive money) |
