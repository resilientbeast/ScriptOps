import "server-only";

import { Document, Link, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import type { ProjectPlan } from "@/lib/planning/initial-plan-approval";
import { planFromRecord } from "@/lib/planning/project-ripple-contracts";
import type { Project } from "@/lib/projects/schemas";

const styles = StyleSheet.create({
  page: { paddingTop: 54, paddingBottom: 48, paddingHorizontal: 42, fontFamily: "Helvetica", fontSize: 8.5, color: "#1b1a17" },
  header: { position: "absolute", top: 24, left: 42, right: 42, borderBottom: "1 solid #d9c38d", paddingBottom: 6, flexDirection: "row", justifyContent: "space-between" },
  overline: { color: "#8b5b00", fontSize: 6.8, fontFamily: "Helvetica-Bold", letterSpacing: 1.1 },
  footer: { position: "absolute", bottom: 22, left: 42, width: 528, fontSize: 6.8, color: "#746f64", textAlign: "right" },
  title: { fontSize: 22, fontFamily: "Helvetica-Bold", marginBottom: 5 },
  subtitle: { color: "#4d4a43", fontSize: 10, lineHeight: 1.4, marginBottom: 15 },
  section: { marginBottom: 15 },
  sectionTitle: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginBottom: 6, color: "#2a2925", minPresenceAhead: 100 },
  subhead: { fontSize: 8.7, fontFamily: "Helvetica-Bold", marginTop: 8, marginBottom: 3 },
  row: { flexDirection: "row", gap: 10, marginBottom: 4 },
  metric: { width: "26%", color: "#7d5000", fontFamily: "Helvetica-Bold" },
  detail: { width: "74%", lineHeight: 1.35 },
  card: { marginBottom: 6, padding: 7, border: "1 solid #e2ded5", borderRadius: 2, backgroundColor: "#fbfaf7" },
  cardTitle: { fontFamily: "Helvetica-Bold", marginBottom: 2 },
  note: { color: "#5c584f", lineHeight: 1.4, marginBottom: 3 },
  citation: { marginBottom: 6 },
  link: { color: "#7d5000", fontSize: 7.2, lineHeight: 1.2, marginTop: 1 },
  mono: { color: "#5c584f", fontSize: 7, lineHeight: 1.25 },
});

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function compactUrl(value: string) {
  const url = new URL(value);
  const text = `${url.hostname}${url.pathname}`;
  return text.length > 90 ? `${text.slice(0, 87)}...` : text;
}

function provenance(plan: ProjectPlan) {
  const manifest = plan.manifest;
  const common: Array<[string, string]> = [
    ["Plan version", `v${plan.planVersion} (${plan.kind})`],
    ["Approved", new Date(plan.approvedAt).toLocaleString()],
    ["Manifest", manifest.id],
    ["Content hash", manifest.contentHash],
    ["Job", manifest.jobId],
    ["Script version", manifest.scriptVersionId],
    ["Planning inputs", `v${manifest.planningInputsVersion}`],
  ];
  if (plan.kind === "ripple") common.push(["Predecessor", `Plan v${plan.manifest.basePlanVersion} · ${plan.manifest.baseManifestId}`]);
  return common;
}

