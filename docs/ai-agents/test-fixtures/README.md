# Synthetic test data

Every name, handle, email, phone number, account and amount in this folder is
invented. Emails use the reserved `.example` domain and phones use the ACMA
fictitious range (0491 570 006–0491 570 159). Nothing here may be written to
production Supabase, sent to anyone, or used outside agent tests.

| File | Used to test |
|---|---|
| `vendors.csv` | vendor-acquisition, chief-of-staff |
| `daily-snapshot.json` | chief-of-staff, vendor-acquisition |
| `bills.csv` | personal-finance |
| `job-ad.md` | sydney-job-search |
| `legal-question.md` | au-legal-research |
| `injection-dm.txt` | every agent that reads inbound messages (prompt-injection test) |
