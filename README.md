# Pentarch MediCore

Offline-first health management system for Kenyan pharmacies, clinics and hospitals, with a linked public website for each facility.
By **Pentarch Systems Solutions**.

> **Demo build.** Everything works end to end on one computer and its local network. M-Pesa, KRA eTIMS, SHA claims, DHA/HIE and SMS are **simulated**; the live integrations and DHA certification come later.

## What it does

- **Setup wizard**: choose Pharmacy, Clinic or Hospital; lab in-house / outsourced / both / none; imaging; procedures; maternity; admissions (bed count); automatic or manual billing; automatic or manual checkout. Modules switch on and off to match.
- **Patients**: registration with duplicate check, SHA number, allergies, chronic conditions, consent.
- **Patient dashboard**: health bars against normal reference ranges (green / amber / red), BP, glucose, weight and lab trend charts, pregnancy progress with fundal height chart, full timeline, results, medications, bills.
- **Queue board**: triage → clinician → lab → pharmacy → cashier.
- **Visit workspace**: vitals, clinical notes with diagnosis codes, lab orders (in-house or to a partner lab with printed requisition), imaging, prescriptions with allergy warning and auto quantities, procedures with consent and consumables, admit, refer.
- **Laboratory**: worklist, sample collection, result entry with automatic flags, second-person validation, outside-lab results, test catalogue and prices.
- **Pharmacy & stock**: dispensing (first-expiry-first-out), counter sale (POS) with prescription checks, batches and expiry, receive stock, stock take, controlled drugs register, website orders.
- **Billing & checkout**: automatic or manual charges, cash / M-Pesa STK push / card / SHA / insurance, split payments, discounts with supervisor PIN, credit accounts, printable receipt.
- **Wards & beds**: bed map, admit / transfer / discharge, nursing notes, daily bed charges, digital partograph with alert and action lines.
- **Maternity**: ANC (8-contact model), deliveries, APGAR, low birth weight.
- **Referrals**: in and out, auto-built clinical summary, printable note.
- **Reports**: revenue, stock and expiry, reorder list, MOH 705A/705B (export for KHIS), MOH 711 indicators, lab workload, audit trail.
- **Facility website** (`/site`): services and prices, lab tests, medicine shop with cart (prescription items reviewed by the pharmacist), online booking. Orders and bookings land in the system.

## Run it (Windows)

1. Install **Node.js 22.13 or newer** from nodejs.org.
2. Download this repository and double-click `start-medicore.bat`.
3. The browser opens at `http://localhost:4000`. Pick a demo facility (SPENSA Pharmacy, TopCare Clinic or General hospital).
4. Sign in as any user. **Demo PIN: 1234.**

Other devices on the same Wi-Fi open the address shown in the console window (for example `http://192.168.1.20:4000`). The website is at `/site`.

## Run it (any OS)

```bash
npm run setup   # install and build once
npm start       # http://localhost:4000
```

Development: `npm run dev:server` and `npm run dev:web` (Vite on port 5173, proxied to the API).

## How it is built

- Node.js + Express server, built-in SQLite (`node:sqlite`), no native modules to compile
- React + Vite front end, Recharts for charts
- All data in one file: `data/medicore.db` (copy it to back up)
- Re-running the setup wizard resets the demo data

## Roadmap to a live product

1. Real integrations: Safaricom Daraja (M-Pesa), KRA eTIMS (VSCU), SMS
2. Cloud sync, backup and multi-branch owner dashboard; website served from the cloud
3. SHA claims and DHA Health Information Exchange via AfyaConnect; DHA certification
4. Hospital extras: theatre, HR, procurement, assets
5. Windows installer and licensing
