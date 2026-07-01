"use client";

import { useMemo, useState } from "react";

const STAGES = [
  "Strategy",
  "Idea",
  "Outline",
  "Writer",
  "QA",
  "Rewrite",
  "Final",
  "Recorder",
  "Health Check",
];

const INITIAL_STATUS = Object.fromEntries(STAGES.map((stage) => [stage, "pending"]));

const PIPELINE_KEY = {
  Strategy: "strategy",
  Idea: "idea",
  Outline: "outline",
  Writer: "writer",
  QA: "qa",
  Rewrite: "rewrite",
  Final: "final",
  Recorder: "recorder",
  "Health Check": "health_check",
};

function statusClass(status) {
  if (status === "success" || status === "passed") return "border-forest bg-emerald-50 text-forest";
  if (status === "running") return "border-amber bg-amber-50 text-amber";
  if (status === "failed") return "border-coral bg-red-50 text-coral";
  return "border-line bg-white text-neutral-500";
}

function statusDot(status) {
  if (status === "success" || status === "passed") return "bg-forest";
  if (status === "running") return "bg-amber";
  if (status === "failed") return "bg-coral";
  return "bg-neutral-300";
}

export default function DashboardPage() {
  const [stageStatus, setStageStatus] = useState(INITIAL_STATUS);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const todayStatus = useMemo(() => {
    if (error) return "failed";
    if (isRunning) return "running";
    if (result) return result.status;
    return "pending";
  }, [error, isRunning, result]);

  async function startToday() {
    setIsRunning(true);
    setResult(null);
    setError("");
    setStageStatus(INITIAL_STATUS);

    let activeIndex = 0;
    const timer = window.setInterval(() => {
      setStageStatus((current) => {
        const next = { ...current };
        STAGES.forEach((stage, index) => {
          if (index < activeIndex) next[stage] = "success";
          if (index === activeIndex) next[stage] = "running";
        });
        activeIndex = Math.min(activeIndex + 1, STAGES.length - 1);
        return next;
      });
    }, 220);

    try {
      const response = await fetch("/api/start-today", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Workflow failed");
      }

      window.clearInterval(timer);
      const finalStatuses = { ...INITIAL_STATUS };
      for (const stage of STAGES) {
        finalStatuses[stage] = payload.pipeline?.[PIPELINE_KEY[stage]] || "success";
      }
      setStageStatus(finalStatuses);
      setResult(payload);
    } catch (runError) {
      window.clearInterval(timer);
      setError(runError.message);
      setStageStatus((current) => {
        const next = { ...current };
        const runningStage = STAGES.find((stage) => current[stage] === "running") || "Strategy";
        next[runningStage] = "failed";
        return next;
      });
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <main className="min-h-screen bg-paper px-5 py-6 text-ink md:px-8">
      <section className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-line pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-forest">M3.1 Dashboard</p>
            <h1 className="mt-1 text-3xl font-semibold">Story Forge</h1>
          </div>
          <button
            type="button"
            onClick={startToday}
            disabled={isRunning}
            className="inline-flex h-11 items-center justify-center rounded-md bg-ink px-5 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-400"
          >
            {isRunning ? "运行中..." : "开始今天创作"}
          </button>
        </header>

        <section className="grid gap-4 md:grid-cols-[1fr_2fr]">
          <div className="rounded-md border border-line bg-white p-4">
            <p className="text-sm text-neutral-500">今日状态</p>
            <div className="mt-3 flex items-center gap-3">
              <span className={`h-3 w-3 rounded-full ${statusDot(todayStatus)}`} />
              <p className="text-xl font-semibold">{todayStatus}</p>
            </div>
            {error ? <p className="mt-3 text-sm text-coral">{error}</p> : null}
          </div>

          <div className="rounded-md border border-line bg-white p-4">
            <p className="mb-3 text-sm text-neutral-500">Pipeline</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {STAGES.map((stage) => (
                <div key={stage} className={`rounded-md border px-3 py-2 ${statusClass(stageStatus[stage])}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{stage}</span>
                    <span className={`h-2.5 w-2.5 rounded-full ${statusDot(stageStatus[stage])}`} />
                  </div>
                  <p className="mt-1 text-xs">{stageStatus[stage]}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {result ? (
          <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-md border border-line bg-white p-4">
              <p className="text-sm text-neutral-500">Run Result</p>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-neutral-500">run_id</dt>
                  <dd className="break-all text-sm font-medium">{result.run_id}</dd>
                </div>
                <div>
                  <dt className="text-xs text-neutral-500">story_id</dt>
                  <dd className="break-all text-sm font-medium">{result.story_id}</dd>
                </div>
                <div>
                  <dt className="text-xs text-neutral-500">final status</dt>
                  <dd className="text-sm font-medium">{result.status}</dd>
                </div>
                <div>
                  <dt className="text-xs text-neutral-500">final_score</dt>
                  <dd className="text-sm font-medium">{result.final_score}</dd>
                </div>
              </dl>

              <div className="mt-5">
                <p className="mb-2 text-sm font-medium">生成文件</p>
                <div className="grid gap-2">
                  {result.files?.map((file) => (
                    <div
                      key={file.label}
                      className="flex items-center justify-between gap-3 rounded-md border border-line bg-paper px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium">{file.label}</p>
                        <p className="break-all text-xs text-neutral-500">{file.path}</p>
                      </div>
                      <span className={file.exists ? "text-sm font-semibold text-forest" : "text-sm text-coral"}>
                        {file.exists ? "exists" : "missing"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-md border border-line bg-white p-4">
              <p className="text-sm text-neutral-500">System Health</p>
              <div className="mt-3 grid gap-3">
                <HealthMetric label="Workflow Score" value={result.health?.scores?.workflow} />
                <HealthMetric label="Data Flow Score" value={result.health?.scores?.data_flow} />
                <HealthMetric label="Agent Permission Score" value={result.health?.scores?.agent_permission} />
                <HealthMetric label="Metrics Integrity Score" value={result.health?.scores?.metrics_integrity} />
              </div>
              <div className="mt-4 rounded-md border border-line bg-paper p-3 text-sm">
                <p>Story Quality: {result.health?.scores?.story_quality}/100</p>
                <p>AI vs Human Gap: {result.health?.scores?.ai_vs_human_gap} 分</p>
                <p>Prompt Drift: {result.health?.scores?.prompt_drift === "none" ? "无" : result.health?.scores?.prompt_drift}</p>
              </div>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

function HealthMetric({ label, value }) {
  return (
    <div className="rounded-md border border-line bg-paper p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-lg font-semibold text-forest">{value ?? "--"}/100</p>
      </div>
      <div className="mt-2 h-2 rounded-full bg-white">
        <div className="h-2 rounded-full bg-forest" style={{ width: `${Math.min(value ?? 0, 100)}%` }} />
      </div>
    </div>
  );
}
