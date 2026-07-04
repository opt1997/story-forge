"use client";

import { useEffect, useMemo, useState } from "react";

function badgeTone(status) {
  if (["done", "success", "passed", "pass", "ready", "approved"].includes(status)) return "success";
  if (["running", "rewrite", "pending", "queued", "waiting"].includes(status)) return "running";
  if (["failed", "error", "missing", "needs_human_review", "cancelled"].includes(status)) return "failed";
  return "info";
}

function statusLabel(status) {
  const labels = {
    done: "完成",
    success: "完成",
    passed: "完成",
    running: "运行中",
    rewrite: "返工",
    failed: "失败",
    pending: "待开始",
    queued: "排队中",
    needs_human_review: "待人工复核",
    cancelled: "已取消",
    idle: "空闲",
  };
  return labels[status] || status || "空闲";
}

function taskStatusLabel(task) {
  const status = String(task?.current_status || "").toLowerCase();
  const stage = String(task?.current_stage || "").toLowerCase();
  if (status === "failed") return "失败";
  if (status === "done") return "已完成";
  if (status === "cancelled") return "已取消";
  if (status === "pending" || status === "queued") return "等待中";
  if (["idea", "outline"].includes(stage)) return "构思中";
  if (stage === "writer") return "写作中";
  if (stage === "qa") return "质量评审中";
  if (stage === "rewrite") return "返工打磨中";
  if (stage === "final") return "收尾中";
  return statusLabel(status);
}

function displayStage(value) {
  const stage = String(value || "pending").toLowerCase();
  const labels = {
    pending: "等待中",
    idea: "Idea",
    outline: "Outline",
    writer: "Writer",
    qa: "QA",
    rewrite: "Rewrite",
    final: "Final",
    done: "Done",
  };
  return labels[stage] || value || "Pending";
}

function stageLabel(step) {
  if (!step) return "Pending";
  const stage = step.stage || "Pending";
  if (["Writer", "QA", "Rewrite"].includes(stage)) return `${stage}(${step.iteration || 1})`;
  return stage;
}

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function compactDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function summarizeText(value, length = 88) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

function storyTitle(story, fallback = "未命名故事") {
  return story?.title || story?.story_id || story?.id || fallback;
}

function currentRound(task) {
  const steps = task?.pipeline_steps || [];
  const latest = steps[steps.length - 1];
  if (!latest || !["Writer", "QA", "Rewrite"].includes(latest.stage)) return "--";
  return `${latest.stage}(${latest.iteration || 1})`;
}

function roundCount(task, stageName) {
  const target = String(stageName || "").toLowerCase();
  const values = (task?.pipeline_steps || [])
    .filter((step) => String(step.stage || "").toLowerCase() === target)
    .map((step) => Number(step.iteration || 1))
    .filter(Number.isFinite);
  return values.length ? Math.max(...values) : 0;
}

function pipelineText(task) {
  const steps = task?.pipeline_steps || [];
  if (!steps.length) return "Pending";
  return steps.map(stageLabel).join(" → ");
}

function logsFromStory(story) {
  if (story?.pipeline_logs?.length) return story.pipeline_logs;
  if (story?.pipeline_steps?.length) return story.pipeline_steps;
  return [];
}

function qaScore(story) {
  const score = story?.meta?.qa_score ?? story?.qa_score ?? story?.meta?.final_score ?? story?.final_score ?? story?.meta?.qa?.final_score;
  const value = Number(score);
  return Number.isFinite(value) ? value : null;
}

