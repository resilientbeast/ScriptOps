import "server-only";

import {
  Document,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import type { EvidenceRecord, ProductionPlan } from "@/lib/domain/types";
import type { RippleRun } from "@/lib/firestore/state-types";

const styles = StyleSheet.create({
  page: { padding: 42, fontFamily: "Helvetica", fontSize: 9, color: "#1b1a17" },
  overline: { color: "#9a6300", fontSize: 7, fontFamily: "Helvetica-Bold", letterSpacing: 1.1, marginBottom: 6 },
  title: { fontSize: 21, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  subtitle: { color: "#4d4a43", fontSize: 10, lineHeight: 1.45, marginBottom: 18 },
  divider: { borderBottom: "1 solid #d9c38d", marginBottom: 14 },
  section: { marginBottom: 13 },
  sectionTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 5 },
  row: { display: "flex", flexDirection: "row", gap: 12, marginBottom: 5 },
  metric: { width: "31%", color: "#7d5000", fontFamily: "Helvetica-Bold" },
  detail: { width: "69%", lineHeight: 1.35 },
  note: { color: "#5c584f", fontSize: 8, lineHeight: 1.35, marginTop: 9 },
  citation: { marginBottom: 6 },
  citationTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", lineHeight: 1.25 },
  citationExcerpt: { color: "#3f3c36", fontSize: 8, lineHeight: 1.25, marginTop: 1 },
  citationUrl: { color: "#7d5000", fontSize: 7, lineHeight: 1.2, marginTop: 1 },
  footer: { position: "absolute", bottom: 28, left: 42, right: 42, fontSize: 7, color: "#746f64", textAlign: "right" },
});

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function evidenceLabel(run: RippleRun, count: number) {
  const proposal = run.proposal!;
  return `${proposal.evidence.sourceMode === "live" ? "Live Parallel" : "Cached Parallel fallback"} · ${count} distinct sources`;
}

function citationKey(record: EvidenceRecord): string {
  const url = new URL(record.url);
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "").toLowerCase() || "/";
  if (url.hostname.endsWith("nmfilm.com")) {
    url.pathname = url.pathname.replace(/^\/whynewmexico(?=\/filmmaker-resources\/)/, "");
  }
  return `${url.hostname.toLowerCase()}${url.pathname}`;
}

function hasSubstantiveExcerpt(record: EvidenceRecord): boolean {
  const normalize = (value: string) => value.replace(/[^a-z0-9]+/gi, "").toLowerCase();
  return normalize(record.excerpt) !== normalize(record.title);
}

function curatedCitations(records: EvidenceRecord[]): EvidenceRecord[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    if (!hasSubstantiveExcerpt(record)) return false;
    const key = citationKey(record);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 4);
}

function compactUrl(value: string): string {
  const url = new URL(value);
  const label = `${url.hostname}${url.pathname}`;
  return label.length > 80 ? `${label.slice(0, 77)}...` : label;
}

function compactExcerpt(value: string): string {
  return value.length > 260 ? `${value.slice(0, 257).trim()}...` : value;
}

export function isPdfExportEligible(plan: ProductionPlan, run: RippleRun | null) {
  return Boolean(plan.revisionRecord && run?.status === "approved" && run.proposal);
}

export async function renderProductionBible(plan: ProductionPlan, run: RippleRun): Promise<Buffer> {
  if (!isPdfExportEligible(plan, run)) throw new Error("PDF_EXPORT_NOT_ELIGIBLE");
  const revision = plan.revisionRecord!;
  const proposal = run.proposal!;
  const citations = curatedCitations(proposal.evidence.records);
  const evidenceStatus = evidenceLabel(run, citations.length);
  const pdf = (
    <Document title={`${plan.production.title} - Production Bible`} author="ScriptOps">
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.overline}>SCRIPTOPS / APPROVED PRODUCTION PLAN</Text>
        <Text style={styles.title}>{plan.production.title}</Text>
        <Text style={styles.subtitle}>{plan.production.logline}</Text>
        <View style={styles.divider} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current approved plan · v{revision.planVersion}</Text>
          <View style={styles.row}><Text style={styles.metric}>Scenes</Text><Text style={styles.detail}>{plan.scenes.length} mapped screenplay scenes</Text></View>
          <View style={styles.row}><Text style={styles.metric}>Schedule</Text><Text style={styles.detail}>{plan.schedule.shootDays} shoot days · {plan.schedule.days.map((day) => day.label).join("; ")}</Text></View>
          <View style={styles.row}><Text style={styles.metric}>Budget band</Text><Text style={styles.detail}>{money(plan.budget.low)}–{money(plan.budget.high)} USD</Text></View>
          <View style={styles.row}><Text style={styles.metric}>Locations</Text><Text style={styles.detail}>{plan.locations.map((location) => location.name).join("; ")}</Text></View>
          <View style={styles.row}><Text style={styles.metric}>Casting</Text><Text style={styles.detail}>{plan.casting.map((brief) => brief.roleName).join("; ")}</Text></View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Production handoff</Text>
          <Text style={styles.note}>This compact plan reflects one producer-approved, all-or-nothing revision. Planning values remain estimates until production-specific quotes, permits, and safety requirements are confirmed with the relevant authority.</Text>
        </View>
        <Text style={styles.footer}>ScriptOps · {plan.fixtureVersion} · Page 1 of 2</Text>
      </Page>

      <Page size="LETTER" style={styles.page}>
        <Text style={styles.overline}>SCRIPTOPS / APPROVED REVISION RECORD</Text>
        <Text style={styles.title}>Revision Ripple · Scene {proposal.sceneId.replace("scene-", "")}</Text>
        <Text style={styles.subtitle}>Approved {new Date(revision.approvedAt).toLocaleString()} · {evidenceStatus}</Text>
        <View style={styles.divider} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Approved change</Text>
          <Text style={styles.note}>{proposal.requestText}</Text>
          {Object.entries(proposal.impacts).map(([name, impact]) => (
            <View style={styles.row} key={name}>
              <Text style={styles.metric}>{name}</Text>
              <Text style={styles.detail}>{impact.reasons[0]}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Evidence consulted</Text>
          {citations.map((record) => (
            <View style={styles.citation} wrap={false} key={record.id}>
              <Text style={styles.citationTitle}>{record.title}</Text>
              <Text style={styles.citationExcerpt}>{compactExcerpt(record.excerpt)}</Text>
              <Link src={record.url} style={styles.citationUrl}>{compactUrl(record.url)}</Link>
            </View>
          ))}
          <Text style={styles.note}>Evidence status: {evidenceStatus}. Verify current labor, permitting, access, weather, safety, availability, and cost requirements before booking or permitting.</Text>
        </View>
        <Text style={styles.footer}>ScriptOps · Plan v{revision.planVersion} · Page 2 of 2</Text>
      </Page>
    </Document>
  );

  return renderToBuffer(pdf);
}
