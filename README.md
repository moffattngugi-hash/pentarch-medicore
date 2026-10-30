# Pentarch MediCore

Offline-first health management system for Kenyan pharmacies, clinics and hospitals, with a public website for every facility.
By **Pentarch Systems Solutions**.

> **Demo build.** Everything works end to end on one computer and its local network. M-Pesa, KRA eTIMS, SHA claims, DHA/HIE and SMS are **simulated** and labelled "demo". The live integrations and DHA certification come later.

## Install at a facility (Windows)

1. On the **main computer only**, install **Node.js 22 LTS** (22.13 or newer) from nodejs.org.
2. Download this repository (Code → Download ZIP), unzip to e.g. `C:\MediCore`.
3. Double-click `start-medicore.bat`. The first run needs internet for a few minutes to install and build; after that it runs fully offline.
4. The browser opens on the setup wizard: choose **Pharmacy, Clinic or Hospital**, tick the services, enter the facility and owner details, and choose **sample data** (demos/training) or **empty** (real use).

**Updating:** close the black window, copy the `data` folder somewhere safe, unzip the new version over the same folder, then double-click `start-medicore.bat`. It notices the new version (from `version.txt`), reinstalls and rebuilds once, then starts. The version shows at the bottom of the menu.

**Other PCs, tablets and phones do not need Node.js or any installation.** Connect them to the same Wi-Fi and open the address shown in the black console window, e.g. `http://192.168.1.20:4000` (also in Settings → Other devices). Reserve a fixed IP for the main computer in the router.

## Sign-in

| Who | Username | PIN |
| --- | --- | --- |
| Pentarch super admin (sees every client) | `pentarch` | `2026` — change with the `MEDICORE_SUPER_PIN` environment variable |
| Facility owner | chosen in the wizard | chosen in the wizard |
| Sample staff (only when sample data is chosen) | e.g. `spensa.doctor`, `spensa.lab`, `spensa.cashier` | `1234` |

## What's inside

- **Dashboards you can drill into**: every summary card (collections, waiting patients, lab, beds, unpaid bills, stock value, branch totals) opens the list and breakdown behind it.
- **Superadmin console**: every client organisation and branch, patients, collections, low stock; open any branch for support; create new facilities.
- **Organisations and branches**: one owner, many branches of any type (pharmacy + clinic + hospital). Each branch keeps its own patients, stock and money; the **All branches** page combines what matters.
- **Switch type without losing data**: Settings → Type & services changes modules and menus only.
- **Patients** with health dashboards: health bars against reference ranges, BP, glucose, weight and lab trends, pregnancy tracking, full timeline.
- **Triage** (Kenya ETAT+): danger-sign checklist sets Emergency / Priority / Queue; pain score; vitals with sanity checks; BMI, MUAC and fever flags. The queue is sorted by priority.
- **Lab**: 62 tests in 8 departments with sex-specific ranges, quick panels (fever work-up, antenatal profile…), in-house or outside lab, second-person validation.
- **Pharmacy and stock**: 265 items (Kenya Essential Medicines List groups, supplies, devices, lab reagents) with product pictures, pack sizes and loose selling. Selling 10 tablets from a box of 100 updates stock straight away ("12 boxes + 40 tabs"). First-expiry-first-out batches, receiving by pack, stock counts, controlled-drugs register, photo upload per item.
- **Billing**: automatic or manual charges, cash / M-Pesa / card / SHA / insurance, discounts with supervisor PIN, credit, printable receipts.
- **Wards, maternity, referrals, appointments, MOH 705/711 reports, audit trail.**
- **Facility website** (`/site?b=<branch>`): shop by category with product pictures and cart, services, lab menu by department, booking. Orders and bookings land in the system.

Prices are indicative Nairobi retail and editable per facility.

## Going live with a real client

1. Settings → Data → **Remove sample data** (keeps catalogue, prices and settings; sets stock to zero).
2. Pharmacy → Inventory → **Receive stock** for what they actually hold.
3. Add their staff under Settings → Staff & access.
4. Back up the `data` folder weekly.

## Development

```bash
npm run setup       # install and build once
npm start           # http://localhost:4000
npm run dev:server  # API with auto-reload
npm run dev:web     # Vite on 5173, proxied to the API
```

Node.js + Express, built-in SQLite (`node:sqlite`, no native modules), React + Vite, Recharts. Data: `data/registry.db` (organisations, branches, users) and one database per branch in `data/branches/`.