function rewriteCount(story) {
  const value = Number(story?.meta?.rewrite_count ?? story?.rewrite_count ?? story?.meta?.rewrite_round ?? story?.rewrite_round ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function buildOverview(stories, tasks, libraryTotal) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    completedStories: stories.filter((story) => story.status === "done" && String(story.created_at || "").startsWith(today)).length,
    runningTasks: tasks.filter((task) => ["running", "rewrite", "pending", "queued"].includes(task.current_status)).length,
    libraryTotal,
    latestStory: stories[0] || null,
    latestTask: tasks[0] || null,
  };
}

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState({ runtime: null, stories: [] });
  const [library, setLibrary] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 1, items: [] });
  const [libraryPage, setLibraryPage] = useState(1);
  const [topics, setTopics] = useState([]);
  const [topicSource, setTopicSource] = useState("mock");
  const [topicCount, setTopicCount] = useState(0);
  const [tasks, setTasks] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [count, setCount] = useState("1");
  const [error, setError] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [isRefreshingTopics, setIsRefreshingTopics] = useState(false);
  const [startingTopicId, setStartingTopicId] = useState("");
  const [deletingTaskId, setDeletingTaskId] = useState("");
  const [isClearingTasks, setIsClearingTasks] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState({ type: "overview", id: "" });
  const [activeSection, setActiveSection] = useState(0);
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [storyDetail, setStoryDetail] = useState(null);
  const [savingId, setSavingId] = useState("");
  const [openingFolderId, setOpeningFolderId] = useState("");
  const [metricDrafts, setMetricDrafts] = useState({});

  const stories = library.items || [];
  const selectedTask = useMemo(
    () => selectedDetail.type === "task" ? tasks.find((task) => task.task_id === selectedDetail.id) : null,
    [tasks, selectedDetail],
  );
  const selectedStoryId = selectedDetail.type === "story"
    ? selectedDetail.id
    : selectedDetail.type === "task"
      ? selectedTask?.story_id || ""
      : "";
  const selectedStory = useMemo(() => {
    const fromLibrary = stories.find((story) => story.id === selectedStoryId);
    return {
      ...(fromLibrary || {}),
      ...(storyDetail || {}),
    };
  }, [stories, selectedStoryId, storyDetail]);
  const overview = useMemo(() => buildOverview(stories, tasks, library.total || 0), [stories, tasks, library.total]);

  useEffect(() => {
    refreshAll().catch((refreshError) => setError(refreshError.message));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      refreshAll({ quiet: true, page: libraryPage }).catch((refreshError) => setError(refreshError.message));
    }, 1800);
    return () => window.clearInterval(timer);
  }, [libraryPage]);

  useEffect(() => {
    const drafts = {};
    for (const story of stories) {
      drafts[story.id] = {
        read_count: String(story.read_count ?? 0),
        drop_off_users: String(story.drop_off_users ?? 0),
      };
    }
    setMetricDrafts((current) => ({ ...drafts, ...current }));
  }, [stories]);

  useEffect(() => {
    if (selectedTopicId || !topics[0]?.id) return;
    setSelectedTopicId(topics[0].id);
  }, [topics, selectedTopicId]);

  useEffect(() => {
    if (!selectedStoryId) {
      setStoryDetail(null);
      return;
    }
    let isMounted = true;
    fetch(`/api/story?story_id=${encodeURIComponent(selectedStoryId)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Story detail failed");
        if (isMounted) setStoryDetail(payload);
      })
      .catch(() => {
        if (isMounted) setStoryDetail(null);
      });
    return () => {
      isMounted = false;
    };
  }, [selectedStoryId]);

  async function refreshAll(options = {}) {
    const nextPage = options.page || libraryPage;
    const [dashboardPayload, topicsPayload, tasksPayload, libraryPayload] = await Promise.all([
      fetchJson("/api/dashboard"),
      fetchJson("/api/topics/today?limit=5"),
      fetchJson("/api/stories/tasks?limit=5"),
      fetchJson(`/api/library/stories?page=${encodeURIComponent(nextPage)}&pageSize=10`),
    ]);
    setDashboard(dashboardPayload);
    setTopics(topicsPayload.topics || []);
    setTopicSource(topicsPayload.source || "mock");
    setTopicCount(topicsPayload.generated_count || (topicsPayload.topics || []).length);
    setTasks(tasksPayload.tasks || []);
    setLibrary(libraryPayload);
    if (!options.quiet) setError("");
  }

  async function goLibraryPage(nextPage) {
    const safePage = Math.max(1, Math.min(nextPage, library.totalPages || 1));
    setLibraryPage(safePage);
    await refreshAll({ quiet: true, page: safePage });
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
      const payload = await postJson("/api/stories/start-today", { count: Number(count) });
      await refreshAll({ quiet: true });
      const firstStory = payload.active_run?.stories?.find((story) => story.id);
      const firstTask = payload.active_run?.stories?.[0];
      const taskId = firstStory?.task_id || (firstTask ? `${payload.active_run.id}:${firstTask.story_index}` : "");
      setSelectedDetail(taskId ? { type: "task", id: taskId } : { type: "overview", id: "" });
      setShowDialog(false);
    } catch (runError) {
      setError(runError.message);
    } finally {
      setIsStarting(false);
    }
  }

  async function startFromTopic(topic) {
    if (!topic?.id) return;
    setError("");
    setSelectedTopicId(topic.id);
    setStartingTopicId(topic.id);
    try {
      const payload = await postJson("/api/stories/start-from-topic", {
        topic_id: topic.id,
        topic_title: topic.title,
      });
      await refreshAll({ quiet: true });
      const firstStory = payload.active_run?.stories?.find((story) => story.id);
      const firstTask = payload.active_run?.stories?.[0];
      const taskId = firstStory?.task_id || (firstTask ? `${payload.active_run.id}:${firstTask.story_index}` : "");
      setSelectedDetail(taskId ? { type: "task", id: taskId } : { type: "overview", id: "" });
    } catch (runError) {
      setError(runError.message);
    } finally {
      setStartingTopicId("");
    }
  }

  async function refreshTopics() {
    setError("");
    setIsRefreshingTopics(true);
    try {
      const payload = await postJson("/api/topics/refresh", { limit: 5 });
      setTopics(payload.topics || []);
      setTopicSource(payload.source || "mock");
      setTopicCount(payload.generated_count || 0);
      setSelectedTopicId(payload.topics?.[0]?.id || "");
    } catch (refreshError) {
      setError(refreshError.message);
    } finally {
      setIsRefreshingTopics(false);
    }
  }

  async function cancelTask(taskId) {
    if (!taskId) return;
    setError("");
    setDeletingTaskId(taskId);
    try {
      await postJson(`/api/stories/tasks/${encodeURIComponent(taskId)}/cancel`, {});
      await refreshAll({ quiet: true });
      if (selectedDetail.type === "task" && selectedDetail.id === taskId) setSelectedDetail({ type: "overview", id: "" });
    } catch (cancelError) {
      setError(cancelError.message);
    } finally {
      setDeletingTaskId("");
    }
  }

  async function clearTasks() {
    setError("");
    setIsClearingTasks(true);
    try {
      await postJson("/api/tasks/clear", {});
      setTasks([]);
      await refreshAll({ quiet: true });
      setSelectedDetail({ type: "overview", id: "" });
    } catch (clearError) {
      setError(clearError.message);
    } finally {
      setIsClearingTasks(false);
    }
  }

  async function saveMetrics(storyId) {
    setSavingId(storyId);
    setError("");
    try {
      const draft = metricDrafts[storyId] || {};
      const payload = await postJson(`/api/library/stories/${encodeURIComponent(storyId)}/metrics`, {
        read_count: Number(draft.read_count || 0),
        drop_off_users: Number(draft.drop_off_users || 0),
      });
      await refreshAll({ quiet: true, page: library.page || libraryPage });
      if (selectedStoryId === storyId) setStoryDetail(payload);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingId("");
    }
  }

  async function openFolder(storyId = "") {
    const targetId = storyId || "library";
    setOpeningFolderId(targetId);
    setError("");
    try {
      await postJson("/api/folders/open", storyId ? { story_id: storyId } : { scope: "library" });
    } catch (folderError) {
      setError(folderError.message);
    } finally {
      setOpeningFolderId("");
    }
  }

  function handleNavClick(event, index) {
    event.preventDefault();
    setActiveSection(index);
    if (index === 0) setSelectedDetail({ type: "overview", id: "" });
    document.getElementById(`section-${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="dashboard-shell">
      <aside className="sidebar-shell" aria-label="Story Forge navigation">
        <div className="brand-lockup">
          <div className="brand-mark">SF</div>
          <div className="brand-copy">
            <strong>Story Forge</strong>
            <span>创作运营台</span>
          </div>
        </div>
        <nav className="side-nav">
          {["开始创作", "推荐主题", "任务队列", "作品库"].map((item, index) => (
            <a
              key={item}
              className={activeSection === index ? "side-nav-item active" : "side-nav-item"}
              href={`#section-${index}`}
              onClick={(event) => handleNavClick(event, index)}
            >
              <span className="nav-icon">{item.slice(0, 1)}</span>
              <span>{item}</span>
            </a>
          ))}
        </nav>
        <RuntimeCard runtime={dashboard.runtime} />
      </aside>

      <section className="app-frame" id="section-0">
        <header className="command-bar">
          <div className="command-title">
            <span className="eyebrow">Story Production Console</span>
            <h1>故事工坊</h1>
          </div>
          <div className="command-actions">
            <button className="button primary" type="button" onClick={() => setShowDialog(true)}>
              开始创作
            </button>
          </div>
        </header>

        {error ? <div className="error-banner" role="alert">{error}</div> : null}

        <div className="workbench-grid">
          <div className="main-column">
            <TopicPanel
              topics={topics}
              source={topicSource}
              onGenerate={startFromTopic}
              onRefresh={refreshTopics}
              onSelect={setSelectedTopicId}
              selectedTopicId={selectedTopicId}
              startingTopicId={startingTopicId}
              isRefreshing={isRefreshingTopics}
            />
            <TaskQueuePanel
              tasks={tasks}
              onSelect={(task) => setSelectedDetail({ type: "task", id: task.task_id })}
              onCancel={cancelTask}
              onClear={clearTasks}
              selectedId={selectedDetail.type === "task" ? selectedDetail.id : ""}
              deletingTaskId={deletingTaskId}
              isClearing={isClearingTasks}
            />
            <LibraryPanel
              stories={stories}
              library={library}
              selectedId={selectedDetail.type === "story" ? selectedDetail.id : ""}
              metricDrafts={metricDrafts}
              savingId={savingId}
              openingFolderId={openingFolderId}
              onSelect={(storyId) => setSelectedDetail({ type: "story", id: storyId })}
              onSave={saveMetrics}
              onOpenFolder={openFolder}
              onMetricChange={(storyId, key, value) =>
                setMetricDrafts((current) => ({ ...current, [storyId]: { ...current[storyId], [key]: value } }))
              }
              onPrevPage={() => goLibraryPage((library.page || 1) - 1)}
              onNextPage={() => goLibraryPage((library.page || 1) + 1)}
            />
          </div>
          <SidebarPanel
            mode={selectedDetail.type}
            overview={overview}
            selectedStory={selectedDetail.type === "story" ? selectedStory : null}
            selectedTask={selectedTask}
            taskStory={selectedDetail.type === "task" ? selectedStory : null}
          />
        </div>
      </section>

      {showDialog ? (
        <StartDialog
          count={count}
          runtime={dashboard.runtime}
          isStarting={isStarting}
          onCountChange={setCount}
          onClose={() => setShowDialog(false)}
          onStart={startToday}
        />
      ) : null}
    </main>
  );
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `${url} failed`);
  return payload;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `${url} failed`);
  return payload;
}

