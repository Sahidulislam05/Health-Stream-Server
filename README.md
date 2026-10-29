# HealthStream — Backend API

REST API for an online doctor-consultation platform. Patients find a doctor, book a slot on a published schedule, pay with bKash, and join a video call. Afterward the doctor sends back a digital prescription. Admins approve doctors and manage accounts.

The full product spec is in [Project Requirements.md](./Project%20Requirements.md).

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Scripts](#scripts)
- [Project Structure](#project-structure)
- [API Overview](#api-overview)
- [Business Rules](#business-rules)
- [Security](#security)
- [Demo Mode](#demo-mode)
- [Deployment](#deployment)

## Features

- **Four roles:** Super Admin, Admin, Doctor, Patient, enforced server-side on every route.
- **Auth:** email/password and Google login (patients only), email OTP verification, forgot/reset/change/set password, access and refresh tokens in httpOnly cookies.
- **Doctor onboarding:** public application, OTP email check, then admin approval or rejection.
- **Schedules:** doctors publish one schedule per day, split automatically into 20-minute slots.
- **Booking and payment:** pay upfront with bKash, serial numbers per schedule, invoice PDF emailed to the patient.
- **Appointment lifecycle:** `booked → ongoing → completed`, with cancellation and time-based refunds.
- **Prescriptions:** PDF generated and emailed once an appointment is completed.
- **Analytics** dashboards for patients, doctors and admins.
- **Uploads:** signed Cloudinary uploads for profile images and doctor documents.
- **Demo mode** with shared demo accounts that reset nightly.

## Tech Stack

| Area               | Technology                                      |
| ------------------ | ----------------------------------------------- |
| Runtime / language | Node.js, TypeScript (ESM)                       |
| Framework          | Express 5                                       |
| Database           | PostgreSQL with Prisma 7 (`@prisma/adapter-pg`) |
| Cache              | Redis                                           |
| Validation         | Zod                                             |
| Auth               | JWT, bcryptjs, Google Auth Library              |
| Payments           | bKash                                           |
| Files              | Cloudinary                                      |
| Email / PDF        | Nodemailer + EJS templates, PDFKit              |
| Scheduling         | node-cron (local), Vercel Cron (production)     |
| Tooling            | tsx, Biome, Bun or npm                          |

## Getting Started

### Prerequisites

- Node.js 20 or newer (Bun is optional)
- PostgreSQL database
- Redis instance
- SMTP account (for OTP and invoice emails)
- Cloudinary and bKash sandbox credentials
- A Google OAuth client ID (for Google login)

### Installation

```bash
# 1. Install dependencies
bun install            # or: npm install

# 2. Create your env file, then fill in real values
cp .env.example .env

# 3. Generate the Prisma client and apply migrations
npx prisma generate
npx prisma migrate deploy

# 4. Start the dev server (watch mode)
bun run dev            # or: npm run dev
```

The API is now at `http://localhost:5000`. On boot the server connects to Postgres, Redis and SMTP, seeds the first Super Admin (plus tester accounts outside production), then starts listening.

Check it works:

```bash
curl http://localhost:5000/
# {"success":true,"message":"Welcome to HealthStream System Backend"}
```

## Environment Variables

Copy [.env.example](./.env.example) and fill in each group. The app reads `process.env` only in `src/app/config` and fails fast if a required variable is missing.

| Group           | Variables                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| Server          | `NODE_ENV`, `PORT`, `TZ`, `TRUST_PROXY`, `BACKEND_URL`, `FRONTEND_URL`                                          |
| Database        | `DATABASE_URL`                                                                                                  |
| JWT             | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`                    |
| Passwords       | `BCRYPT_SALT_ROUNDS`                                                                                            |
| Google login    | `GOOGLE_CLIENT_ID`                                                                                              |
| Seeded accounts | `SUPER_ADMIN_*`, `TESTER_ADMIN_*`, `TESTER_DOCTOR_*` (`NAME`, `EMAIL`, `PASSWORD`)                              |
| Redis           | `REDIS_USER`, `REDIS_PASSWORD`, `REDIS_HOST`, `REDIS_PORT`                                                      |
| Email           | `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_SENDER`                                                                    |
| Cloudinary      | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`                                          |
| bKash           | `BKASH_BASE_URL`, `BKASH_USERNAME`, `BKASH_PASSWORD`, `BKASH_APP_KEY`, `BKASH_APP_SECRET`, `BKASH_CALLBACK_URL` |
| Cron / cache    | `CRON_SECRET`, `REVALIDATE_SECRET` (same value as the frontend's)                                               |
| Demo mode       | `DEMO_MODE`, `DEMO_PATIENT_EMAIL`, `DEMO_DOCTOR_EMAIL`, `DEMO_ADMIN_EMAIL`, `DEMO_APPLICANT_EMAIL`              |

Generate strong JWT secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> Never commit `.env`. It is already in `.gitignore`.

## Scripts

| Script                        | Description                                                |
| ----------------------------- | ---------------------------------------------------------- |
| `dev`                         | Run `src/server.ts` in watch mode with tsx                 |
| `build`                       | Compile TypeScript to `dist/` with `tsc`                   |
| `start`                       | Run the compiled server with Node (see the note below)     |
| `test`                        | Run tests with the Node test runner (`src/**/*.test.ts`)   |
| `seed`                        | Seed the super admin and demo data (`src/scripts/seed.ts`) |
| `lint:check` / `lint:fix`     | Lint `src` with Biome                                      |
| `format:check` / `format:fix` | Check or fix formatting with Biome                         |

> **Known issue:** `tsconfig.json` uses `rootDir: "./"`, so `build` outputs `dist/src/server.js`, but `start` runs `dist/server.js`. Until the script is fixed, run `node dist/src/server.js`.

## Project Structure

```
.
├── prisma/
│   ├── schema/              # Split Prisma schema (user, doctor, schedule, ...)
│   └── migrations/
├── src/
│   ├── server.ts            # boot, seeding, graceful shutdown
│   ├── app.ts               # helmet, cors, rate limits, routes, error handlers
│   ├── scripts/seed.ts
│   └── app/
│       ├── config/          # the only place that reads process.env
│       ├── lib/             # prisma, redis, bkash, cloudinary, mailer, cron
│       ├── middleware/      # auth(...roles), validateRequest(zod), error handlers
│       ├── utils/           # AppError, catchAsync, sendResponse, pagination, pdf, jwt
│       ├── templates/       # EJS email templates
│       └── module/<name>/   # route → controller → service (+ validation, interface)
├── vercel.json              # daily cron
└── Project Requirements.md
```

Modules: `auth`, `user`, `admin`, `doctor`, `schedule`, `appointment`, `payment`, `prescription`, `analytics`, `contact`, `upload`, `cron`.

Layering rules: controllers never call Prisma, services never touch `req`/`res`, and every request body goes through a Zod schema.

## API Overview

Base URL: `/api/v1`

Responses use one shape: `{ success, statusCode, message, data, meta? }`.
List endpoints accept `page`, `limit` (max 100), `sortBy`, `sortOrder` and `searchTerm`.

| Module                           | Endpoints                                                                                                                  | Access                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| **Auth** `/auth`                 | `POST /register`, `/verify-email`, `/login`, `/google`, `/refresh-token`, `/forgot-password`, `/reset-password`, `/logout` | Public                     |
|                                  | `GET /me`, `POST /change-password`, `/set-password`                                                                        | Logged in                  |
|                                  | `POST /demo-login`, `GET /demo`                                                                                            | Public (demo mode)         |
| **Doctor** `/doctor`             | `POST /apply-as-doctor`, `/apply-as-doctor/verify-email`                                                                   | Public                     |
|                                  | `GET /public/all-doctors`, `/public/available-today`, `/public/:doctorId`                                                  | Public                     |
|                                  | `PATCH /update-my-profile`                                                                                                 | Doctor                     |
|                                  | `GET /all-doctors`, `POST /approve-doctor`                                                                                 | Admin, Super Admin         |
| **Schedule** `/schedule`         | `POST /create-schedule`, `GET /my-schedules`, `PATCH /update-schedule/:id`, `/publish-schedule/:id`, `DELETE /:id`         | Doctor                     |
|                                  | `GET /all-schedules`                                                                                                       | Admin, Super Admin         |
|                                  | `GET /todays-schedule`, `GET /:id`                                                                                         | See route file             |
| **Appointment** `/appointment`   | `POST /book-appointment`, `/pay-appointment`, `/cancel-appointment`, `GET /my-appointments`                                | Patient                    |
|                                  | `PATCH /update-status/:id`, `GET /doctor-appointments`                                                                     | Doctor                     |
|                                  | `GET /all-appointments`                                                                                                    | Admin, Super Admin         |
|                                  | `GET /:id`                                                                                                                 | Any logged-in role         |
|                                  | `GET /book-appointment/payment/callback`                                                                                   | bKash callback             |
| **Payment** `/payment`           | `GET /my-payments`, `/all-payments`, `/:id`                                                                                | Patient / Admin            |
| **Prescription** `/prescription` | `POST /create-prescription`, `GET /:appointmentId`                                                                         | Doctor / participants      |
| **User** `/user`                 | `PATCH /profile-image`, `GET /patients`, `PATCH /:userId/status`                                                           | Logged in / Admin          |
| **Admin** `/admin`               | `POST /create-admin`, `GET /all-admins`                                                                                    | Admin, Super Admin         |
| **Analytics** `/analytics`       | `GET /patient-analytics`, `/doctor-analytics`, `/admin-analytics`                                                          | Per role                   |
| **Contact** `/contact`           | `POST /`                                                                                                                   | Public                     |
| **Upload** `/upload`             | `GET /doctor-document-signature`, `/profile-image-signature`                                                               | See route file             |
| **Cron** `/cron`                 | `GET /daily`                                                                                                               | `CRON_SECRET` bearer token |

The route files in `src/app/module/*/` are the source of truth for exact middleware and permissions.

## Business Rules

**Schedules**

- One schedule per doctor per date, 3 to 8 hours long, within a single day.
- Divided into 20-minute slots. A 3 PM to 9 PM schedule gives 18 slots.
- Starts as draft and is invisible to patients until published.
- After publishing, the date is locked. The time range is locked once the first slot is booked.

**Booking**

- Patients see only today's schedules, and only until each schedule's start time. Fully booked schedules are hidden.
- Payment is upfront. After it succeeds, the appointment becomes `booked`, gets a serial number, and an invoice PDF is emailed.

**Appointments**

- `booked → ongoing → completed`. The doctor moves it forward manually.
- A prescription can only be written once the appointment is `completed`.

**Cancellation**

- More than 1 hour before the schedule starts: cancelled and refunded.
- Later than that: still cancelled, no refund.

**Admin permissions**

- Admins and Super Admins can approve doctors, block patients and doctors, and create admins.
- Only a Super Admin can create Super Admins or block Admins and Super Admins.

## Security

- Helmet headers, CORS limited to `FRONTEND_URL`, 1 MB body limit.
- Rate limits: 500 requests per 15 minutes per IP on `/api`, with stricter limits on login, register, OTP, password and doctor-apply routes.
- httpOnly cookies (`SameSite=None; Secure` in production). A Bearer header is also accepted.
- `auth()` reloads the user on every request, so blocking, deletion and role changes apply immediately. Users with a generated password can only call `me`, `change-password` and `logout` until they change it.
- Login and forgot-password return the same response for unknown emails.
- Uploads: JPG, PNG, WEBP or PDF, up to 5 MB.
- In production, errors never include stack traces or internal messages.

## Demo Mode

Shared demo accounts (patient, doctor, admin) live in the same database, marked `isDemo`. Enable them with `DEMO_MODE=true` plus the four `DEMO_*_EMAIL` variables. Use inboxes you control, because bookings send real email.

- `POST /api/v1/auth/demo-login { role }` signs in without a password. `GET /api/v1/auth/demo` tells the frontend whether to show the demo panel.
- Demo users see only demo rows. Real users never see demo rows.
- Demo users get a 403 on password changes, profile and photo edits, schedule delete, approve/reject, block/unblock, and create admin.
- Demo data is recreated nightly by the cron route, and on first local boot.

## Deployment

The project is set up for Vercel, with `src/app.ts` as the function entry.

1. Set `NODE_ENV=production` and strong JWT secrets.
2. Run `npx prisma migrate deploy`, then `bun run seed` once. Vercel has no boot step.
3. `vercel.json` schedules `GET /api/v1/cron/daily` at `0 18 * * *` UTC. Set `CRON_SECRET`.
4. Set `REVALIDATE_SECRET` to the same value as the frontend, so doctor changes refresh cached pages.
5. `TZ` is reserved on Vercel. Day rules use Dhaka time in code (`utils/dhakaTime.ts`).
6. Behind a frontend rewrite, check `req.ip` on a preview deploy and set `TRUST_PROXY` to the right hop count.

The API is stateless and scales horizontally. Rate limiting is in-memory per instance, so move it to Redis if you run more than one instance.

## License

ISC
