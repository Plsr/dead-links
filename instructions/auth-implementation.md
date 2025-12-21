# Authentication Implementation - Technical Outline

## Overview

Implement authentication in the Next.js 15 web application using Auth.js (NextAuth v5) with GitHub OAuth provider. Sessions and users will be stored in PostgreSQL using the Drizzle adapter.

## Tech Stack

- **Auth Library**: Auth.js v5 (next-auth@beta)
- **OAuth Provider**: GitHub
- **Session Strategy**: Database sessions (PostgreSQL)
- **ORM Adapter**: @auth/drizzle-adapter
- **Database**: PostgreSQL (shared with worker service)

---

## 1. Dependencies

Install in the `web` package:

```bash
pnpm add next-auth@beta @auth/drizzle-adapter drizzle-orm postgres
pnpm add -D drizzle-kit @types/pg
```

---

## 2. Database Schema

Create auth tables in a new `auth` schema (separate from worker's `worker` schema).

### File: `web/src/db/schema.ts`

```typescript
import { pgTable, pgSchema, text, timestamp, primaryKey, integer } from "drizzle-orm/pg-core"
import type { AdapterAccountType } from "next-auth/adapters"

export const authSchema = pgSchema("auth")

export const users = authSchema.table("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
})

export const accounts = authSchema.table("accounts", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
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
}, (account) => ({
  compositePk: primaryKey({ columns: [account.provider, account.providerAccountId] }),
}))

export const sessions = authSchema.table("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
})
```

### Migration

Create migration file or use Drizzle Kit:

```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

---

## 3. Database Connection

### File: `web/src/db/index.ts`

```typescript
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

const connectionString = process.env.DATABASE_URL!

const client = postgres(connectionString)
export const db = drizzle(client, { schema })
```

### File: `web/drizzle.config.ts`

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

---

## 4. Auth.js Configuration

### File: `web/src/auth.ts`

```typescript
import NextAuth from "next-auth"
import GitHub from "next-auth/providers/github"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { db } from "./db"
import { users, accounts, sessions } from "./db/schema"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
  }),
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
  ],
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    session({ session, user }) {
      // Add user id to session
      session.user.id = user.id
      return session
    },
  },
})
```

---

## 5. API Route Handler

### File: `web/src/app/api/auth/[...nextauth]/route.ts`

```typescript
import { handlers } from "@/auth"

export const { GET, POST } = handlers
```

---

## 6. Middleware (Route Protection)

All authenticated routes live under the `/app` path prefix. The middleware only needs to protect this path.

### File: `web/src/middleware.ts`

```typescript
import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const isAuthenticated = !!req.auth

  if (!isAuthenticated) {
    const loginUrl = new URL("/login", req.nextUrl)
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/app/:path*"],
}
```

---

## 7. Session Provider (Client)

### File: `web/src/components/providers/session-provider.tsx`

```typescript
"use client"

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react"
import { ReactNode } from "react"

export function SessionProvider({ children }: { children: ReactNode }) {
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>
}
```

### Update: `web/src/app/layout.tsx`

```typescript
import { SessionProvider } from "@/components/providers/session-provider"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
```

---

## 8. Login Page

### File: `web/src/app/login/page.tsx`

```typescript
import { signIn, auth } from "@/auth"
import { redirect } from "next/navigation"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const session = await auth()
  const { callbackUrl } = await searchParams

  if (session) {
    redirect(callbackUrl || "/app/dashboard")
  }

  return (
    <div>
      <h1>Sign In</h1>
      <form
        action={async () => {
          "use server"
          await signIn("github", { redirectTo: callbackUrl || "/app/dashboard" })
        }}
      >
        <button type="submit">Sign in with GitHub</button>
      </form>
    </div>
  )
}
```

---

## 9. Authenticated Layout (Optional)

A shared layout for all authenticated pages. Useful for adding common UI like navigation and sign-out.

### File: `web/src/app/app/layout.tsx`

```typescript
import { auth, signOut } from "@/auth"
import { redirect } from "next/navigation"
import { ReactNode } from "react"

