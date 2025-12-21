# Authentication Implementation Guide

A step-by-step tutorial for implementing GitHub OAuth authentication in the Dead Links web application using Auth.js v5 with database sessions.

## Background

We're adding authentication to our Next.js 15 web application. Users will sign in with their GitHub account, and their session will be stored in PostgreSQL. All routes under `/app/*` will require authentication, while the landing page (`/`) and login page (`/login`) remain public.

**Tech Stack:**
- Next.js 15 (App Router)
- Auth.js v5 (next-auth@beta)
- PostgreSQL with Drizzle ORM
- GitHub OAuth

**What you'll build:**
- Database schema for users, accounts, and sessions
- GitHub OAuth integration
- Protected routes with middleware
- Sign in/out functionality

---

## Prerequisites

Before starting, ensure you have:
- The project running locally (`pnpm dev` in the web folder)
- PostgreSQL running (via `docker-compose up postgres`)
- Access to create a GitHub OAuth App

---

## Milestone 1: Install Dependencies

### Goal
Add the required npm packages for authentication and database access.

### Steps

1. Navigate to the web package directory:
   ```bash
   cd web
   ```

2. Install the authentication and database packages:
   ```bash
   pnpm --filter web add next-auth@beta @auth/drizzle-adapter drizzle-orm postgres
   pnpm --filter web add -D drizzle-kit
   ```

### Verification

Run the following command to confirm the packages are installed:
```bash
pnpm list next-auth @auth/drizzle-adapter drizzle-orm postgres drizzle-kit
```

You should see output showing all five packages with their versions. `next-auth` should show a beta version (e.g., `5.0.0-beta.25`).

### What you installed
- `next-auth@beta` - Auth.js v5 for Next.js, handles OAuth flows and session management
- `@auth/drizzle-adapter` - Connects Auth.js to your database via Drizzle ORM
- `drizzle-orm` - TypeScript ORM for database queries
- `postgres` - PostgreSQL client driver
- `drizzle-kit` - CLI tool for database migrations

---

## Milestone 2: Database Connection

### Goal
Set up a database connection from the web application to PostgreSQL.

### Steps

1. Create the database directory structure:
   ```bash
   mkdir -p src/db
   ```

2. Create `src/db/index.ts` - the database connection:
   ```typescript
   import { drizzle } from "drizzle-orm/postgres-js"
   import postgres from "postgres"
   import * as schema from "./schema"

   const connectionString = process.env.DATABASE_URL!

   // Create postgres client - use max 1 connection for serverless compatibility
   const client = postgres(connectionString, { max: 1 })

   // Export the drizzle database instance
   export const db = drizzle(client, { schema })
   ```

3. Create `src/db/schema.ts` - an empty schema file for now:
   ```typescript
   // Auth schema will be added in the next milestone
   ```

4. Create `drizzle.config.ts` in the web root directory:
   ```typescript
   import { defineConfig } from "drizzle-kit"

   export default defineConfig({
     schema: "./src/db/schema.ts",
     out: "./drizzle",
     dialect: "postgresql",
     dbCredentials: {
       url: process.env.DATABASE_URL!,
     },
   })
   ```

5. Create `.env.local` in the web root directory:
   ```env
   DATABASE_URL=postgresql://deadlinks:deadlinks@localhost:5432/deadlinks
   ```

6. Add a script to `package.json` for running Drizzle commands:
   ```json
   {
     "scripts": {
       "db:generate": "drizzle-kit generate",
       "db:migrate": "drizzle-kit migrate",
       "db:studio": "drizzle-kit studio"
     }
   }
   ```

### Verification

1. Make sure PostgreSQL is running:
   ```bash
   docker-compose up -d postgres
   ```

2. Test the database connection by running Drizzle Studio:
   ```bash
   pnpm db:studio
   ```