function TopicPanel({ topics, source, onGenerate, onRefresh, onSelect, selectedTopicId, startingTopicId, isRefreshing }) {
  return (
    <section className="panel" id="section-1">
      <PanelHeader
        title="今日推荐主题"
        note={`后端保留 30 个候选，前端展示 Top 5 / ${source || "mock"}`}
        action={(
          <button className="button secondary small" type="button" onClick={onRefresh} disabled={isRefreshing}>
            {isRefreshing ? "刷新中" : "刷新主题"}
          </button>
        )}
      />
      <div className="topic-list">
        {topics.length ? (
          topics.slice(0, 5).map((topic) => (
            <article className={selectedTopicId === topic.id ? "topic-row selected" : "topic-row"} key={topic.id} onClick={() => onSelect(topic.id)}>
              <div className="topic-title-line">
                <strong>{topic.title}</strong>
                <span>{topic.genre || "题材"}</span>
              </div>
              <div className="topic-meta">
                {(topic.tags || []).slice(0, 3).map((tag) => <span className="tag" key={tag}>{tag}</span>)}
              </div>
              <div className="topic-score">
                <span>热度</span>
                <strong>{topic.heat_score ?? "--"}</strong>
              </div>
              <button className="button secondary small" type="button" onClick={(event) => { event.stopPropagation(); onGenerate(topic); }} disabled={startingTopicId === topic.id}>
                {startingTopicId === topic.id ? "创建中" : "用此主题生成"}
              </button>
            </article>
          ))
        ) : (
          <EmptyPanelText title="正在准备今日推荐主题" body="页面打开后会自动补齐 30 个候选主题，并展示前 5 个。" />
        )}
      </div>
    </section>
  );
}

