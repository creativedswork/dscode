/**
 * Scenario Modeler MCP App Server — dscode example
 * 
 * Registration: server.tool() + server.resource() with _meta.ui
 * No @modelcontextprotocol/ext-apps dependency.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import cors from "cors";
import { z } from "zod";

// ============================================================================
// Types & Business Logic (adapted from ext-apps scenario-modeler)
// ============================================================================

interface ScenarioInputs {
  startingMRR: number;
  monthlyGrowthRate: number;
  monthlyChurnRate: number;
  grossMargin: number;
  fixedCosts: number;
}

interface MonthlyProjection {
  month: number; mrr: number; grossProfit: number; netProfit: number; cumulativeRevenue: number;
}

interface ScenarioSummary {
  endingMRR: number; arr: number; totalRevenue: number; totalProfit: number;
  mrrGrowthPct: number; avgMargin: number; breakEvenMonth: number | null;
}

interface ScenarioTemplate {
  id: string; name: string; icon: string; description: string;
  parameters: ScenarioInputs; projections: MonthlyProjection[];
  summary: ScenarioSummary; keyInsight: string;
}

function calculateProjections(i: ScenarioInputs): MonthlyProjection[] {
  const r = (i.monthlyGrowthRate - i.monthlyChurnRate) / 100;
  const ps: MonthlyProjection[] = [];
  let cum = 0;
  for (let m = 1; m <= 12; m++) {
    const mrr = i.startingMRR * Math.pow(1 + r, m);
    const gp = mrr * (i.grossMargin / 100);
    const np = gp - i.fixedCosts;
    cum += mrr;
    ps.push({ month: m, mrr, grossProfit: gp, netProfit: np, cumulativeRevenue: cum });
  }
  return ps;
}

function calculateSummary(ps: MonthlyProjection[], i: ScenarioInputs): ScenarioSummary {
  const e = ps[11].mrr;
  const tr = ps.reduce((s, p) => s + p.mrr, 0);
  const tp = ps.reduce((s, p) => s + Math.round(p.netProfit), 0);
  const bp = ps.find((p) => p.netProfit >= 0);
  return {
    endingMRR: e, arr: e * 12, totalRevenue: Math.round(tr), totalProfit: Math.round(tp),
    mrrGrowthPct: Math.round(((e - i.startingMRR) / i.startingMRR) * 1000) / 10,
    avgMargin: Math.round((tp / tr) * 1000) / 10, breakEvenMonth: bp?.month ?? null,
  };
}

function fmt(v: number): string {
  const a = Math.abs(v), s = v < 0 ? "-" : "";
  if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return s + "$" + (a / 1e3).toFixed(1) + "K";
  return s + "$" + Math.round(a);
}

function bt(id: string, name: string, desc: string, icon: string, p: ScenarioInputs, insight: string): ScenarioTemplate {
  const proj = calculateProjections(p);
  return { id, name, description: desc, icon, parameters: p, projections: proj, summary: calculateSummary(proj, p), keyInsight: insight };
}

const TEMPLATES: ScenarioTemplate[] = [
  bt("bootstrapped", "Bootstrapped Growth", "Low burn, steady growth", "🌱", { startingMRR: 30000, monthlyGrowthRate: 4, monthlyChurnRate: 2, grossMargin: 85, fixedCosts: 20000 }, "Profitable month 1"),
  bt("vc-rocketship", "VC Rocketship", "High burn, explosive growth", "🚀", { startingMRR: 100000, monthlyGrowthRate: 15, monthlyChurnRate: 5, grossMargin: 70, fixedCosts: 150000 }, "Loses early, 3x MRR"),
  bt("cash-cow", "Cash Cow", "Mature, high margin", "🐄", { startingMRR: 80000, monthlyGrowthRate: 2, monthlyChurnRate: 1, grossMargin: 90, fixedCosts: 40000 }, "Consistent profit"),
  bt("turnaround", "Turnaround", "Fighting churn", "🔄", { startingMRR: 60000, monthlyGrowthRate: 6, monthlyChurnRate: 8, grossMargin: 75, fixedCosts: 50000 }, "Negative growth"),
  bt("efficient-growth", "Efficient Growth", "Balanced", "⚖️", { startingMRR: 50000, monthlyGrowthRate: 8, monthlyChurnRate: 3, grossMargin: 80, fixedCosts: 35000 }, "Sustainable"),
];

const DEFAULT: ScenarioInputs = { startingMRR: 50000, monthlyGrowthRate: 5, monthlyChurnRate: 3, grossMargin: 80, fixedCosts: 30000 };

const DEFAULT_PROJECTIONS = calculateProjections(DEFAULT);
const DEFAULT_SUMMARY = calculateSummary(DEFAULT_PROJECTIONS, DEFAULT);

const URI = "ui://scenario-modeler/mcp-app";

const SCENARIO_MODELER_MDX = `
<Card title="SaaS Scenario Modeler">
  <Card title="Current Scenario Inputs">
    <Metrics items={inputMetrics}/>
  </Card>
  <Card title="12-Month Projection">
    <Chart type="line" data={activeProjections} x="month" y={["mrr","grossProfit","netProfit"]}/>
    <Metrics items={summaryMetrics}/>
    <Table rows={activeProjections}/>
  </Card>
  <Card title="Scenario Templates">
    <Table rows={templateRows}/>
  </Card>
</Card>
`.trim();

function formatTemplateRows(templates: ScenarioTemplate[]) {
  return templates.map((template) => ({
    icon: template.icon,
    name: template.name,
    description: template.description,
    keyInsight: template.keyInsight,
    breakEven: template.summary.breakEvenMonth ? `Month ${template.summary.breakEvenMonth}` : "Not achieved",
    endingMRR: fmt(template.summary.endingMRR),
    arr: fmt(template.summary.arr),
  }));
}

function formatInputsMetrics(inputs: ScenarioInputs) {
  return {
    startingMRR: fmt(inputs.startingMRR),
    monthlyGrowthRate: `${inputs.monthlyGrowthRate}%`,
    monthlyChurnRate: `${inputs.monthlyChurnRate}%`,
    grossMargin: `${inputs.grossMargin}%`,
    fixedCosts: fmt(inputs.fixedCosts),
  };
}

function formatSummaryMetrics(summary: ScenarioSummary) {
  return {
    endingMRR: fmt(summary.endingMRR),
    arr: fmt(summary.arr),
    totalRevenue: fmt(summary.totalRevenue),
    totalProfit: fmt(summary.totalProfit),
    mrrGrowth: `${summary.mrrGrowthPct}%`,
    avgMargin: `${summary.avgMargin}%`,
    breakEven: summary.breakEvenMonth ? `Month ${summary.breakEvenMonth}` : "Not achieved",
  };
}

// ============================================================================
// MCP Server Registration (standard SDK — no ext-apps wrapper)
// ============================================================================

function createServer(): McpServer {
  const s = new McpServer({ name: "scenario-modeler", version: "1.0.0" });

  s.registerTool("get-scenario-data",
    {
      title: "Get Scenario Data",
      description: "Get SaaS financial scenario templates and optionally compute custom 12-month projections. Returns data for the interactive dashboard. Call with customInputs omitted (or empty object) to get templates with defaults.",
      inputSchema: {
        customInputs: z.object({
          startingMRR: z.number().optional().describe("Starting MRR ($)"),
          monthlyGrowthRate: z.number().optional().describe("Growth rate (%)"),
          monthlyChurnRate: z.number().optional().describe("Churn rate (%)"),
          grossMargin: z.number().optional().describe("Gross margin (%)"),
          fixedCosts: z.number().optional().describe("Fixed costs ($)"),
        }).optional().describe("Custom scenario parameters. Omit all fields to use defaults."),
      },
      _meta: { ui: { resourceUri: URI, visibility: ["model", "app"] } } as any,
    },
    async (args: { customInputs?: Partial<ScenarioInputs> }) => {
      const raw = args.customInputs;
      const custom: ScenarioInputs | undefined = raw
        ? {
            startingMRR: raw.startingMRR ?? DEFAULT.startingMRR,
            monthlyGrowthRate: raw.monthlyGrowthRate ?? DEFAULT.monthlyGrowthRate,
            monthlyChurnRate: raw.monthlyChurnRate ?? DEFAULT.monthlyChurnRate,
            grossMargin: raw.grossMargin ?? DEFAULT.grossMargin,
            fixedCosts: raw.fixedCosts ?? DEFAULT.fixedCosts,
          }
        : undefined;
      const activeInputs = custom ?? DEFAULT;
      const activeProjections = custom ? calculateProjections(custom) : DEFAULT_PROJECTIONS;
      const activeSummary = custom ? calculateSummary(activeProjections, activeInputs) : DEFAULT_SUMMARY;
      const lines = ["SaaS Scenario Modeler", "=".repeat(40), "", "Templates:"];
      for (const t of TEMPLATES) lines.push(`  ${t.icon} ${t.name}: ${t.description}`);
      if (custom) lines.push("", "Custom:", `  Ending MRR: ${fmt(activeSummary.endingMRR)}`, `  ARR: ${fmt(activeSummary.arr)}`);
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: {
          _ui: { mdx: SCENARIO_MODELER_MDX },
          templateRows: formatTemplateRows(TEMPLATES),
          inputMetrics: formatInputsMetrics(activeInputs),
          summaryMetrics: formatSummaryMetrics(activeSummary),
          activeProjections,
          defaultInputs: DEFAULT,
          customInputs: custom ?? null,
        },
      };
    },
  );

  // No s.resource() call — dscode renders this example from structuredContent.
  // The example includes a server-provided _ui.mdx override to avoid nested object cells.

  return s;
}

async function startHttp() {
  const app = createMcpExpressApp({ host: "0.0.0.0" });
  app.use(cors());
  app.all("/mcp", async (req: any, res: any) => {
    const srv = createServer();
    const t = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { t.close().catch(() => {}); srv.close().catch(() => {}); });
    await srv.connect(t);
    await t.handleRequest(req, res, req.body);
  });
  const port = 3100;
  app.listen(port, () => console.log(`MCP Server → http://localhost:${port}/mcp`));
}

if (process.argv.includes("--stdio")) {
  createServer().connect(new StdioServerTransport());
} else {
  startHttp();
}