3. Open the URL shown (usually https://local.drizzle.studio). You should see the Drizzle Studio interface connected to your database. You'll see the existing `worker` schema with its tables.

4. Press `Ctrl+C` to stop Drizzle Studio.

### Troubleshooting

- **Connection refused**: Ensure PostgreSQL is running with `docker-compose ps`
- **Authentication failed**: Check your DATABASE_URL matches docker-compose.yml credentials
- **ECONNREFUSED on port 5432**: The postgres container might not be ready yet, wait a few seconds

---

## Milestone 3: Auth Database Schema

### Goal
Create the database tables needed for authentication: users, accounts, and sessions.

### Steps

1. Update `src/db/schema.ts` with the auth tables:
   ```typescript
   import {
     pgSchema,
     text,
     timestamp,
     primaryKey,
     integer,
   } from "drizzle-orm/pg-core"
   import type { AdapterAccountType } from "next-auth/adapters"

   // Create a separate schema for auth tables (keeps them organized)
   export const authSchema = pgSchema("auth")

   // Users table - stores basic user info from OAuth provider
   export const users = authSchema.table("users", {
     id: text("id")
       .primaryKey()
       .$defaultFn(() => crypto.randomUUID()),
     name: text("name"),
     email: text("email").unique(),
     emailVerified: timestamp("email_verified", { mode: "date" }),
     image: text("image"),
     createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
   })

   // Accounts table - links OAuth providers to users
   // A user can have multiple accounts (GitHub, Google, etc.)
   export const accounts = authSchema.table(
     "accounts",
     {
       userId: text("user_id")
         .notNull()
         .references(() => users.id, { onDelete: "cascade" }),
       type: text("type").$type<AdapterAccountType>().notNull(),
       provider: text("provider").notNull(),
       providerAccountId: text("provider_account_id").notNull(),
       refresh_token: text("refresh_token"),
       access_token: text("access_token"),
       expires_at: integer("expires_at"),
       token_type: text("token_type"),
       scope: text("scope"),
       id_token: text("id_token"),
       session_state: text("session_state"),
     },
     (account) => ({
       compositePk: primaryKey({
         columns: [account.provider, account.providerAccountId],
       }),
     })
   )

   // Sessions table - stores active user sessions
   export const sessions = authSchema.table("sessions", {
     sessionToken: text("session_token").primaryKey(),
     userId: text("user_id")
       .notNull()
       .references(() => users.id, { onDelete: "cascade" }),
     expires: timestamp("expires", { mode: "date" }).notNull(),
   })
   ```

2. Generate the migration:
   ```bash
   pnpm db:generate
   ```

   You'll see output like:
   ```
   [✓] Your SQL migration file ➜ drizzle/0000_chunky_dormammu.sql
   ```

3. Review the generated migration in `drizzle/0000_*.sql`. It should contain:
   - `CREATE SCHEMA "auth"`
   - `CREATE TABLE "auth"."users"`
   - `CREATE TABLE "auth"."accounts"`
   - `CREATE TABLE "auth"."sessions"`

4. Run the migration:
   ```bash
   pnpm db:migrate
   ```

### Verification

1. Open Drizzle Studio:
   ```bash
   pnpm db:studio
   ```

2. In the left sidebar, you should now see an `auth` schema with three tables:
   - `users`
   - `accounts`
   - `sessions`

3. Click on each table to verify the columns match your schema.

4. Alternatively, connect to PostgreSQL directly:
   ```bash
   docker-compose exec postgres psql -U deadlinks -d deadlinks -c "\dt auth.*"
   ```

   Expected output:
   ```
            List of relations
    Schema |   Name   | Type  |   Owner
   --------+----------+-------+-----------
    auth   | accounts | table | deadlinks
    auth   | sessions | table | deadlinks
    auth   | users    | table | deadlinks
   ```

### Understanding the Schema

- **users**: Core user data. The `id` is auto-generated, other fields come from GitHub.
- **accounts**: Links OAuth accounts to users. The composite primary key (`provider` + `providerAccountId`) ensures one GitHub account links to one user.
- **sessions**: Active login sessions. Each row represents a logged-in browser. When deleted, the user is logged out.

---

## Milestone 4: GitHub OAuth App Setup

### Goal
Create a GitHub OAuth App to enable "Sign in with GitHub" functionality.

### Steps

1. Go to GitHub → Settings → Developer settings → OAuth Apps
   - Direct link: https://github.com/settings/developers

2. Click "New OAuth App"

3. Fill in the form:
   - **Application name**: `Dead Links (Development)` (or any name)
   - **Homepage URL**: `http://localhost:3000`
   - **Application description**: (optional)
   - **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`

   > **Important**: The callback URL must exactly match `/api/auth/callback/github`

4. Click "Register application"

5. On the next page:
   - Copy the **Client ID** (visible immediately)
   - Click "Generate a new client secret"
   - Copy the **Client Secret** (you won't see it again!)

6. Add the credentials to `.env.local`:
   ```env
   DATABASE_URL=postgresql://deadlinks:deadlinks@localhost:5432/deadlinks

   # GitHub OAuth
   GITHUB_CLIENT_ID=your_client_id_here
   GITHUB_CLIENT_SECRET=your_client_secret_here

   # Auth.js
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=your_random_secret_here
   ```

7. Generate a secure `NEXTAUTH_SECRET`:
   ```bash
   openssl rand -base64 32
   ```
   Copy the output and paste it as your `NEXTAUTH_SECRET`.

### Verification

Verify your `.env.local` has all required variables:
```bash
cat .env.local | grep -E "^(DATABASE_URL|GITHUB_CLIENT_ID|GITHUB_CLIENT_SECRET|NEXTAUTH_URL|NEXTAUTH_SECRET)="
```

You should see 5 lines (values may be partially hidden). Make sure none are empty.

### Security Notes

- **Never commit `.env.local`** - it's already in `.gitignore`
- **Client Secret is sensitive** - treat it like a password
- For production, create a separate OAuth App with your production URL

---

## Milestone 5: Basic Auth.js Configuration

### Goal
Set up Auth.js with GitHub provider. At the end of this milestone, you can visit an API endpoint that shows available providers.

### Steps

1. Create `src/auth.ts` - the main Auth.js configuration:
   ```typescript
   import NextAuth from "next-auth"
   import GitHub from "next-auth/providers/github"
   import { DrizzleAdapter } from "@auth/drizzle-adapter"
   import { db } from "./db"
   import { users, accounts, sessions } from "./db/schema"

   export const { handlers, auth, signIn, signOut } = NextAuth({
     // Connect Auth.js to our PostgreSQL database
     adapter: DrizzleAdapter(db, {
       usersTable: users,
       accountsTable: accounts,
       sessionsTable: sessions,
     }),

     // Configure GitHub as our OAuth provider
     providers: [
       GitHub({
         clientId: process.env.GITHUB_CLIENT_ID!,
         clientSecret: process.env.GITHUB_CLIENT_SECRET!,
       }),
     ],

     // Use database sessions instead of JWT
     session: {
       strategy: "database",
       maxAge: 30 * 24 * 60 * 60, // 30 days
       updateAge: 24 * 60 * 60, // Update session expiry every 24 hours
     },

     // Custom pages (we'll create the login page later)
     pages: {
       signIn: "/login",
     },

     // Callbacks let us customize behavior
     callbacks: {
       // Add user ID to the session object
       session({ session, user }) {
         session.user.id = user.id
         return session
       },
     },
   })
   ```

2. Create the API route at `src/app/api/auth/[...nextauth]/route.ts`:

   First, create the directory:
   ```bash
   mkdir -p src/app/api/auth/\[...nextauth\]
   ```

   Then create the file:
   ```typescript
   import { handlers } from "@/auth"

   export const { GET, POST } = handlers
   ```

   > **Note**: This single file handles ALL auth-related API routes:
   > - `GET /api/auth/providers` - List available providers
   > - `GET /api/auth/signin` - Default sign-in page
   > - `POST /api/auth/signin/github` - Initiate GitHub OAuth
   > - `GET /api/auth/callback/github` - Handle OAuth callback
   > - `POST /api/auth/signout` - Sign out
   > - `GET /api/auth/session` - Get current session

### Verification

1. Start the development server:
   ```bash
   pnpm dev
   ```

2. Open your browser to: http://localhost:3000/api/auth/providers

3. You should see a JSON response:
   ```json
   {
     "github": {
       "id": "github",
       "name": "GitHub",
       "type": "oauth",
       "signinUrl": "http://localhost:3000/api/auth/signin/github",
       "callbackUrl": "http://localhost:3000/api/auth/callback/github"
     }
   }
   ```

4. Visit http://localhost:3000/api/auth/session

   You should see:
   ```json
   null
   ```
   (This is correct - you're not logged in yet)

5. Visit http://localhost:3000/api/auth/signin

   You should see a default Auth.js sign-in page with a "Sign in with GitHub" button. **Don't click it yet** - we'll test the full flow in the next milestone.

### Troubleshooting

- **500 error on /api/auth/providers**: Check your DATABASE_URL is correct
- **"Invalid environment variables"**: Ensure GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are set
- **Module not found '@/auth'**: Check your tsconfig.json has `"@/*": ["./src/*"]` in paths

---

## Milestone 6: Test the OAuth Flow

### Goal
Complete a full sign-in flow with GitHub and verify the user is created in the database.

### Steps

1. Ensure your dev server is running:
   ```bash
   pnpm dev
   ```

2. Open http://localhost:3000/api/auth/signin

3. Click "Sign in with GitHub"

4. You'll be redirected to GitHub. Authorize the application.

5. GitHub redirects back to your app. You'll see either:
   - A redirect to `/login` (if that page doesn't exist, you'll get a 404 - that's okay!)
   - Or stay on the callback page

6. Check that you're logged in by visiting: http://localhost:3000/api/auth/session

   You should see your session data:
   ```json
   {
     "user": {
       "name": "Your Name",
       "email": "you@example.com",
       "image": "https://avatars.githubusercontent.com/u/12345"
     },
     "expires": "2025-01-20T..."
   }
   ```

### Verification

Verify the user was created in the database:

1. Open Drizzle Studio:
   ```bash
   pnpm db:studio
   ```

2. Navigate to the `auth.users` table. You should see your user with:
   - A UUID in the `id` column
   - Your GitHub name in `name`
   - Your email in `email`
   - Your GitHub avatar URL in `image`

3. Check `auth.accounts`. You should see a row linking your user to GitHub:
   - `provider` = "github"
   - `provider_account_id` = your GitHub user ID
   - `user_id` = matches your user's id

4. Check `auth.sessions`. You should see an active session:
   - `session_token` = a random string
   - `user_id` = your user's id
   - `expires` = a date ~30 days from now

### Sign Out Test

1. Visit http://localhost:3000/api/auth/signout

2. Click "Sign out"

3. Visit http://localhost:3000/api/auth/session - should return `null`

4. Check `auth.sessions` in Drizzle Studio - your session should be deleted

---

## Milestone 7: Create the Login Page

### Goal
Create a custom login page that replaces the default Auth.js sign-in page.

### Steps

1. Create the login page directory:
   ```bash
   mkdir -p src/app/login
   ```

2. Create `src/app/login/page.tsx`:
   ```typescript
   import { signIn, auth } from "@/auth"
   import { redirect } from "next/navigation"

   export default async function LoginPage({
     searchParams,
   }: {
     searchParams: Promise<{ callbackUrl?: string }>
   }) {
     // Check if user is already logged in
     const session = await auth()
     const { callbackUrl } = await searchParams

     // Redirect authenticated users to the app
     if (session) {
       redirect(callbackUrl || "/app/dashboard")
     }

     return (
       <div style={{
         display: "flex",
         flexDirection: "column",
         alignItems: "center",
         justifyContent: "center",
         minHeight: "100vh",
         gap: "1rem"
       }}>
         <h1>Sign In to Dead Links</h1>
         <p>Sign in with your GitHub account to continue.</p>

         <form
           action={async () => {
             "use server"
             await signIn("github", {
               redirectTo: callbackUrl || "/app/dashboard"
             })
           }}
         >
           <button
             type="submit"
             style={{
               padding: "0.75rem 1.5rem",
               fontSize: "1rem",
               backgroundColor: "#24292e",
               color: "white",
               border: "none",
               borderRadius: "6px",
               cursor: "pointer",
             }}
           >
             Sign in with GitHub
           </button>
         </form>
       </div>
     )
   }
   ```

### Verification

1. If you're still logged in, sign out first: http://localhost:3000/api/auth/signout

2. Visit http://localhost:3000/login

3. You should see your custom login page with:
   - "Sign In to Dead Links" heading
   - A description
   - A styled "Sign in with GitHub" button

4. Click the button. You should be redirected to GitHub, then back to your app.

5. After signing in, visit http://localhost:3000/login again. You should be **redirected** to `/app/dashboard` (which won't exist yet - you'll get a 404).

### Understanding the Code

- `auth()` - Server-side function to get the current session
- `signIn("github", {...})` - Server Action that initiates OAuth with GitHub
- `searchParams.callbackUrl` - Allows deep linking (e.g., `/login?callbackUrl=/app/settings`)
- `"use server"` - Marks the function as a Server Action

---

## Milestone 8: Session Provider for Client Components

### Goal
Set up a SessionProvider so client components can access the session.

### Steps

1. Create the providers directory:
   ```bash
   mkdir -p src/components/providers
   ```

2. Create `src/components/providers/session-provider.tsx`:
   ```typescript
   "use client"

   import { SessionProvider as NextAuthSessionProvider } from "next-auth/react"
   import { ReactNode } from "react"

   export function SessionProvider({ children }: { children: ReactNode }) {
     return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>
   }
   ```

3. Update `src/app/layout.tsx` to wrap the app with SessionProvider:
   ```typescript
   import type { Metadata } from "next"
   import { SessionProvider } from "@/components/providers/session-provider"
   import "./globals.css"

   export const metadata: Metadata = {
     title: "Dead Links",
     description: "Find broken links on your website",
   }

   export default function RootLayout({
     children,
   }: {
     children: React.ReactNode
   }) {
     return (
       <html lang="en">
         <body>
           <SessionProvider>{children}</SessionProvider>
         </body>
       </html>
     )
   }
   ```

### Verification

1. Create a test client component at `src/app/session-test/page.tsx`:
   ```typescript
   "use client"

   import { useSession } from "next-auth/react"

   export default function SessionTestPage() {
     const { data: session, status } = useSession()

     return (
       <div style={{ padding: "2rem" }}>
         <h1>Session Test</h1>
         <p><strong>Status:</strong> {status}</p>
         <pre style={{
           background: "#f4f4f4",
           padding: "1rem",
           borderRadius: "4px",
           overflow: "auto"
         }}>
           {JSON.stringify(session, null, 2)}
         </pre>
       </div>
     )
   }
   ```

2. Visit http://localhost:3000/session-test

3. **If logged out**, you should see:
   - Status: `unauthenticated`
   - Session: `null`

4. **If logged in**, you should see:
   - Status: `authenticated`
   - Session: `{ user: { name, email, image }, expires: "..." }`

5. Delete the test file after verification:
   ```bash
   rm -rf src/app/session-test
   ```

### Understanding useSession

The `useSession()` hook returns:
- `data` (session) - The session object or `null`
- `status` - One of: `"loading"`, `"authenticated"`, `"unauthenticated"`

Use `status` to show loading states. Never assume the session is available immediately.

---

## Milestone 9: Type Augmentation for Session

### Goal
Add TypeScript types so `session.user.id` is properly typed.

### Steps

1. Create the types directory:
   ```bash
   mkdir -p src/types
   ```

2. Create `src/types/next-auth.d.ts`:
   ```typescript
   import { DefaultSession } from "next-auth"

   declare module "next-auth" {
     interface Session {
       user: {
         id: string
       } & DefaultSession["user"]
     }
   }
   ```

3. Ensure your `tsconfig.json` includes the types directory. It should already work with the default Next.js config.

### Verification

1. Open `src/auth.ts` in your editor

2. Find the `session` callback:
   ```typescript
   session({ session, user }) {
     session.user.id = user.id
     return session
   }
   ```

3. Hover over `session.user.id` - TypeScript should recognize it as `string`

4. Try adding this to a Server Component:
   ```typescript
   const session = await auth()
   const userId: string = session?.user.id // Should have no TypeScript error
   ```

5. Run the TypeScript compiler:
   ```bash
   pnpm tsc --noEmit
   ```

   Should complete with no type errors related to `session.user.id`.

---

## Milestone 10: Protected Routes with Middleware

### Goal
Add middleware to protect all `/app/*` routes. Unauthenticated users are redirected to login.

### Steps

1. Create `src/middleware.ts` in the `src` directory:
   ```typescript
   import { auth } from "@/auth"
   import { NextResponse } from "next/server"

   export default auth((req) => {
     const isAuthenticated = !!req.auth

     // If not authenticated, redirect to login
     if (!isAuthenticated) {
       const loginUrl = new URL("/login", req.nextUrl)
       // Preserve the original URL so we can redirect back after login
       loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname)
       return NextResponse.redirect(loginUrl)
     }

     // User is authenticated, allow the request
     return NextResponse.next()
   })

   export const config = {
     // Only run middleware on /app/* routes
     matcher: ["/app/:path*"],
   }
   ```

### Verification

1. Create a protected test page at `src/app/app/test/page.tsx`:

   First create the directories:
   ```bash
   mkdir -p src/app/app/test
   ```

   Then create the file:
   ```typescript
   export default function ProtectedTestPage() {
     return (
       <div style={{ padding: "2rem" }}>
         <h1>Protected Page</h1>
         <p>If you can see this, you are authenticated!</p>
       </div>
     )
   }
   ```

2. Sign out: http://localhost:3000/api/auth/signout

3. Try to visit http://localhost:3000/app/test

4. You should be **redirected** to `/login?callbackUrl=/app/test`

5. Sign in via the login page

6. After signing in, you should be redirected to `/app/test` and see "Protected Page"

7. Visit http://localhost:3000/app/test directly while logged in - should work

8. Visit http://localhost:3000/ (home) while logged out - should work (it's public)

### Understanding the Middleware

- The middleware runs on the Edge Runtime before the page loads
- `req.auth` is injected by the `auth()` wrapper and contains the session
- The `matcher` config ensures middleware ONLY runs on `/app/*` routes
- Public routes (`/`, `/login`) are not affected at all

---

## Milestone 11: Authenticated Layout with Navigation

### Goal
Create a shared layout for all authenticated pages with navigation and sign-out.

### Steps

1. Create the authenticated layout at `src/app/app/layout.tsx`:
   ```typescript
   import { auth, signOut } from "@/auth"
   import { redirect } from "next/navigation"
   import { ReactNode } from "react"

   export default async function AuthenticatedLayout({
     children,
   }: {
     children: ReactNode
   }) {
     const session = await auth()

     // Extra safety check (middleware should handle this)
     if (!session?.user) {
       redirect("/login")
     }

     return (
       <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
         {/* Navigation Header */}
         <header style={{
           padding: "1rem 2rem",
           borderBottom: "1px solid #eaeaea",
           display: "flex",
           justifyContent: "space-between",
           alignItems: "center",
         }}>
           <nav style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
             <a href="/app/dashboard" style={{ fontWeight: "bold", textDecoration: "none" }}>
               Dead Links
             </a>
             <a href="/app/dashboard">Dashboard</a>
             <a href="/app/jobs">Jobs</a>
           </nav>

           <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
             {session.user.image && (
               <img
                 src={session.user.image}
                 alt={session.user.name || "User"}
                 style={{ width: 32, height: 32, borderRadius: "50%" }}
               />
             )}
             <span>{session.user.name}</span>
             <form
               action={async () => {
                 "use server"
                 await signOut({ redirectTo: "/" })
               }}
             >
               <button
                 type="submit"
                 style={{
                   padding: "0.5rem 1rem",
                   background: "#f4f4f4",
                   border: "1px solid #ddd",
                   borderRadius: "4px",
                   cursor: "pointer",
                 }}
               >
                 Sign out
               </button>
             </form>
           </div>
         </header>

         {/* Page Content */}
         <main style={{ flex: 1, padding: "2rem" }}>
           {children}
         </main>
       </div>
     )
   }
   ```

2. Create a dashboard page at `src/app/app/dashboard/page.tsx`:
   ```bash
   mkdir -p src/app/app/dashboard
   ```

   ```typescript
   import { auth } from "@/auth"

   export default async function DashboardPage() {
     const session = await auth()

     return (
       <div>
         <h1>Dashboard</h1>
         <p>Welcome back, {session?.user.name}!</p>

         <section style={{ marginTop: "2rem" }}>
           <h2>Your Info</h2>
           <ul>
             <li><strong>User ID:</strong> {session?.user.id}</li>
             <li><strong>Email:</strong> {session?.user.email}</li>
             <li><strong>Name:</strong> {session?.user.name}</li>
           </ul>
         </section>
       </div>
     )
   }
   ```

3. Create a jobs placeholder page at `src/app/app/jobs/page.tsx`:
   ```bash
   mkdir -p src/app/app/jobs
   ```

   ```typescript
   export default function JobsPage() {
     return (
       <div>
         <h1>Jobs</h1>
         <p>Your link checking jobs will appear here.</p>
       </div>
     )
   }
   ```

### Verification

1. Sign in if not already logged in

2. Visit http://localhost:3000/app/dashboard

3. Verify you see:
   - A navigation header with "Dead Links", "Dashboard", "Jobs" links
   - Your GitHub avatar (if you have one)
   - Your name
   - A "Sign out" button
   - The dashboard content with your user ID, email, and name

4. Click "Jobs" in the navigation - should go to `/app/jobs`

5. Click "Sign out" - should sign you out and redirect to `/`

6. Try to visit http://localhost:3000/app/dashboard again - should redirect to login

### Clean Up Test Files

Remove the test page we created earlier:
```bash
rm -rf src/app/app/test
```

---

## Milestone 12: Landing Page with Auth State

### Goal
Update the landing page to show different content based on authentication state.

### Steps

1. Update `src/app/page.tsx`:
   ```typescript
   import { auth } from "@/auth"
   import Link from "next/link"

   export default async function HomePage() {
     const session = await auth()

     return (
       <div style={{
         display: "flex",
         flexDirection: "column",
         alignItems: "center",
         justifyContent: "center",
         minHeight: "100vh",
         textAlign: "center",
         padding: "2rem",
       }}>
         <h1 style={{ fontSize: "3rem", marginBottom: "1rem" }}>
           Dead Links
         </h1>
         <p style={{ fontSize: "1.25rem", color: "#666", marginBottom: "2rem" }}>
           Find and fix broken links on your website.
         </p>

         {session ? (
           // User is logged in
           <div>
             <p style={{ marginBottom: "1rem" }}>
               Welcome back, {session.user.name}!
             </p>
             <Link
               href="/app/dashboard"
               style={{
                 display: "inline-block",
                 padding: "0.75rem 1.5rem",
                 backgroundColor: "#0070f3",
                 color: "white",
                 textDecoration: "none",
                 borderRadius: "6px",
               }}
             >
               Go to Dashboard
             </Link>
           </div>
         ) : (
           // User is not logged in
           <div style={{ display: "flex", gap: "1rem" }}>
             <Link
               href="/login"
               style={{
                 display: "inline-block",
                 padding: "0.75rem 1.5rem",
                 backgroundColor: "#24292e",
                 color: "white",
                 textDecoration: "none",
                 borderRadius: "6px",
               }}
             >
               Sign in with GitHub
             </Link>
           </div>
         )}
       </div>
     )
   }
   ```

### Verification

1. Sign out if logged in

2. Visit http://localhost:3000

3. You should see:
   - "Dead Links" heading
   - Description
   - "Sign in with GitHub" button

4. Click the button - should go to login page, then GitHub

5. After signing in, visit http://localhost:3000 again

6. You should see:
   - "Welcome back, [Your Name]!"
   - "Go to Dashboard" button

7. Click "Go to Dashboard" - should go to `/app/dashboard`

---

## Milestone 13: Error Handling

### Goal
Add proper error handling for auth failures.

### Steps

1. Create an error page at `src/app/auth/error/page.tsx`:
   ```bash
   mkdir -p src/app/auth/error
   ```

   ```typescript
   import Link from "next/link"

   export default async function AuthErrorPage({
     searchParams,
   }: {
     searchParams: Promise<{ error?: string }>
   }) {
     const { error } = await searchParams

     const errorMessages: Record<string, string> = {
       Configuration: "There is a problem with the server configuration.",
       AccessDenied: "You do not have permission to sign in.",
       Verification: "The verification link has expired or has already been used.",
       Default: "An error occurred during authentication.",
     }

     const errorMessage = errorMessages[error || ""] || errorMessages.Default

     return (
       <div style={{
         display: "flex",
         flexDirection: "column",
         alignItems: "center",
         justifyContent: "center",
         minHeight: "100vh",
         textAlign: "center",
         padding: "2rem",
       }}>
         <h1 style={{ color: "#e53e3e" }}>Authentication Error</h1>
         <p style={{ marginTop: "1rem", color: "#666" }}>{errorMessage}</p>
         {error && (
           <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "#999" }}>
             Error code: {error}
           </p>
         )}
         <Link
           href="/login"
           style={{
             marginTop: "2rem",
             padding: "0.75rem 1.5rem",
             backgroundColor: "#0070f3",
             color: "white",
             textDecoration: "none",
             borderRadius: "6px",
           }}
         >
           Try Again
         </Link>
       </div>
     )
   }
   ```

2. Update `src/auth.ts` to use the custom error page:
   ```typescript
   // In the NextAuth config, update the pages section:
   pages: {
     signIn: "/login",
     error: "/auth/error",
   },
   ```

### Verification

1. Test the error page directly: http://localhost:3000/auth/error?error=AccessDenied

2. You should see:
   - "Authentication Error" heading in red
   - "You do not have permission to sign in." message
   - "Error code: AccessDenied"
   - "Try Again" button

3. Test with different error codes:
   - `?error=Configuration`
   - `?error=UnknownError`

---

## Milestone 14: Production Environment Variables

### Goal
Document the environment variables needed for production deployment.

### Steps

1. Create `src/env.example` as documentation:
   ```env
   # Database
   DATABASE_URL=postgresql://user:password@host:5432/database

   # Auth.js
   NEXTAUTH_URL=https://your-domain.com
   NEXTAUTH_SECRET=generate-with-openssl-rand-base64-32

   # GitHub OAuth
   GITHUB_CLIENT_ID=your_production_client_id
   GITHUB_CLIENT_SECRET=your_production_client_secret
   ```

2. Update `docker-compose.yml` to include web service env vars:
   ```yaml
   web:
     # ... existing config ...
     environment:
       - NODE_ENV=production
       - DATABASE_URL=postgresql://deadlinks:deadlinks@postgres:5432/deadlinks
       - NEXTAUTH_URL=${NEXTAUTH_URL}
       - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
       - GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}
       - GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
   ```

### Verification

1. Check that all environment variables are documented:
   ```bash
   grep -E "^[A-Z]" src/env.example
   ```

2. For production, you'll need:
   - A separate GitHub OAuth App with production URLs
   - A strong, unique NEXTAUTH_SECRET
   - NEXTAUTH_URL set to your production domain

---

## Final Verification Checklist

Run through this checklist to verify everything works:

### Authentication Flow
- [ ] Can view landing page without being logged in
- [ ] Can access login page
- [ ] "Sign in with GitHub" redirects to GitHub
- [ ] GitHub OAuth completes and redirects back
- [ ] Session is created in database after login
- [ ] Can sign out
- [ ] Session is deleted from database after sign out

### Protected Routes
- [ ] `/app/*` routes redirect to login when not authenticated
- [ ] `/app/*` routes are accessible when authenticated
- [ ] Callback URL is preserved (login → protected page)

### Session Access
- [ ] Server components can access session via `auth()`
- [ ] Client components can access session via `useSession()`
- [ ] `session.user.id` is available and typed correctly

### UI
- [ ] Landing page shows different content based on auth state
- [ ] Authenticated layout shows user info and sign out button
- [ ] Navigation works between authenticated pages
- [ ] Error page displays for auth errors

---

## Next Steps

Now that authentication is working, consider these enhancements:

1. **Associate jobs with users** - Add a `userId` column to the jobs table
2. **User-specific job listing** - Filter jobs by the logged-in user
3. **Add more OAuth providers** - Google, GitLab, etc.
4. **Rate limiting** - Protect auth endpoints from abuse
5. **Audit logging** - Track sign-in/sign-out events
6. **Account linking** - Allow users to connect multiple OAuth accounts

---

## Troubleshooting

### "NEXTAUTH_SECRET is missing"
Set `NEXTAUTH_SECRET` in `.env.local`. Generate with `openssl rand -base64 32`.

### "OAuth callback error"
Verify your GitHub OAuth App callback URL exactly matches: `http://localhost:3000/api/auth/callback/github`

### Session is null after login
1. Check browser cookies - should have `authjs.session-token`
2. Verify `auth.sessions` table has a row
3. Check for console errors

### Middleware not running
Ensure `src/middleware.ts` is at the correct path (not in `app/`).

### TypeScript errors on session.user.id
Ensure `src/types/next-auth.d.ts` exists and tsconfig includes it.

### Database connection errors
1. Verify PostgreSQL is running: `docker-compose ps`
2. Check DATABASE_URL format: `postgresql://user:pass@host:port/db`
3. Try connecting with psql to verify credentials
