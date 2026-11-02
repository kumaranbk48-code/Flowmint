# FlowMint — Contractor Cashbook & Financial Assistant

<p align="center">
  <img src="public/logo.png" alt="FlowMint Logo" width="96" height="96" />
</p>

<p align="center">
  <strong>Fast, voice-enabled project finance and daily cashbook designed specifically for building contractors and site managers.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.4-black?logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/TailwindCSS-v4-38bdf8?logo=tailwindcss" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e?logo=supabase" alt="Supabase" />
  <img src="https://img.shields.io/badge/Google%20Gemini-Multimodal%20AI-4285f4?logo=google" alt="Google Gemini" />
  <img src="https://img.shields.io/badge/PWA-Offline%20Ready-c45a2c" alt="PWA" />
</p>

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture & Tech Stack](#architecture--tech-stack)
- [PWA & Offline Support](#pwa--offline-support)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Configuration](#environment-configuration)
  - [Database Schema (Supabase)](#database-schema-supabase)
- [Available Scripts](#available-scripts)
- [Directory Structure](#directory-structure)
- [Security & Production Hardening](#security--production-hardening)
- [License](#license)

---

## Overview

Managing cash flow across multiple active construction sites, daily material purchases, worker wages, and client payments can be messy. **FlowMint** replaces manual pocket diaries with a streamlined digital cashbook. 

Contractors can speak naturally in English, Tamil, or Hindi to record site expenses, or manage transactions offline via manual entry with instant local device storage and automatic cloud synchronization.

---

## Key Features

* **Voice Ledger Entry (Multimodal Gemini AI)**: Speak naturally (e.g. *"Received 10,000 from Sharma Residence"* or *"Paid 4,500 for cement"*). Audio is processed through Google Gemini AI to extract transaction types, amounts, categories, and project mappings.
* **Offline-First PWA**: Install FlowMint directly to your Android, iOS, or desktop home screen. Launch and use the app with 0ms delay even without internet; manual entries save locally and sync to the cloud automatically upon reconnection.
* **Multi-Project Management**: Track contract values, client advance payments, material expenses, and pending balances independently across all active projects.
* **Live Cash-in-Hand Counter**: Distinguish between bank/UPI transfers and physical cash in hand on site with a once-set opening balance and opening cash; every day opens with the previous day's closing balance.
* **Reports & One-Click CSV Export**: Filter finances by date range (Today, 7 Days, 30 Days, Custom) or by project, and download professional CSV cashbook spreadsheets.
* **Secure Authentication & Tenant Isolation**: Server-side HMAC-SHA256 session cookies, user enumeration protection, strict project ownership verification, and rate limiting.

---

## Architecture & Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router, Turbopack) |
| **Language** | [TypeScript 5](https://www.typescriptlang.org/) |
| **Styling & UI** | [Tailwind CSS v4](https://tailwindcss.com/) with Lucide React Icons |
| **Database & Auth** | [Supabase](https://supabase.com/) (PostgreSQL with RLS) + Google Identity Services |
| **AI Voice Pipeline** | [Google Gemini 2.5 Flash](https://aistudio.google.com/) via `@google/genai` |
| **Offline & PWA** | Web App Manifest + Service Worker Cache-First Shell + Sync Queue |
| **Session Security** | Node.js `crypto` HMAC-SHA256 signed `httpOnly` cookies |

---

## PWA & Offline Support

FlowMint is engineered with a **local-first** approach:

1. **Service Worker (`public/sw.js`)**: Pre-caches the app shell, stylesheets, fonts, and brand assets.
2. **Instant Local Hydration**: Transactions and projects are mirrored to `localStorage`, rendering the full dashboard in 0ms on startup without waiting for network responses.
3. **Offline Manual Entry**: If internet connectivity drops on a construction site, contractors can add payments or projects manually. Entries are stored locally and appended to a persistent sync queue.
4. **Automatic Cloud Sync**: As soon as the device reconnects to Wi-Fi or cellular, FlowMint flushes the queue and securely syncs pending entries to Supabase.
5. **Installable App**: Tapping **"Add to Home Screen"** on mobile creates a standalone native-app experience without browser address bars.

---

## Getting Started

### Prerequisites

* **Node.js** v20.x or higher
* **npm**, **pnpm**, or **yarn**
* A [Supabase](https://supabase.com/) project
* A [Google AI Studio](https://aistudio.google.com/) API Key (for Gemini Voice features)
* A [Google Cloud Console](https://console.cloud.google.com/) OAuth 2.0 Client ID (for Google Sign-In)

### Installation

1. Clone or download the repository:
   ```bash
   git clone https://github.com/your-username/flowmint.git
   cd flowmint
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Environment Configuration

Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Populate the configuration values in `.env.local`:

```env
# Application Base URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Google OAuth (Public Client ID)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Supabase PostgreSQL & Auth
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-secret-key

# Google Gemini AI Studio (Server-Side Only)
GEMINI_API_KEY=your-gemini-api-key

# Session Signing Secret (REQUIRED in production, at least 32 characters; there is no fallback)
SESSION_SECRET=your-custom-random-32-char-secret-salt
```

> **Security Note:** Never commit `.env.local` to Git. The `.gitignore` file is pre-configured to exclude environment files and build outputs.

---

### Database Schema (Supabase)

Ensure the following tables exist in your Supabase database:

```sql
-- 1. Profiles Table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name TEXT,
  owner_name TEXT,
  business_type TEXT,
  location TEXT,
  opening_balance NUMERIC DEFAULT 0,
  language TEXT DEFAULT 'en-IN',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Projects Table
CREATE TABLE public.projects (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  client TEXT NOT NULL,
  contract_value NUMERIC NOT NULL DEFAULT 0,
  start_date DATE NOT NULL,
  expected_completion_date DATE,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Transactions Table
CREATE TABLE public.transactions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES public.projects(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'wage')),
  amount NUMERIC NOT NULL CHECK (amount > 0 AND amount <= 1000000000),
  date DATE NOT NULL,
  time TEXT,
  category TEXT NOT NULL,
  party TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash', 'online', 'cheque', 'upi', 'bank')),
  source TEXT DEFAULT 'manual' CHECK (source IN ('voice', 'manual')),
  description TEXT,
  note TEXT,
  transcript TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the Next.js development server with Turbopack (`http://localhost:3000`) |
| `npm run build` | Compiles optimized production bundle across all static and dynamic routes |
| `npm start` | Launches the compiled production application server |
| `npx tsc --noEmit` | Runs TypeScript type-checking without emitting files |

---

## Directory Structure

```text
flowmint/
├── app/
│   ├── api/
│   │   ├── auth/              # Login, Signup, Forgot Password, Reset Password, Logout, OAuth
│   │   ├── projects/          # User-scoped Project CRUD
│   │   ├── settings/          # User opening balance preferences
│   │   ├── transactions/      # User-scoped Transaction CRUD
│   │   └── voice/             # Gemini AI Audio Transcription & Parsing
│   ├── forgot-password/       # Password recovery request page
│   ├── reset-password/        # Secure new password entry page
│   ├── login/                 # Contractor email & Google login
│   ├── signup/                # Contractor registration
│   ├── onboarding/            # Business & owner profile setup
│   ├── privacy/               # Contractor data & AI audio privacy policy
│   ├── terms/                 # Terms of service
│   ├── manifest.ts            # Dynamic PWA web manifest
│   ├── robots.ts              # Search engine crawler policies
│   ├── sitemap.ts             # XML sitemap generator
│   ├── error.tsx              # Application error boundary with recovery action
│   ├── not-found.tsx          # Branded 404 handler
│   └── page.tsx               # Root Dashboard view
├── components/
│   ├── auth/                  # Auth loading transition & official Google button
│   ├── dashboard/             # Cashbook ledger, manual entry
│   ├── projects/              # Projects list, metrics, and creation modals
│   ├── pwa/                   # PWA service worker registration & offline status banner
│   ├── reports/               # Date-range summary and CSV export
│   ├── shell/                 # Responsive desktop sidebar and mobile navigation
│   └── voice/                 # Audio waveform visualizer, review form, missing info prompts
├── hooks/
│   ├── use-media-recorder-voice.ts # Web Audio MediaRecorder hook
│   └── use-speech-recognition.ts  # Fallback speech API
├── lib/
│   ├── security/              # Session signing, rate limiters, input sanitization
│   ├── supabase/              # Server-side Supabase admin & ledger database helpers
│   ├── data.ts                # TypeScript types & default ledger constants
│   ├── format.ts              # Indian currency (₹) & date formatting helpers
│   └── ledger.ts              # Cashbook summary & running balance calculations
└── public/
    ├── sw.js                  # PWA Service Worker (Cache-first offline support)
    ├── manifest.json          # Standalone PWA manifest fallback
    ├── icon-192.png           # PWA 192x192 app icon
    └── icon-512.png           # PWA 512x512 app icon
```

---

## Security & Production Hardening

FlowMint enforces a zero-trust server architecture:

* **Session Token Verification**: Cryptographic HMAC-SHA256 token verification on every request. Requests cannot forge `userId` parameters to access other contractors' data.
* **Server-Side Project Ownership**: Transactions referencing a project ID are validated server-side to confirm the project belongs to the authenticated user before insertion.
* **Gemini Key Protection**: The Gemini API key is accessed exclusively server-side via `x-goog-api-key` headers; it is never exposed to the client or browser network logs.
* **Rate Limiting**: Sliding-window rate limiters defend AI voice endpoints (15–20 req/min/IP) and authentication routes (10 req/min/IP). They are in-memory (per server instance); use a shared store such as Upstash/Redis for a multi-instance production deployment.
* **Database migrations**: apply `supabase/migrations/20261028_siteflow_ledger.sql`, then `20261101_flowmint_hardening.sql` (soft delete, audit trail, wage type, project-ownership foreign key, exact decimals, opening cash).
* **Tests**: `npm test` runs the financial-logic, API, sync-queue and security tests.
* **Financial Constraints**: Transaction amounts are validated server-side (`amount > 0 AND amount <= 1,000,000,000`) with strict uppercase/HTML sanitization.
* **HTTP Security Headers**: Configured in `next.config.mjs` (`X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(self)`).

---

## License

This project is licensed under the [MIT License](LICENSE).

