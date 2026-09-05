import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

import { hasClerkConfiguration } from "@/lib/auth/access-policy";

export default function SignInPage() {
  return (
    <main className="auth-shell">
      <section className="auth-context" aria-labelledby="auth-title">
        <Link className="brand-lockup" href="/" aria-label="ScriptOps home">
          <span className="brand-mark" aria-hidden="true">
            SO
          </span>
          <span>ScriptOps</span>
        </Link>
        <div>
          <p className="overline">Protected production workspace</p>
          <h1 id="auth-title">One change. Every department accounted for.</h1>
          <p>
            Sign in with the supplied judge account to open the fixed Dust &amp;
            Thunder production plan. Public account creation is disabled.
          </p>
        </div>
        <p className="auth-footnote">
          Browser sessions remain isolated even when judges share one account.
        </p>
      </section>

      <section className="auth-panel" aria-label="Sign in">
        {hasClerkConfiguration() ? (
          <SignIn
            withSignUp={false}
            transferable={false}
            fallbackRedirectUrl="/"
            appearance={{
              variables: {
                colorPrimary: "#d7a84b",
                colorBackground: "#11151a",
                colorForeground: "#f3f0e7",
                colorMutedForeground: "#929aa4",
                colorInput: "#0b0e12",
                colorInputForeground: "#f3f0e7",
                borderRadius: "0.5rem",
              },
            }}
          />
        ) : (
          <div className="auth-unconfigured">
            <p className="overline">Development preview</p>
            <h2>Clerk keys are not configured locally.</h2>
            <p>
              The dashboard preview remains available during development. The
              production build fails closed until Clerk is configured.
            </p>
            <Link className="text-link" href="/">
              Open local dashboard preview
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