function TaskQueuePanel({ tasks, onSelect, onCancel, onClear, selectedId, deletingTaskId, isClearing }) {
  return (
    <section className="panel" id="section-2">
      <PanelHeader
        title="任务队列"
        note="仅显示最新 5 条任务，新任务在最上方"
        action={(
          <button className="button secondary small" type="button" onClick={onClear} disabled={isClearing || !tasks.length}>
            {isClearing ? "清空中" : "一键清空"}
          </button>
        )}
      />
      <div className="task-list">
        {tasks.length ? (
          tasks.map((task) => (
            <article key={task.task_id} className={selectedId === task.task_id ? "task-row selected" : "task-row"}>
              <button type="button" className="task-select" onClick={() => onSelect(task)}>
                <span className="row-main">
                  <strong>{storyTitle(task, "生成任务")}</strong>
                  <small>{task.task_id}</small>
                </span>
                <span className="task-meta-compact">
                  <span>创建时间</span>
                  <strong>{formatDate(task.created_at)}</strong>
                </span>
                <StatusBadge status={task.current_status} label={taskStatusLabel(task)} />
              </button>
              <div className="task-actions">
                <button type="button" className="button small danger" onClick={() => onCancel(task.task_id)} disabled={deletingTaskId === task.task_id}>
                  {deletingTaskId === task.task_id ? "删除中" : "删除"}
                </button>
              </div>
            </article>
          ))
        ) : (
          <EmptyPanelText title="暂无任务" body="点击“开始创作”或“用此主题生成”后，任务会立即出现在这里。" />
        )}
      </div>
    </section>
  );
}