export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const session = await auth()

  // Double-check auth (middleware should handle this, but good for safety)
  if (!session) {
    redirect("/login")
  }

  return (
    <div>
      <header>
        <nav>
          <span>Welcome, {session.user.name}</span>
          <form
            action={async () => {
              "use server"
              await signOut({ redirectTo: "/" })
            }}
          >
            <button type="submit">Sign out</button>
          </form>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  )
}
```

---

## 10. Auth Utilities

### Server-side session access

```typescript
import { auth } from "@/auth"

export default async function ProtectedPage() {
  const session = await auth()
  // session.user.id, session.user.email, session.user.name, session.user.image
}
```

### Client-side session access

```typescript
"use client"
import { useSession } from "next-auth/react"

export function UserProfile() {
  const { data: session, status } = useSession()
  // status: "loading" | "authenticated" | "unauthenticated"
}
```

### Sign out action

```typescript
import { signOut } from "@/auth"

// In a Server Component or Server Action
await signOut({ redirectTo: "/" })

// In a Client Component
import { signOut } from "next-auth/react"
signOut({ callbackUrl: "/" })
```

---

## 11. Environment Variables

### File: `web/.env.local` (local development)

```env
DATABASE_URL=postgresql://deadlinks:deadlinks@localhost:5432/deadlinks
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generate-with-openssl-rand-base64-32>

GITHUB_CLIENT_ID=<from-github-oauth-app>
GITHUB_CLIENT_SECRET=<from-github-oauth-app>
```

### Docker/Production environment variables

Add to `docker-compose.yml` under web service:

```yaml
environment:
  - DATABASE_URL=postgresql://deadlinks:deadlinks@postgres:5432/deadlinks
  - NEXTAUTH_URL=https://your-domain.com
  - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
  - GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}
  - GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
```

---

## 12. GitHub OAuth App Setup

1. Go to GitHub Settings > Developer settings > OAuth Apps
2. Create new OAuth App:
   - **Application name**: Dead Links (or your app name)
   - **Homepage URL**: `http://localhost:3000` (dev) or production URL
   - **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`
3. Copy Client ID and generate Client Secret

---

## 13. Type Augmentation

### File: `web/src/types/next-auth.d.ts`

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

---

## 14. File Structure (Final)

```
web/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── auth/
│   │   │       └── [...nextauth]/
│   │   │           └── route.ts
│   │   ├── app/                      # Protected routes (requires auth)
│   │   │   ├── layout.tsx            # Optional: shared layout for authenticated pages
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx
│   │   │   └── jobs/
│   │   │       └── page.tsx
│   │   ├── login/                    # Public
│   │   │   └── page.tsx
│   │   ├── layout.tsx                # Root layout
│   │   └── page.tsx                  # Landing page (public)
│   ├── components/
│   │   └── providers/
│   │       └── session-provider.tsx
│   ├── db/
│   │   ├── index.ts
│   │   └── schema.ts
│   ├── types/
│   │   └── next-auth.d.ts
│   ├── auth.ts
│   └── middleware.ts
├── drizzle/
│   └── (migrations)
├── drizzle.config.ts
└── .env.local
```

**Route structure:**
- `/` - Landing page (public)
- `/login` - Login page (public)
- `/app/*` - All authenticated routes (protected by middleware)
  - `/app/dashboard` - Dashboard
  - `/app/jobs` - Jobs list
  - etc.

---

## 15. Implementation Order

1. Install dependencies
2. Set up database connection (`db/index.ts`, `db/schema.ts`, `drizzle.config.ts`)
3. Run database migrations to create auth tables
4. Create GitHub OAuth App and configure environment variables
5. Configure Auth.js (`auth.ts`)
6. Add API route handler (`api/auth/[...nextauth]/route.ts`)
7. Add type augmentation (`types/next-auth.d.ts`)
8. Add SessionProvider component and wrap layout
9. Add middleware for route protection
10. Create login page
11. Test authentication flow

---

## 16. Security Considerations

- `NEXTAUTH_SECRET` must be a strong random string (min 32 chars)
- Store secrets in environment variables, never commit to git
- Use HTTPS in production (`NEXTAUTH_URL` must be https://)
- Database sessions are automatically cleaned up by Auth.js
- Consider rate limiting on auth endpoints in production
