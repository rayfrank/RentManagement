# RentFlow

RentFlow is a universal rent-collection and property-management application built
with Expo and React Native. The same TypeScript codebase runs on the web, Android,
and iOS.

## Current MVP

- Collection dashboard with expected, collected, outstanding, and occupancy totals
- Property and tenant directory with payment status and search
- Rent collection form based on the supplied handwritten requirements
- Water and garbage charges, deposits, payment dates, and M-Pesa references
- Live invoice preview with a sample invoice for House 274
- Responsive desktop sidebar and mobile bottom navigation
- Form validation and in-session payment updates
- Email/password account creation and sign-in
- Owner, manager, collector, and viewer roles
- Team-account assignment by email
- Database-triggered audit history showing who changed each record and when

Without database environment keys the app opens in a clearly labelled demonstration
mode. With Supabase connected, accounts, properties, payments, roles, and audit
history are persisted in the shared database.

## Connect accounts and persistent records

1. Create a Supabase project.
2. Run [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql)
   in the project's SQL editor.
3. Copy `.env.example` to `.env.local` and add the project's URL and anonymous key.
4. Restart Expo.

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
EXPO_PUBLIC_AUTH_REDIRECT_URL=https://rayfrank.github.io/RentManagement/
```

In Supabase, open **Authentication → URL Configuration** and set:

- Site URL: `https://rayfrank.github.io/RentManagement/`
- Redirect URL: `https://rayfrank.github.io/RentManagement/**`

These URLs let verification and password-recovery emails return to the deployed
RentFlow authentication screen instead of a local development address.

The first account automatically receives an Owner workspace. Additional staff first
create their own RentFlow account, after which the owner adds their email under
**Activity → Add a team account**. The newest workspace membership opens by default.

Audit entries are created by PostgreSQL triggers after property, payment, or team-role
changes. Authenticated clients may read them but cannot insert, update, or delete them.

## Activate RentFlow AI

RentFlow includes four secured AI features:

- M-Pesa message and screenshot extraction with automatic property matching
- English and Swahili payment-reminder drafts
- Read-only natural-language reporting across workspace records
- Deterministic fraud alerts for amount/tenant mismatches and suspicious edits

The OpenAI key belongs only in Supabase Edge Function secrets. Never add it to an
`EXPO_PUBLIC_` variable, `.env.local`, the mobile app, or the web bundle.

1. Run [`supabase/migrations/002_ai_features.sql`](supabase/migrations/002_ai_features.sql)
   in the Supabase SQL Editor.
2. Install or invoke the Supabase CLI, authenticate, and deploy the function:

```bash
npx supabase login
npx supabase functions deploy rentflow-ai --project-ref adnbqmsgjrteqzkegpfy
```

3. Add the OpenAI API key directly to Supabase secrets. The model is optional and
   defaults to `gpt-5-mini` in the function.

```bash
npx supabase secrets set OPENAI_API_KEY=your-key --project-ref adnbqmsgjrteqzkegpfy
npx supabase secrets set OPENAI_MODEL=gpt-5-mini --project-ref adnbqmsgjrteqzkegpfy
```

4. Restart Expo and open **AI tools** in the navigation.

Every AI call is authenticated with the signed-in Supabase user, rate-limited,
logged in `ai_request_logs`, and restricted by the existing organization RLS rules.

## Run locally

```bash
npm install
npm run web
```

For a phone, install Expo Go and scan the QR code shown by `npm start`.

```bash
npm start
```

Platform-specific development commands:

```bash
npm run android
npm run ios
```

The iOS simulator command requires macOS. A physical iPhone can use Expo Go from
the development server on Windows.

## Verification

```bash
npm run typecheck
npm run build:web
```
