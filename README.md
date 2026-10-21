# GreenPulse — Intelligent Swachhta & Sustainability Compliance Monitoring

**INSPECT → DETECT → ACT → VERIFY → IMPROVE**

A MERN application (MongoDB · Express · React · Node, all TypeScript) in which inspectors scan a
**location QR code** with a phone camera, complete a digital checklist, and the system scores the
inspection, raises issues, lets the admin assign them to staff, and lets the inspector verify the
fix using before/after photos.

---

## 1. Demo logins (one common login page — the role is detected automatically)

| Role       | Email                 | Password         | Lands on                |
|------------|-----------------------|------------------|-------------------------|
| ADMIN      | `admin@gmail.com`     | `GreenPulse@123` | `/admin/dashboard`      |
| INSPECTOR  | `inspector@gmail.com` | `GreenPulse@123` | `/inspector/dashboard`  |
| STAFF      | `staff@gmail.com`     | `GreenPulse@123` | `/staff/dashboard`      |

You never choose a role. The server looks the user up in MongoDB and reads the role from there.
The logged-in **name, email and role badge** are always visible (top-right + sidebar).

## 2. Run it

**Prerequisites:** Node.js 20+, and MongoDB (local `mongod`, or a free MongoDB Atlas connection string).

```bash
npm run install:all                 # installs root + server + client
cp server/.env.example server/.env  # then edit MONGODB_URI (and set your own JWT_SECRET)
npm run dev                         # API on :5000, web on http://localhost:5173
```

On first start the server **seeds MongoDB automatically** (only if empty): the 3 demo users, 4 locations
(Library, Boys Hostel, CSE Block, ECE Block), the checklist standards, and ~11 back-dated inspections
with issues so the dashboard, trend chart, leaderboard and risk alerts are populated.
**"Main Canteen" is deliberately not seeded** — you create it live in the demo. `npm run seed` re-runs the (idempotent) seeder.

Production style (one port, Express serves the built React app):
```bash
npm run build && npm start          # http://localhost:5000
```

### `server/.env`
| Variable | Meaning |
|---|---|
| `MONGODB_URI` | e.g. `mongodb://127.0.0.1:27017/greenpulse` or your Atlas URI |
| `JWT_SECRET` | long random string that signs the login cookie (**never commit a real one**) |
| `PUBLIC_APP_URL` | optional fixed base URL inside QR codes (otherwise taken from the browser address) |
| `COOKIE_SECURE` | `true` only if the API itself is served over https |

## 3. Live demo: laptop (Admin) + phone (Inspector)

Phones only allow camera access on **HTTPS** (or localhost), so use the HTTPS demo server:

1. Put laptop and phone on the same Wi-Fi. Find the laptop's IP (e.g. `192.168.1.20`).
2. `npm run demo` → open **`https://192.168.1.20:5173`** on the laptop (accept the self-signed certificate warning).
3. **Laptop:** sign in as `admin@gmail.com` → **Locations & QR** → create **Main Canteen** (dept: Facilities).
   The QR appears. (Because you opened the LAN address, the QR already encodes it. Otherwise fill the
   *QR base URL* box with `https://192.168.1.20:5173`.) Use **Print / Download PNG** if you like.
