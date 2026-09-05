export function AccessNotice({
  kind,
}: {
  kind: "forbidden" | "misconfigured";
}) {
  const misconfigured = kind === "misconfigured";
  return (
    <main className="access-shell">
      <section className="access-card">
        <span className="brand-mark" aria-hidden="true">
          SO
        </span>
        <p className="overline">Protected workspace</p>
        <h1>{misconfigured ? "Access setup is incomplete." : "Access not allowed."}</h1>
        <p>
          {misconfigured
            ? "ScriptOps is closed until the production authentication settings are configured."
            : "This signed-in account is not on the ScriptOps judge allow-list."}
        </p>
      </section>
    </main>
  );
}