function LibraryPanel({ stories, library, selectedId, metricDrafts, savingId, openingFolderId, onSelect, onSave, onOpenFolder, onMetricChange, onPrevPage, onNextPage }) {
  return (
    <section className="panel" id="section-3">
      <PanelHeader
        title="作品库"
        note={`仅显示已完成并生成 final.md 的文章 / 共 ${library.total || 0} 篇`}
        action={(
          <button type="button" className="button secondary small" onClick={() => onOpenFolder()} disabled={openingFolderId === "library"}>
            {openingFolderId === "library" ? "打开中" : "打开文件夹"}
          </button>
        )}
      />
      <div className="rows library-rows">
        {stories.length ? (
          stories.map((story) => (
            <article key={story.id} className={selectedId === story.id ? "library-row selected" : "library-row"}>
              <button type="button" className="library-title" onClick={() => onSelect(story.id)}>
                <span className="library-heading">
                  <strong>{storyTitle(story)}</strong>
                  <span className="library-id">{story.id}</span>
                </span>
                <small>{compactDate(story.created_at)} / {summarizeText(story.summary, 48) || "暂无摘要"}</small>
                {story.tags?.length ? (
                  <span className="library-tags">
                    {story.tags.slice(0, 4).map((tag) => <i key={tag}>{tag}</i>)}
                  </span>
                ) : null}
              </button>
              <MetricInput label="read" value={metricDrafts[story.id]?.read_count ?? "0"} onChange={(value) => onMetricChange(story.id, "read_count", value)} />
              <MetricInput label="drop" value={metricDrafts[story.id]?.drop_off_users ?? "0"} onChange={(value) => onMetricChange(story.id, "drop_off_users", value)} />
              <button type="button" className="button small secondary" onClick={() => onSave(story.id)} disabled={savingId === story.id}>
                {savingId === story.id ? "保存中" : "保存"}
              </button>
              <button type="button" className="button small secondary" onClick={() => onOpenFolder(story.id)} disabled={openingFolderId === story.id}>
                {openingFolderId === story.id ? "打开中" : "打开"}
              </button>
            </article>
          ))
        ) : (
          <EmptyPanelText title="还没有作品库记录" body="只有包含 story.meta.json 且有 final.md 的本地故事文件夹会显示在这里。" />
        )}
      </div>
      <div className="pagination-bar">
        <button className="button secondary small" type="button" onClick={onPrevPage} disabled={(library.page || 1) <= 1}>
          上一页
        </button>
        <span>第 {library.page || 1} / {library.totalPages || 1} 页</span>
        <button className="button secondary small" type="button" onClick={onNextPage} disabled={(library.page || 1) >= (library.totalPages || 1)}>
          下一页
        </button>
      </div>
    </section>
  );
}

