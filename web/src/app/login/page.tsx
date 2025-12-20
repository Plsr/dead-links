import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  const { callbackUrl } = await searchParams;

  if (session) {
    // TODO: Redirect to a meaningful page once it exists
    return redirect(callbackUrl ?? "/");
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        gap: "1rem",
      }}
    >
      <h1>Sign In to Dead Links</h1>
      <p>Sign in with your GitHub account to continue.</p>

      <form
        action={async () => {
          "use server";
          await signIn("github", {
            redirectTo: callbackUrl || "/app/dashboard",
          });
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
  );
}
