/**
 * "Clarifications before design" — the sheet sent to the architect, structural engineer and client with the
 * questions the drawing left open, what is assumed meanwhile, the level list read from the drawing, and a space
 * for the answer. One page per addressee so each party gets only its own questions.
 */
import path from "node:path";
import { Document, Font, Page, Text, View } from "@react-pdf/renderer";
import type { Question } from "@/lib/floor-plans/building";
import type { LevelGroup } from "@/lib/floor-plans/building";

const PUBLIC = path.join(process.cwd(), "public");
Font.register({
  family: "Carlito",
  fonts: [
    { src: path.join(PUBLIC, "fonts", "Carlito-Regular.ttf") },
    { src: path.join(PUBLIC, "fonts", "Carlito-Bold.ttf"), fontWeight: "bold" },
  ],
});
Font.registerHyphenationCallback((w) => [w]);

const INK = "#111", GREY = "#6b7280", LINE = "#d1d5db", ORANGE = "#e8611a";
export type QuestionsInfo = { company: string; project: string; client: string; planName: string; date: string; ref: string; levelsNote?: string; contact: number; floors: number; whole?: number };
const WHO: Record<Question["to"], { title: string; sub: string }> = {
  architect: { title: "For the Architect", sub: "drawings, levels, openings, finishes" },
  structure: { title: "For the Structural Engineer", sub: "slab, beams, walls, columns, stairs" },
  client: { title: "For the Client / Site team", sub: "scope, sets, what is cast with the formwork" },
};

export function QuestionsDocument({ questions, levels, info }: { questions: Question[]; levels: LevelGroup[]; info: QuestionsInfo }) {
  const open = questions.filter((q) => !q.done);
  const parties = (["architect", "structure", "client"] as const).filter((w) => open.some((q) => q.to === w));
  return (
    <Document title={`Clarifications ${info.planName}`} author={info.company}>
      {parties.map((w, pi) => {
        const list = open.filter((q) => q.to === w);
        return (
          <Page key={w} size="A4" style={{ fontFamily: "Carlito", fontSize: 10, color: INK, padding: 36 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1.5, borderBottomColor: ORANGE, paddingBottom: 6 }}>
              <View>
                <Text style={{ fontSize: 15, fontWeight: "bold" }}>{info.company.toUpperCase()}</Text>
                <Text style={{ fontSize: 11, fontWeight: "bold", marginTop: 2 }}>Clarifications required before formwork design</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: GREY }}>Ref {info.ref} · {info.date}</Text>
                <Text style={{ color: GREY }}>Sheet {pi + 1} of {parties.length}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", marginTop: 8, gap: 18 }}>
              <View style={{ flex: 1 }}>
                <Text><Text style={{ color: GREY }}>Project: </Text>{info.project}</Text>
                <Text><Text style={{ color: GREY }}>Client: </Text>{info.client || "—"}</Text>
                <Text><Text style={{ color: GREY }}>Drawing / block: </Text>{info.planName}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text><Text style={{ color: GREY }}>Typical floor measured: </Text>{Math.round(info.contact).toLocaleString("en-IN")} m² contact · {info.floors} formed levels</Text>
                {info.whole ? <Text><Text style={{ color: GREY }}>Whole building: </Text>{Math.round(info.whole).toLocaleString("en-IN")} m² over all pours</Text> : null}
                {info.levelsNote ? <Text style={{ color: GREY }}>{info.levelsNote}</Text> : null}
              </View>
            </View>

            <Text style={{ fontSize: 12, fontWeight: "bold", marginTop: 12, color: ORANGE }}>{WHO[w].title}</Text>
            <Text style={{ color: GREY, marginBottom: 4 }}>{WHO[w].sub}. Until answered, the design proceeds on the assumption noted under each point.</Text>
            {list.map((q, i) => (
              <View key={q.id} wrap={false} style={{ borderWidth: 0.8, borderColor: LINE, borderRadius: 2, padding: 6, marginTop: 5 }}>
                <View style={{ flexDirection: "row" }}>
                  <Text style={{ width: 18, fontWeight: "bold" }}>{i + 1}.</Text>
                  <Text style={{ flex: 1 }}>{q.text}</Text>
                </View>
                <Text style={{ marginLeft: 18, marginTop: 2, color: GREY, fontSize: 9 }}>Why it matters: {q.why}</Text>
                <View style={{ marginLeft: 18, marginTop: 5, flexDirection: "row", alignItems: "flex-end" }}>
                  <Text style={{ color: GREY, fontSize: 9, width: 44 }}>Answer:</Text>
                  <View style={{ flex: 1, borderBottomWidth: 0.6, borderBottomColor: LINE, height: 12 }} />
                </View>
                <View style={{ marginLeft: 62, marginTop: 6, borderBottomWidth: 0.6, borderBottomColor: LINE, height: 12 }} />
              </View>
            ))}

            {pi === 0 && levels.length ? (
              <View style={{ marginTop: 12 }} wrap={false}>
                <Text style={{ fontWeight: "bold", marginBottom: 3 }}>Levels read from the drawing (please correct anything wrong)</Text>
                <View style={{ flexDirection: "row", borderBottomWidth: 0.8, borderBottomColor: INK, paddingBottom: 2 }}>
                  <Text style={{ width: 150, fontWeight: "bold" }}>Level</Text><Text style={{ width: 40, fontWeight: "bold", textAlign: "right" }}>Nos</Text><Text style={{ width: 70, fontWeight: "bold", textAlign: "right" }}>Height mm</Text><Text style={{ flex: 1, fontWeight: "bold", paddingLeft: 10 }}>Drawing</Text><Text style={{ width: 90, fontWeight: "bold" }}>Formwork</Text>
                </View>
                {[...levels].reverse().map((g) => (
                  <View key={g.keys[0]} style={{ flexDirection: "row", borderBottomWidth: 0.4, borderBottomColor: LINE, paddingVertical: 1.5 }}>
                    <Text style={{ width: 150 }}>{g.name}</Text><Text style={{ width: 40, textAlign: "right" }}>{g.count}</Text><Text style={{ width: 70, textAlign: "right" }}>{g.floorMm ?? "—"}</Text>
                    <Text style={{ flex: 1, paddingLeft: 10, color: g.partTitle ? INK : GREY }}>{g.partTitle ? g.partTitle.slice(0, 40) : g.use === "none" ? "" : g.kind === "floor" ? "same as the typical floor" : "not in the file"}</Text>
                    <Text style={{ width: 90 }}>{g.use === "none" ? "not formed" : g.use === "own" ? "own plan" : "typical plan"}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <Text fixed style={{ position: "absolute", bottom: 20, left: 36, right: 36, fontSize: 8, color: GREY, textAlign: "center" }}>
              {info.company} · formwork design clarifications · {info.planName} · please return with answers, or mark up the drawing
            </Text>
          </Page>
        );
      })}
      {!parties.length ? (
        <Page size="A4" style={{ fontFamily: "Carlito", fontSize: 11, padding: 36 }}><Text>No open questions — everything the design needs was read from the drawing or answered.</Text></Page>
      ) : null}
    </Document>
  );
}