4. **Phone:** open `https://192.168.1.20:5173`, accept the certificate warning, sign in as `inspector@gmail.com`
   → **Scan QR** → **Start camera** → allow camera → point it at the QR on the laptop screen.
   The app reads the token, the **backend** looks it up in MongoDB, and the *Main Canteen* inspection opens.
   (Scanning the QR with the phone's normal camera app also works: it opens the link → login → inspection.)
5. Answer the 5 checklist items (Waste Segregation → **Non-Compliant**, remarks, **Upload BEFORE photo**) → **Submit**.
   Score = 4 / 5 = **80 %**, and a *Waste Segregation* issue (severity HIGH) is created.
6. **Laptop (admin):** **Issue desk** → open the issue → assign to **Ravi Kumar (staff@gmail.com)**.
7. **Staff** (another browser/incognito): sign in as `staff@gmail.com` → Assigned issues → open →
   *Start work* → upload **AFTER photo** → resolution remarks → *Submit for verification*.
8. **Inspector:** **Verification queue** → *Review before / after* → **Approve** (or **Reject** with a reason – the issue returns to IN PROGRESS and staff must upload a new photo).
9. **Admin dashboard:** open issues / resolved issues / inspections / compliance / environmental impact have moved.

If the camera cannot be used, the scanner page also offers **Scan from a photo** and **Paste link** — both still
go through the backend token check.

## 4. How the QR works
* Creating a location generates a **192-bit random token** (`crypto.randomBytes(24)`), stored in the
  `Location` document with a **unique index**. It contains no name/ID — nothing sensitive.
* QR content = `<base-url>/inspect/<token>`, drawn with the **`qrcode`** library.
* Scanning uses **`html5-qrcode`** (camera). The token is sent to `GET /api/locations/qr/:token`; the backend
  finds the location in MongoDB (`404` unknown, `409` inactive). The frontend never decides which location it is.
* The QR **identifies, it does not authorise**: only an authenticated **INSPECTOR** may use it
  (STAFF/ADMIN → `403` page, anonymous → login first, then continue to the inspection).
* **Regenerate QR** overwrites the token: the old printed QR immediately returns 404.
* Inspection submission is also keyed by the token, so an old token cannot submit.

## 5. Roles & security
* Login: `POST /api/auth/login` → JWT in an **httpOnly** cookie (contains only the user id). Passwords are bcrypt-hashed.
* Every API call: `auth("ROLE")` middleware loads the user **from MongoDB** and checks the role →
  **401** not signed in, **403** wrong role. A role sent by the browser is ignored. Deactivated users are locked out at once.
* Staff can only read/act on issues **assigned to them**; evidence files are served only to authorised users.
* Uploads: type + magic-byte check, random file names, 6 MB limit.

| | ADMIN | INSPECTOR | STAFF |
|---|:-:|:-:|:-:|
| Dashboard / analytics / reports / environmental impact | ✔ | own dashboard | own dashboard |
| Locations, QR (view / print / regenerate), standards, team | ✔ | | |
| Assign issues | ✔ | | |
| Scan QR, inspect, before-evidence | | ✔ | |
| Verification queue, approve / reject | | ✔ | |
| Assigned issues, after-evidence, submit for verification | | | ✔ |

## 6. Scoring, risk, recommendations (all rule-based, computed from MongoDB)
* **Score** = Compliant ÷ (Compliant + Non-Compliant) × 100 — *Not Applicable is excluded*. 80–100 GOOD · 60–79 NEEDS IMPROVEMENT · <60 CRITICAL.
* **Severity** = the standard's severity, raised one level for a **repeated violation** (same standard, same location, last 60 days).
* **Risk**: score < 60 → high risk; repeated violation; overdue issue → escalated (+ notification); score falling ≥ 10 points or 3 inspections in a row → risk alert.
* **Recommendations** by failed category: waste / water / energy / cleanliness / green.
* **Issue lifecycle**: `REPORTED → ASSIGNED → IN_PROGRESS → RESOLVED → VERIFICATION_PENDING → VERIFIED → CLOSED`;
  rejection: `VERIFICATION_PENDING → IN_PROGRESS` (reason stored). RESOLVED/VERIFIED are recorded in the issue history.

## 7. Project layout
```
greenpulse/
├─ server/ (Express + Mongoose)
│  ├─ src/models/        User, Location, Standard, Inspection, ChecklistResponse, Issue, Evidence, Notification, EnvironmentalImpact
│  ├─ src/middleware/    auth (401/403), upload (multer), errors
│  ├─ src/services/      rules (score/severity/recs), inspections (submit), issues, dashboard, notify, seed
│  ├─ src/routes/        auth, users, locations(+QR), standards, inspections, evidence, issues, dashboard/reports/impact, notifications
│  └─ tests/e2e.test.ts  40 API/DB integration tests
├─ client/ (React + Vite + Tailwind + React Query + React Router)
│  └─ src/pages/{admin,inspector,staff,shared}, components/, lib/
└─ e2e/browser_demo_test.py   real-browser test incl. fake-camera QR scan
```

## 8. Main API
`POST /api/auth/login|logout` · `GET /api/auth/me` ·
`GET|POST /api/locations`, `PATCH /api/locations/:id`, `POST /api/locations/:id/regenerate-qr`, `GET /api/locations/:id/qr.png` (ADMIN) ·
`GET /api/locations/qr/:token`, `GET /api/locations/qr/:token/checklist` (INSPECTOR) ·
`GET|POST /api/inspections`, `GET /api/inspections/:id` ·
`GET /api/issues`, `GET /api/issues/:id`, `POST /api/issues/:id/assign` (ADMIN), `…/start`, `…/note`, `…/submit` (STAFF), `GET /api/issues/queue/verification`, `POST …/verify` (INSPECTOR) ·
`POST /api/evidence`, `GET /api/evidence/:id/file`, `DELETE /api/evidence/:id` ·
`GET /api/dashboard/admin|inspector|staff`, `GET /api/impact`, `GET /api/reports/summary`, `GET /api/reports/issues.csv` ·
`GET /api/notifications`, `POST /api/notifications/read-all` · `GET|POST|PATCH /api/users`, `/api/standards`

## 9. Tests
```bash
npm test            # server/tests/e2e.test.ts (needs MongoDB; uses database "greenpulse_test", dropped afterwards)
npm run build && (cd server && npm start) &   # then:
npm run test:e2e    # Playwright browser test (pip install playwright pillow numpy; ffmpeg needed for the fake camera)
```

## 10. Troubleshooting
* **Camera does not start on the phone** → you are on `http://`. Use `npm run demo` and `https://<laptop-ip>:5173`.
* **Phone says the QR link cannot be opened** → the QR contains `localhost`. Fill *QR base URL* on the Locations page with the laptop address.
* **`ECONNREFUSED` on start** → MongoDB is not running / wrong `MONGODB_URI`.
* **Reset the demo data** → drop the database (or point `MONGODB_URI` at a new name) and restart; it re-seeds.
