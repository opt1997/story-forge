import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const dashboardRuntime = require("../../scripts/dashboard_runtime.js");

export default async (request, context) => {
  const payload = await request.json().catch(() => ({}));
  const runId = payload.run_id;
  const count = Number(payload.count || 1);
  const date = payload.date;
  const options = {
    candidateId: payload.candidate_id || payload.candidateId || "",
    topicTitle: payload.topic_title || payload.topicTitle || "",
  };
  console.log(JSON.stringify({ event: "process-run-start", runId, count, date }));
  if (!runId) {
    return new Response("run_id is required", { status: 400 });
  }

  const root = path.resolve(process.cwd());
  context.waitUntil(
    dashboardRuntime
      .processDashboardRunSafely(root, runId, count, date, options)
      .then(() => console.log(JSON.stringify({ event: "process-run-done", runId })))
      .catch((error) => console.error(JSON.stringify({ event: "process-run-error", runId, message: error.message, stack: error.stack }))),
  );

  return new Response("accepted", { status: 202 });
};
