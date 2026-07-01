"use client";

import { useEffect, useMemo, useState } from "react";

function badgeClass(status) {
  if (status === "done" || status === "success") return "border-forest bg-emerald-50 text-forest";
  if (status === "running" || status === "rewrite") return "border-amber bg-amber-50 text-amber";
  if (status === "failed") return "border-coral bg-red-50 text-coral";
  return "border-line bg-white text-neutral-500";
}

function stepLabel(step) {
  if (!step) return "Pending";
  if (step.stage === "Done") return "Done";
  if (["Writer", "QA", "Rewrite"].includes(step.stage)) return `${step.stage}(${step.iteration || 1})`;
  return step.stage;
}

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState({ runtime: null, active_run: null, stories: [] });
  const [runId, setRunId] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [count, setCount] = useState("1");
  const [error, setError] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [expandedId, setExpandedId] = useState("");
  const [storyDetail, setStoryDetail] = useState(null);
  const [savingId, setSavingId] = useState("");
  const [metricDrafts, setMetricDrafts] = useState({});

  const activeRun = dashboard.active_run;
  const completedStories = useMemo(
    () => (dashboard.stories || []).filter((story) => story.status === "done"),
    [dashboard.stories],
  );

  useEffect(() => {
    refreshDashboard();
  }, []);

  useEffect(() => {
    if (!runId) return undefined;
    const timer = window.setInterval(() => refreshDashboard(runId), 1200);
    return () => window.clearInterval(timer);
  }, [runId]);

  useEffect(() => {
    const drafts = {};
    for (const story of dashboard.stories || []) {
      drafts[story.id] = {
        read_count: String(story.read_count ?? 0),
        drop_off_users: String(story.drop_off_users ?? 0),
      };
    }
    setMetricDrafts((current) => ({ ...drafts, ...current }));
  }, [dashboard.stories]);

  async function refreshDashboard(targetRunId = runId) {
    const query = targetRunId ? `?run_id=${encodeURIComponent(targetRunId)}` : "";
    const response = await fetch(`/api/dashboard${query}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Dashboard refresh failed");
    setDashboard(payload);
    if (payload.active_run && payload.active_run.status !== "running") {
      setRunId("");
    }
  }

  function validateCount() {
    if (!/^\d+$/.test(count)) return "请输入数字。";
    const value = Number(count);
    if (!Number.isInteger(value) || value < 1 || value > 5) return "故事数量必须是 1 到 5 的正整数。";
    return "";
  }

  async function startToday() {
    const message = validateCount();
    if (message) {
      setError(message);
      return;
    }
    setError("");
    setIsStarting(true);
    try {
      const response = await fetch("/api/start-today", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ count: Number(count) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Workflow failed");
      setDashboard(payload);
      setRunId(payload.active_run?.id || "");
      setShowDialog(false);
    } catch (runError) {
      setError(runError.message);
    } finally {
      setIsStarting(false);
    }
  }

  async function saveMetrics(storyId) {
    setSavingId(storyId);
    setError("");
    try {
      const draft = metricDrafts[storyId] || {};
      const response = await fetch("/api/story-metrics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          story_id: storyId,
          read_count: Number(draft.read_count || 0),
          drop_off_users: Number(draft.drop_off_users || 0),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Metrics update failed");
      await refreshDashboard();
      if (expandedId === storyId) setStoryDetail(payload);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingId("");
    }
  }

  async function toggleStory(storyId) {
    if (expandedId === storyId) {
      setExpandedId("");
      setStoryDetail(null);
      return;
    }
    const response = await fetch(`/api/story?story_id=${encodeURIComponent(storyId)}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || "Story detail failed");
      return;
    }
    setExpandedId(storyId);
    setStoryDetail(payload);
  }

  return (
    <main className="min-h-screen bg-paper px-5 py-6 text-ink md:px-8">
      <section className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-4 border-b border-line pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase text-forest">Story Production Console</p>
            <h1 className="mt-1 text-3xl font-semibold">Story Forge</h1>
          </div>
          <button
            type="button"
            onClick={() => setShowDialog(true)}
            className="inline-flex h-11 items-center justify-center rounded-md bg-ink px-5 text-sm font-semibold text-white transition hover:bg-neutral-700"
          >
            开始今天的创作
          </button>
        </header>

        {error ? <div className="rounded-md border border-coral bg-red-50 px-4 py-3 text-sm text-coral">{error}</div> : null}

        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-md border border-line bg-white p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-neutral-500">当前运行</p>
                <h2 className="mt-1 text-xl font-semibold">{activeRun ? activeRun.status : "idle"}</h2>
              </div>
              {activeRun ? <span className="break-all text-xs text-neutral-500">{activeRun.id}</span> : null}
            </div>
            <div className="mt-4 grid gap-2">
              {(activeRun?.stories || []).length ? (
                activeRun.stories.map((story, index) => <StoryProgress key={`${story.id || index}`} story={story} index={index} />)
              ) : (
                <p className="rounded-md border border-line bg-paper px-3 py-6 text-center text-sm text-neutral-500">
                  暂无运行中的故事
                </p>
              )}
            </div>
          </div>

          <div className="rounded-md border border-line bg-white p-4">
            <p className="text-sm text-neutral-500">本地存储</p>
            <div className="mt-4">
              <RuntimeStatus runtime={dashboard.runtime} />
            </div>
            <dl className="mt-3 grid gap-3">
              <Metric label="已完成故事" value={completedStories.length} />
              <Metric label="SQLite" value="story_forge.sqlite" />
              <Metric label="状态源" value="progress + DB" />
            </dl>
          </div>
        </section>

        <section className="rounded-md border border-line bg-white p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-neutral-500">已完成故事</p>
              <h2 className="mt-1 text-xl font-semibold">时间轴</h2>
            </div>
          </div>
          <div className="mt-4 grid gap-3">
            {completedStories.length ? (
              completedStories.map((story) => (
                <article key={story.id} className="rounded-md border border-line bg-paper p-4">
                  <div className="grid gap-4 lg:grid-cols-[1fr_220px_220px_auto] lg:items-start">
                    <button type="button" onClick={() => toggleStory(story.id)} className="text-left">
                      <p className="text-base font-semibold">✔ {story.title || story.id}</p>
                      <p className="mt-1 text-xs text-neutral-500">{formatDate(story.created_at)}</p>
                      <p className="mt-2 text-sm text-neutral-700">{story.summary}</p>
                    </button>
                    <MetricInput
                      label="read_count"
                      value={metricDrafts[story.id]?.read_count ?? "0"}
                      onChange={(value) => setMetricDrafts((current) => ({ ...current, [story.id]: { ...current[story.id], read_count: value } }))}
                    />
                    <MetricInput
                      label="drop_off_users"
                      value={metricDrafts[story.id]?.drop_off_users ?? "0"}
                      onChange={(value) =>
                        setMetricDrafts((current) => ({ ...current, [story.id]: { ...current[story.id], drop_off_users: value } }))
                      }
                    />
                    <button
                      type="button"
                      onClick={() => saveMetrics(story.id)}
                      disabled={savingId === story.id}
                      className="h-10 rounded-md border border-ink px-4 text-sm font-semibold disabled:opacity-50"
                    >
                      {savingId === story.id ? "保存中" : "保存"}
                    </button>
                  </div>
                  {expandedId === story.id && storyDetail ? (
                    <div className="mt-4 grid gap-3 border-t border-line pt-4 lg:grid-cols-[1fr_280px]">
                      <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-white p-3 text-sm">{storyDetail.final_text || "无正文"}</pre>
                      <div className="rounded-md bg-white p-3 text-sm">
                        <p className="font-semibold">流水线历史</p>
                        <div className="mt-2 grid gap-2">
                          {(storyDetail.pipeline_logs || []).map((log, index) => (
                            <div key={`${log.stage}-${index}`} className="flex items-center justify-between rounded border border-line px-2 py-1">
                              <span>{stepLabel({ stage: log.stage === "qa" ? "QA" : titleCase(log.stage), iteration: log.iteration })}</span>
                              <span className="text-neutral-500">{log.status}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </article>
              ))
            ) : (
              <p className="rounded-md border border-line bg-paper px-3 py-6 text-center text-sm text-neutral-500">
                还没有完成故事
              </p>
            )}
          </div>
        </section>
      </section>

      {showDialog ? (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-sm rounded-md bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold">开始今天的创作</h2>
            <label className="mt-4 block text-sm font-medium" htmlFor="story-count">
              本次生成故事数量
            </label>
            <input
              id="story-count"
              value={count}
              onChange={(event) => setCount(event.target.value)}
              inputMode="numeric"
              className="mt-2 h-10 w-full rounded-md border border-line px-3"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowDialog(false)} className="h-10 rounded-md border border-line px-4 text-sm">
                取消
              </button>
              <button
                type="button"
                onClick={startToday}
                disabled={isStarting}
                className="h-10 rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {isStarting ? "启动中" : "确认"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function StoryProgress({ story, index }) {
  const steps = story.pipeline_steps || [];
  return (
    <div className="grid gap-3 rounded-md border border-line bg-paper p-3 lg:grid-cols-[150px_120px_1fr_100px] lg:items-center">
      <p className="font-semibold">Story #{story.story_index || index + 1}</p>
      <span className={`inline-flex w-fit rounded-full border px-2 py-1 text-xs font-semibold ${badgeClass(story.status)}`}>
        {story.current_stage || story.status}
      </span>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {steps.length ? steps.map((step, stepIndex) => (
          <span key={`${step.stage}-${step.iteration}-${stepIndex}`} className="inline-flex items-center gap-2">
            <span className={`rounded border px-2 py-1 ${badgeClass(step.status)}`}>{stepLabel(step)}</span>
            {stepIndex < steps.length - 1 ? <span className="text-neutral-400">→</span> : null}
          </span>
        )) : <span className="text-neutral-500">Pending</span>}
      </div>
      <p className="text-sm text-neutral-500">{story.status}</p>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-md border border-line bg-paper p-3">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="mt-1 break-all text-sm font-semibold">{value}</dd>
    </div>
  );
}

function RuntimeStatus({ runtime }) {
  const mode = runtime?.mode || "mock";
  const modeText = mode === "api" ? "API 模式" : mode === "missing_key" ? "缺少密钥" : "Mock 模式";
  const statusClass = mode === "api"
    ? "border-forest bg-emerald-50 text-forest"
    : mode === "missing_key"
      ? "border-coral bg-red-50 text-coral"
      : "border-amber bg-amber-50 text-amber";

  return (
    <div className={`rounded-md border p-3 ${statusClass}`}>
      <p className="text-xs font-semibold">当前运行模式</p>
      <p className="mt-1 text-lg font-semibold">{modeText}</p>
      <p className="mt-1 text-xs">Provider: {runtime?.provider || "mock"}</p>
      <p className="text-xs">Model: {runtime?.model || "mock-model"}</p>
      {runtime?.key_env ? (
        <p className="text-xs">{runtime.has_api_key ? `${runtime.key_env} 已检测到` : `未检测到 ${runtime.key_env}`}</p>
      ) : null}
    </div>
  );
}

function MetricInput({ label, value, onChange }) {
  return (
    <label className="block text-xs font-medium text-neutral-600">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="numeric"
        className="mt-1 h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink"
      />
    </label>
  );
}

function titleCase(value) {
  const text = String(value || "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