export async function renderProjectProductionBible(project: Pick<Project, "id" | "title">, approvedPlan: ProjectPlan): Promise<Buffer> {
  const plan = planFromRecord(approvedPlan);
  const ripple = approvedPlan.kind === "ripple" ? approvedPlan.manifest.draft : null;
  const pdf = <Document title={`${project.title} - Plan v${approvedPlan.planVersion}`} author="ScriptOps" subject="Approved production plan">
    <Page size="LETTER" style={styles.page}>
      <View fixed style={styles.header}><Text style={styles.overline}>SCRIPTOPS / APPROVED PROJECT PLAN</Text><Text style={styles.overline}>PROJECT {project.id}</Text></View>
      <Text style={styles.title}>{plan.title}</Text>
      <Text style={styles.subtitle}>{plan.logline ?? "Approved production planning record"}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Approved version</Text>
        <View style={styles.row}><Text style={styles.metric}>Plan</Text><Text style={styles.detail}>Version {approvedPlan.planVersion} · {approvedPlan.kind === "initial" ? "Initial approved baseline" : "Approved revision ripple"}</Text></View>
        <View style={styles.row}><Text style={styles.metric}>Schedule</Text><Text style={styles.detail}>{plan.schedule.shootDays} shoot days across {plan.scenes.length} scenes</Text></View>
        <View style={styles.row}><Text style={styles.metric}>Budget band</Text><Text style={styles.detail}>{money(plan.budget.low, plan.currency)} - {money(plan.budget.high, plan.currency)} · {plan.currency}</Text></View>
        <View style={styles.row}><Text style={styles.metric}>Locations</Text><Text style={styles.detail}>{plan.locations.length} candidate locations</Text></View>
        <View style={styles.row}><Text style={styles.metric}>Casting</Text><Text style={styles.detail}>{plan.casting.length || "No"} casting briefs</Text></View>
      </View>

      {ripple ? <View style={styles.section}>
        <Text style={styles.sectionTitle}>Approved revision request</Text>
        <View style={styles.card} wrap={false}><Text style={styles.cardTitle}>Scene {ripple.sceneId}</Text><Text style={styles.note}>{ripple.requestText}</Text><Text style={styles.mono}>Based on Plan v{ripple.basePlanVersion} · generated {new Date(ripple.generatedAt).toLocaleString()}</Text></View>
      </View> : null}

      {ripple ? <View style={styles.section}>
        <Text style={styles.sectionTitle}>Evidence provenance</Text>
        <Text style={styles.note}>{ripple.evidenceProvenance ? `Fresh Parallel research completed for this revision: ${ripple.evidenceProvenance.freshRecordCount} sources retrieved ${new Date(ripple.evidenceProvenance.searchedAt).toLocaleString()}.` : `This revision retains evidence approved with Plan v${ripple.basePlanVersion}. It does not include a new evidence search for this change.`}</Text>
      </View> : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Shooting schedule</Text>
        {plan.schedule.days.map(day => <View style={styles.card} wrap={false} key={day.id}><Text style={styles.cardTitle}>Day {day.dayNumber} · {day.label}</Text><Text style={styles.note}>{day.estimatedHours} hours · {day.dayNight} · scenes {day.sceneIds.join(", ")}</Text>{day.setupRequirements.map(note => <Text style={styles.note} key={note}>Setup: {note}</Text>)}{day.complianceNotes.map(note => <Text style={styles.note} key={note}>Verify: {note}</Text>)}</View>)}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Budget</Text>
        {plan.budget.lineItems.map(item => <View style={styles.card} wrap={false} key={item.id}><Text style={styles.cardTitle}>{item.category}: {money(item.low, plan.currency)} - {money(item.high, plan.currency)}</Text><Text style={styles.note}>{item.quantity} {item.unit} · {item.basis}</Text><Text style={styles.mono}>Evidence: {item.evidenceIds.join(", ")}</Text></View>)}
        {plan.budget.costDrivers.map(driver => <View style={styles.row} key={driver.id}><Text style={styles.metric}>{driver.label}</Text><Text style={styles.detail}>{driver.direction}: {driver.reason}</Text></View>)}
      </View>

      <View style={styles.section}>
        <View wrap={false}>
          <Text style={styles.sectionTitle}>Locations and casting</Text>
          {plan.locations.slice(0, 1).map(location => <View style={styles.card} key={location.id}><Text style={styles.cardTitle}>{location.name} · {location.locality} ({location.regionCode})</Text><Text style={styles.note}>{location.fit}</Text>{location.risks.map(risk => <Text style={styles.note} key={risk}>Risk: {risk}</Text>)}</View>)}
        </View>
        {plan.locations.slice(1).map(location => <View style={styles.card} wrap={false} key={location.id}><Text style={styles.cardTitle}>{location.name} · {location.locality} ({location.regionCode})</Text><Text style={styles.note}>{location.fit}</Text>{location.risks.map(risk => <Text style={styles.note} key={risk}>Risk: {risk}</Text>)}</View>)}
        {plan.casting.map(brief => <View style={styles.card} wrap={false} key={brief.id}><Text style={styles.cardTitle}>{brief.roleName} · {brief.ageCategory}</Text><Text style={styles.note}>{brief.archetype}</Text>{brief.specialistNeeds.map(need => <Text style={styles.note} key={need}>Need: {need}</Text>)}</View>)}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{ripple ? ripple.evidenceProvenance ? "Fresh evidence for this revision" : `Evidence retained from Plan v${ripple.basePlanVersion}` : "Evidence"}</Text>
        {plan.evidence.map(record => <View style={styles.citation} wrap={false} key={record.id}><Text style={styles.cardTitle}>{record.title}</Text><Link src={record.url} style={styles.link}>{compactUrl(record.url)}</Link><Text style={styles.mono}>Retrieved {new Date(record.retrievedAt).toLocaleString()} · {record.id}</Text></View>)}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Assumptions and warnings</Text>
        {plan.assumptions.map(note => <Text style={styles.note} key={note}>Assumption: {note}</Text>)}
        {plan.warnings.map(note => <Text style={styles.note} key={note}>Warning: {note}</Text>)}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Provenance</Text>
        {provenance(approvedPlan).map(([label, value]) => <View style={styles.row} key={label}><Text style={styles.metric}>{label}</Text><Text style={styles.detail}>{value}</Text></View>)}
      </View>
      <Text fixed style={styles.footer} render={({ pageNumber, totalPages }) => `ScriptOps · approved Plan v${approvedPlan.planVersion} · Page ${pageNumber} of ${totalPages}`} />
    </Page>
  </Document>;
  return renderToBuffer(pdf);
}