function SidebarPanel({ mode, overview, selectedStory, selectedTask, taskStory }) {
  if (mode === "story" && selectedStory?.id) {
    return <StoryDetailPanel story={selectedStory} />;
  }
  if (mode === "task" && selectedTask?.task_id) {
    return <TaskDetailPanel task={selectedTask} story={taskStory} />;
  }
  return <OverviewPanel overview={overview} />;
}

function OverviewPanel({ overview }) {
  return (
    <aside className="overview-panel" aria-label="今日创作概览">
      <div className="overview-head">
        <span className="eyebrow">Today Overview</span>
        <h2>今日创作概览</h2>
      </div>
      <div className="overview-metrics">
        <MiniStat label="今日完成" value={overview.completedStories} />
        <MiniStat label="任务队列" value={overview.runningTasks} />
        <MiniStat label="作品库总数" value={overview.libraryTotal || 0} />
      </div>

      <section className="overview-section">
        <h3>最新完成作品</h3>
        {overview.latestStory ? (
          <div className="overview-card">
            <strong>{storyTitle(overview.latestStory)}</strong>
            <p>{summarizeText(overview.latestStory.summary, 96)}</p>
            <div className="topic-meta">
              <StatusBadge status={overview.latestStory.status} label={statusLabel(overview.latestStory.status)} />
              <span>{compactDate(overview.latestStory.created_at)}</span>
            </div>
          </div>
        ) : (
          <p className="detail-empty-text">暂无完成作品。</p>
        )}
      </section>

      <section className="overview-section">
        <h3>最新任务</h3>
        {overview.latestTask ? (
          <div className="overview-card">
            <strong>{storyTitle(overview.latestTask, "生成任务")}</strong>
            <p>{overview.latestTask.story_id || overview.latestTask.task_id}</p>
            <StatusBadge status={overview.latestTask.current_status} label={taskStatusLabel(overview.latestTask)} />
          </div>
        ) : (
          <p className="detail-empty-text">暂无生成任务。</p>
        )}
      </section>
    </aside>
  );
}

function StoryDetailPanel({ story }) {
  const logs = logsFromStory(story);
  return (
    <aside className="overview-panel" aria-label="作品详情">
      <div className="overview-head">
        <span className="eyebrow">Story Detail</span>
        <h2>作品详情</h2>
      </div>
      <section className="overview-card">
        <strong>{storyTitle(story)}</strong>
        <p>{formatDate(story.created_at)}</p>
        <p>{story.summary || story.meta?.summary || "暂无摘要。"}</p>
        {story.tags?.length ? (
          <div className="library-tags">
            {story.tags.slice(0, 6).map((tag) => <i key={tag}>{tag}</i>)}
          </div>
        ) : null}
      </section>
      <div className="detail-stats">
        <MiniStat label="QA 分数" value={qaScore(story) ?? "暂无"} />
        <MiniStat label="返工次数" value={rewriteCount(story) || "暂无"} />
        <MiniStat label="日志数" value={logs.length || "暂无"} />
        <MiniStat label="阅读量" value={story.read_count ?? 0} />
        <MiniStat label="触底人数" value={story.drop_off_users ?? 0} />
        <MiniStat label="文章状态" value={statusLabel(story.status)} />
      </div>
      <section className="overview-section">
        <h3>正文预览</h3>
        <pre className="final-preview">{story?.final_text ? summarizeText(story.final_text, 900) : "final.md 暂不可读取。"}</pre>
      </section>
    </aside>
  );
}

