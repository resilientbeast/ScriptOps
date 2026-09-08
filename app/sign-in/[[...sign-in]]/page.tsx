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
        <div className="auth-hero">
          <p className="overline">Production control, in early access</p>
          <h1 id="auth-title">One change. Every department, accounted for.</h1>
          <p className="auth-intro">
            ScriptOps turns an approved screenplay revision into a coordinated,
            evidence-backed production plan—so schedule, budget, locations,
            casting, and safety stay aligned.
          </p>
          <ol className="auth-workflow" aria-label="How ScriptOps works">
            <li>
              <span>01</span>
              <strong>Ground the plan</strong>
              <p>Review the screenplay source before planning begins.</p>
            </li>
            <li>
              <span>02</span>
              <strong>Trace the ripple</strong>
              <p>See one revision across every affected production artifact.</p>
            </li>
            <li>
              <span>03</span>
              <strong>Approve with context</strong>
              <p>Keep the evidence and every approved version connected.</p>
            </li>
          </ol>
        </div>
        <div className="auth-bottom">
          <p className="auth-availability">
            <span aria-hidden="true" /> Invitation-only early access for
            production teams.
          </p>
          <p className="auth-tech">Built with Gemini · Google Cloud · Parallel</p>
        </div>
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