function TaskDetailPanel({ task, story }) {
  const logs = task.pipeline_steps || [];
  const files = task.files?.length ? task.files : story?.files || [];
  return (
    <aside className="overview-panel" aria-label="任务详情">
      <div className="overview-head">
        <span className="eyebrow">Task Detail</span>
        <h2>任务详情</h2>
      </div>
      <section className="overview-card">
        <strong>{storyTitle(task, "生成任务")}</strong>
        <p>task_id：{task.task_id}</p>
        <p>story_id：{task.story_id || "暂无"}</p>
      </section>
      <div className="detail-stats">
        <MiniStat label="当前阶段" value={displayStage(task.current_stage)} />
        <MiniStat label="当前状态" value={taskStatusLabel(task)} />
        <MiniStat label="创建时间" value={formatDate(task.created_at)} />
        <MiniStat label="更新时间" value={formatDate(task.updated_at)} />
        <MiniStat label="当前轮次" value={currentRound(task)} />
        <MiniStat label="writer_round" value={roundCount(task, "Writer")} />
        <MiniStat label="qa_round" value={roundCount(task, "QA")} />
        <MiniStat label="rewrite_round" value={roundCount(task, "Rewrite")} />
      </div>
      <section className="overview-section">
        <h3>完整 pipeline 流程</h3>
        <p className="flow-line">{pipelineText(task)}</p>
      </section>
      <section className="overview-section">
        <h3>pipeline logs</h3>
        <div className="log-list">
          {logs.length ? logs.map((log, index) => (
            <div className="log-item" key={`${log.stage}-${log.iteration}-${index}`}>
              <span>{stageLabel(log)}</span>
              <strong>{statusLabel(log.status)}</strong>
            </div>
          )) : <p className="detail-empty-text">暂无日志。</p>}
        </div>
      </section>
      <section className="overview-section">
        <h3>已生成文件状态</h3>
        <div className="file-list">
          {files.length ? files.map((file) => (
            <div className="file-item" key={file.path || file.label}>
              <span>{file.label}</span>
              <strong>{file.exists ? "ready" : "missing"}</strong>
            </div>
          )) : <p className="detail-empty-text">暂无文件状态。</p>}
        </div>
      </section>
    </aside>
  );
}

function StartDialog({ count, runtime, isStarting, onCountChange, onClose, onStart }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="start-dialog" role="dialog" aria-modal="true" aria-labelledby="start-dialog-title">
        <h2 id="start-dialog-title">开始创作</h2>
        <p>默认创建 1 个生成任务，最多 5 个。任务会立即进入任务队列。</p>
        <label className="field-block">
          <span>本次生成故事数量</span>
          <div className="segmented-control" role="group" aria-label="本次生成故事数量">
            {[1, 2, 3, 4, 5].map((value) => (
              <button key={value} type="button" className={String(value) === String(count) ? "segment active" : "segment"} onClick={() => onCountChange(String(value))}>
                {value}
              </button>
            ))}
          </div>
        </label>
        <div className="field-block">
          <span>运行模式</span>
          <div className="mode-chip">
            <span>Provider</span>
            <strong>{runtime?.provider || "mock"} / {runtime?.mode || "mock"}</strong>
          </div>
        </div>
        <div className="dialog-actions">
          <button className="button secondary" type="button" onClick={onClose}>取消</button>
          <button className="button primary" type="button" onClick={onStart} disabled={isStarting}>
            {isStarting ? "启动中" : "确认开始"}
          </button>
        </div>
      </section>
    </div>
  );
}

function RuntimeCard({ runtime }) {
  const mode = runtime?.mode || "mock";
  const label = mode === "api" ? "API Mode" : mode === "missing_key" ? "Missing Key" : "Mock Mode";
  return (
    <div className="sidebar-footer">
      <span>Provider: {runtime?.provider || "mock"}</span>
      <span>Mode: {label}</span>
      <span>SQLite: story_forge.sqlite</span>
      {runtime?.key_env ? <span>{runtime.has_api_key ? `${runtime.key_env} 已检测到` : `未检测到 ${runtime.key_env}`}</span> : null}
    </div>
  );
}

function PanelHeader({ title, note, action }) {
  return (
    <div className="panel-head">
      <div>
        <h2>{title}</h2>
        <span>{note}</span>
      </div>
      {action}
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="mini-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MetricInput({ label, value, onChange }) {
  return (
    <label className="metric-input">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} inputMode="numeric" />
    </label>
  );
}

function StatusBadge({ status, label }) {
  return <span className={`status-badge ${badgeTone(status)}`}>{label}</span>;
}

function EmptyPanelText({ title, body }) {
  return (
    <div className="empty-panel-text">
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}
