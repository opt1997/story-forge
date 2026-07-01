from __future__ import annotations

import argparse
import json
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any


TZ = timezone(timedelta(hours=8))
PASS_THRESHOLD = 90
MOCK_MODEL = "mock-agent-v1"
AGENT_VERSION = "m2.1-mock"


class WorkflowError(RuntimeError):
    pass


@dataclass
class StageResult:
    stage: str
    agent_name: str
    artifact_path: Path
    status: str
    prompt_path: str | None = None
    prompt_version: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    duration_seconds: float = 0.0
    cost_usd: float = 0.0
    notes: str = "M2.1 mock workflow; no AI API called"


def now_iso() -> str:
    return datetime.now(TZ).replace(microsecond=0).isoformat()


def today_date() -> str:
    return datetime.now(TZ).strftime("%Y%m%d")


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def rel(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def unique_slug(root: Path, date: str, base_slug: str) -> str:
    stories_day = root / "stories" / date
    base_path = stories_day / base_slug
    if not base_path.exists() or not any(base_path.iterdir()):
        return base_slug

    for index in range(2, 100):
        suffix = f"-{index}"
        candidate = f"{base_slug[:30 - len(suffix)]}{suffix}"
        candidate_path = stories_day / candidate
        if not candidate_path.exists() or not any(candidate_path.iterdir()):
            return candidate
    raise WorkflowError("Unable to allocate a unique mock story slug.")


class Recorder:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.runs_path = root / "metrics" / "runs.jsonl"

    def record(self, story_id: str, result: StageResult) -> dict[str, Any]:
        if not result.artifact_path.exists():
            raise WorkflowError(f"Missing artifact for {result.stage}: {result.artifact_path}")

        row = {
            "story_id": story_id,
            "stage": result.stage,
            "agent_name": result.agent_name,
            "model": MOCK_MODEL,
            "prompt_path": result.prompt_path,
            "prompt_version": result.prompt_version,
            "input_tokens": result.input_tokens,
            "output_tokens": result.output_tokens,
            "duration_seconds": result.duration_seconds,
            "cost_usd": result.cost_usd,
            "timestamp": now_iso(),
            "status": result.status,
            "artifact_path": rel(result.artifact_path, self.root),
            "notes": result.notes,
        }

        self.runs_path.parent.mkdir(parents=True, exist_ok=True)
        with self.runs_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
        return row


class MockAgents:
    def __init__(self, root: Path, story_dir: Path, slug: str, story_id: str) -> None:
        self.root = root
        self.story_dir = story_dir
        self.slug = slug
        self.story_id = story_id

    def idea(self) -> StageResult:
        path = self.story_dir / "idea.json"
        write_json(
            path,
            {
                "title": "M2 工作流冒烟测试",
                "genre": "workflow_mock",
                "one_sentence_hook": "这是用于验证 Story Manager 调度链路的固定 mock idea。",
                "core_conflict": "Workflow 必须证明每个阶段按顺序完成并更新状态。",
                "protagonist": "Mock Story Manager",
                "obstacle_or_antagonist": "尚未运行的 Pipeline",
                "twist_direction": "QA v1 固定未通过，Rewrite 后 QA v2 固定通过。",
                "viral_score": 80,
                "slug": self.slug,
            },
        )
        return StageResult(
            stage="idea",
            agent_name="idea.agent.md",
            artifact_path=path,
            status="pass",
            prompt_path="prompts/style/v1.md",
            prompt_version="v1",
            input_tokens=100,
            output_tokens=80,
            duration_seconds=0.1,
        )

    def outline(self) -> StageResult:
        path = self.story_dir / "outline.json"
        write_json(
            path,
            {
                "target_total_words": 300,
                "chapter_count": 2,
                "chapters": [
                    {
                        "chapter_number": 1,
                        "target_words": 150,
                        "core_event": "Story Manager 调度 Idea、Outline、Writer。",
                        "conflict": "每一步都必须等待上游产物存在。",
                        "ending_hook": "QA 即将返回固定未通过结果。",
                    },
                    {
                        "chapter_number": 2,
                        "target_words": 150,
                        "core_event": "Rewrite 修复后 QA v2 通过。",
                        "conflict": "Manifest 必须和最终产物保持一致。",
                        "ending_hook": "Workflow 生成 final.md。",
                    },
                ],
                "final_ending": "M2.1 Workflow Engine 端到端跑通。",
            },
        )
        return StageResult(
            stage="outline",
            agent_name="outline.agent.md",
            artifact_path=path,
            status="pass",
            input_tokens=120,
            output_tokens=120,
            duration_seconds=0.1,
        )

    def writer(self) -> StageResult:
        path = self.story_dir / "draft_v1.md"
        write_text(
            path,
            "# M2.1 Mock Draft v1\n\n"
            "This is a fixed mock draft used only to verify workflow dispatch.\n\n"
            "It is not a real story and no AI API was called.\n",
        )
        return StageResult(
            stage="writer",
            agent_name="writer.agent.md",
            artifact_path=path,
            status="pass",
            prompt_path="prompts/style/v1.md",
            prompt_version="v1",
            input_tokens=160,
            output_tokens=140,
            duration_seconds=0.1,
        )

    def qa_v1(self) -> StageResult:
        path = self.story_dir / "qa_v1.json"
        write_json(path, self._qa_payload(1, "draft_v1.md", 82, "REWRITE"))
        return StageResult(
            stage="qa",
            agent_name="qa.agent.md",
            artifact_path=path,
            status="rewrite",
            prompt_path="prompts/scoring/v1.md",
            prompt_version="v1",
            input_tokens=180,
            output_tokens=120,
            duration_seconds=0.1,
            notes="M2.1 mock QA v1 returns REWRITE by design",
        )

    def rewrite(self) -> StageResult:
        path = self.story_dir / "draft_v2.md"
        write_text(
            path,
            "# M2.1 Mock Draft v2\n\n"
            "This fixed rewrite artifact exists to verify the rewrite branch.\n\n"
            "It is not a real story and no AI API was called.\n",
        )
        return StageResult(
            stage="rewrite",
            agent_name="rewrite.agent.md",
            artifact_path=path,
            status="pass",
            input_tokens=150,
            output_tokens=130,
            duration_seconds=0.1,
        )

    def qa_v2(self) -> StageResult:
        path = self.story_dir / "qa_v2.json"
        write_json(path, self._qa_payload(2, "draft_v2.md", 92, "PASS"))
        return StageResult(
            stage="qa",
            agent_name="qa.agent.md",
            artifact_path=path,
            status="pass",
            prompt_path="prompts/scoring/v1.md",
            prompt_version="v1",
            input_tokens=180,
            output_tokens=120,
            duration_seconds=0.1,
            notes="M2.1 mock QA v2 returns PASS by design",
        )

    def _qa_payload(self, cycle: int, file_name: str, total: int, status: str) -> dict[str, Any]:
        score = {
            "opening_hook": 18,
            "conflict_strength": 14,
            "pacing": 14,
            "twist": 9,
            "emotional_payoff": 14,
            "ending": 14,
            "character_consistency": max(0, total - 83),
        }
        if total == 82:
            score = {
                "opening_hook": 16,
                "conflict_strength": 13,
                "pacing": 13,
                "twist": 8,
                "emotional_payoff": 12,
                "ending": 12,
                "character_consistency": 8,
            }
        return {
            "story_id": self.story_id,
            "evaluation_cycle": cycle,
            "evaluated_file": file_name,
            "simulation_note": "M2.1 mock QA only. No AI API was called.",
            "judges": [
                {
                    "judge_name": "mock-judge-a",
                    "model": MOCK_MODEL,
                    "scores": score,
                    "deduction_reasons": {
                        "opening_hook": "mock deduction",
                        "conflict_strength": "mock deduction",
                        "pacing": "mock deduction",
                        "twist": "mock deduction",
                        "emotional_payoff": "mock deduction",
                        "ending": "mock deduction",
                        "character_consistency": "mock deduction",
                    },
                },
                {
                    "judge_name": "mock-judge-b",
                    "model": MOCK_MODEL,
                    "scores": score,
                    "deduction_reasons": {
                        "opening_hook": "mock deduction",
                        "conflict_strength": "mock deduction",
                        "pacing": "mock deduction",
                        "twist": "mock deduction",
                        "emotional_payoff": "mock deduction",
                        "ending": "mock deduction",
                        "character_consistency": "mock deduction",
                    },
                },
            ],
            "final_scores": {
                **score,
                "total": total,
            },
            "status": status,
            "rewrite_targets": []
            if status == "PASS"
            else [
                {
                    "dimension": "workflow",
                    "deduction_reason": "M2.1 mock QA v1 intentionally fails.",
                    "required_local_fix": "Dispatch Rewrite Agent and produce draft_v2.md.",
                }
            ],
        }


class StoryManager:
    def __init__(self, root: Path, run_date: str | None = None) -> None:
        self.root = root
        self.date = run_date or today_date()
        self.recorder = Recorder(root)

    def run(self) -> dict[str, Any]:
        selected = self._plan_today()
        slug = unique_slug(self.root, self.date, selected["slug"])
        story_id = f"{self.date}-{slug}"
        story_dir = self.root / "stories" / self.date / slug
        story_dir.mkdir(parents=True, exist_ok=True)

        manifest = self._init_manifest(story_id, slug)
        manifest_path = story_dir / "story_manifest.json"
        self._save_manifest(manifest_path, manifest)

        agents = MockAgents(self.root, story_dir, slug, story_id)

        self._set_status(manifest, manifest_path, "idea_pending")
        idea = self._dispatch(story_id, agents.idea(), manifest, manifest_path)
        idea_payload = read_json(idea.artifact_path)
        manifest["title"] = idea_payload["title"]
        manifest["genre"] = idea_payload["genre"]
        manifest["slug"] = idea_payload["slug"]
        manifest["files"]["idea"] = rel(idea.artifact_path, self.root)
        self._save_manifest(manifest_path, manifest)

        self._set_status(manifest, manifest_path, "outlining")
        outline = self._dispatch(story_id, agents.outline(), manifest, manifest_path)
        manifest["files"]["outline"] = rel(outline.artifact_path, self.root)
        self._save_manifest(manifest_path, manifest)

        self._set_status(manifest, manifest_path, "writing")
        draft_v1 = self._dispatch(story_id, agents.writer(), manifest, manifest_path)
        manifest["current_draft"] = rel(draft_v1.artifact_path, self.root)
        manifest["files"]["draft_v1"] = rel(draft_v1.artifact_path, self.root)
        manifest["rewrite_round"] = 0
        self._save_manifest(manifest_path, manifest)

        self._set_status(manifest, manifest_path, "qa_v1")
        qa_v1 = self._dispatch(story_id, agents.qa_v1(), manifest, manifest_path)
        self._apply_qa(manifest, qa_v1.artifact_path, "qa_v1")
        self._save_manifest(manifest_path, manifest)

        if manifest["final_score"] >= manifest["pass_threshold"]:
            final = self._finalize(story_id, story_dir, Path(manifest["current_draft"]), manifest, manifest_path)
        else:
            self._set_status(manifest, manifest_path, "rewrite_v1")
            draft_v2 = self._dispatch(story_id, agents.rewrite(), manifest, manifest_path)
            manifest["current_draft"] = rel(draft_v2.artifact_path, self.root)
            manifest["files"]["draft_v2"] = rel(draft_v2.artifact_path, self.root)
            manifest["rewrite_round"] = 1
            self._save_manifest(manifest_path, manifest)

            self._set_status(manifest, manifest_path, "qa_v2")
            qa_v2 = self._dispatch(story_id, agents.qa_v2(), manifest, manifest_path)
            self._apply_qa(manifest, qa_v2.artifact_path, "qa_v2")
            self._save_manifest(manifest_path, manifest)

            if manifest["final_score"] >= manifest["pass_threshold"]:
                final = self._finalize(story_id, story_dir, Path(manifest["current_draft"]), manifest, manifest_path)
            else:
                manifest["status"] = "needs_human_review"
                final = None

        self._save_manifest(manifest_path, manifest)
        return {
            "story_id": story_id,
            "story_dir": rel(story_dir, self.root),
            "manifest": rel(manifest_path, self.root),
            "final": rel(final, self.root) if final else None,
            "status": manifest["status"],
            "final_score": manifest["final_score"],
        }

    def _plan_today(self) -> dict[str, Any]:
        candidate = {
            "candidate_id": "m2-1-workflow-smoke",
            "working_title": "M2 工作流冒烟测试",
            "genre": "workflow_mock",
            "slug": "m2-workflow-smoke-test",
            "core_conflict": "验证 Story Manager 是否能按顺序调度所有 mock agent。",
            "rank_score": 100,
        }
        today = {
            "date": self.date,
            "status": "top_n_selected",
            "target_story_count": 1,
            "history_windows": {
                "recent_7_days": {
                    "genres_seen": [],
                    "repeated_genres": [],
                    "high_quality_genres": [],
                    "missing_genres": ["workflow_mock"],
                    "notes": "M2.1 mock workflow does not analyze real content.",
                },
                "recent_30_days": {
                    "genres_seen": [],
                    "repeated_genres": [],
                    "high_quality_genres": [],
                    "low_quality_genres": [],
                    "missing_genres": ["workflow_mock"],
                    "notes": "M2.1 mock workflow does not analyze real content.",
                },
            },
            "planned_genres": [{"genre": "workflow_mock", "count": 1}],
            "avoid_genres": [],
            "improvement_targets": ["workflow_dispatch"],
            "topic_candidates": [candidate],
            "diversity_filter": {
                "rules_applied": ["M2.1 fixed mock candidate"],
                "kept_candidate_ids": [candidate["candidate_id"]],
                "removed_candidates": [],
            },
            "ranking": {
                "scoring_dimensions": [
                    "innovation",
                    "conflict",
                    "twist",
                    "platform_fit",
                    "hook",
                    "emotion",
                    "diversity_bonus",
                    "repetition_penalty",
                ],
                "ranked_candidates": [candidate],
            },
            "selected_top_n": [candidate],
            "reasons": ["M2.1 only validates executable workflow, not story quality."],
            "updated_at": now_iso(),
        }
        write_json(self.root / "planning" / "today.json", today)
        return candidate

    def _init_manifest(self, story_id: str, slug: str) -> dict[str, Any]:
        template_path = self.root / "templates" / "story_manifest.template.json"
        manifest = read_json(template_path)
        manifest.update(
            {
                "story_id": story_id,
                "date": self.date,
                "slug": slug,
                "title": "",
                "genre": "",
                "status": "idea_pending",
                "current_draft": "",
                "current_qa": "",
                "rewrite_round": 0,
                "qa_round": 0,
                "final_score": None,
                "pass_threshold": PASS_THRESHOLD,
                "created_at": now_iso(),
                "updated_at": now_iso(),
            }
        )
        manifest["agent_versions"] = {
            "story_manager": AGENT_VERSION,
            "idea": AGENT_VERSION,
            "outline": AGENT_VERSION,
            "writer": AGENT_VERSION,
            "qa": AGENT_VERSION,
            "rewrite": AGENT_VERSION,
            "recorder": AGENT_VERSION,
            "evolver": "",
        }
        manifest["prompt_versions"] = {
            "style": "v1",
            "scoring": "v1",
            "idea": "v1",
            "outline": "",
            "writer": "v1",
            "qa": "v1",
            "rewrite": "",
        }
        return manifest

    def _dispatch(
        self,
        story_id: str,
        result: StageResult,
        manifest: dict[str, Any],
        manifest_path: Path,
    ) -> StageResult:
        if not result.artifact_path.exists():
            raise WorkflowError(f"{result.stage} did not produce {result.artifact_path}")
        record = self.recorder.record(story_id, result)
        metrics = manifest["metrics"]
        metrics["total_cost_usd"] += record["cost_usd"]
        metrics["total_latency_sec"] += record["duration_seconds"]
        metrics["total_input_tokens"] += record["input_tokens"]
        metrics["total_output_tokens"] += record["output_tokens"]
        self._save_manifest(manifest_path, manifest)
        return result

    def _apply_qa(self, manifest: dict[str, Any], qa_path: Path, file_key: str) -> None:
        qa = read_json(qa_path)
        manifest["current_qa"] = rel(qa_path, self.root)
        manifest["files"][file_key] = rel(qa_path, self.root)
        manifest["qa_round"] = qa["evaluation_cycle"]
        manifest["final_score"] = qa["final_scores"]["total"]

    def _finalize(
        self,
        story_id: str,
        story_dir: Path,
        current_draft_rel: Path,
        manifest: dict[str, Any],
        manifest_path: Path,
    ) -> Path:
        source = self.root / current_draft_rel
        final_path = story_dir / "final.md"
        shutil.copyfile(source, final_path)
        manifest["files"]["final"] = rel(final_path, self.root)
        manifest["status"] = "passed"
        self._save_manifest(manifest_path, manifest)
        self._dispatch(
            story_id,
            StageResult(
                stage="final",
                agent_name="story_manager.agent.md",
                artifact_path=final_path,
                status="pass",
                input_tokens=0,
                output_tokens=0,
                duration_seconds=0.0,
                notes="M2.1 Story Manager confirmed final.md from passed draft",
            ),
            manifest,
            manifest_path,
        )
        return final_path

    def _set_status(self, manifest: dict[str, Any], manifest_path: Path, status: str) -> None:
        manifest["status"] = status
        self._save_manifest(manifest_path, manifest)

    def _save_manifest(self, path: Path, manifest: dict[str, Any]) -> None:
        manifest["updated_at"] = now_iso()
        write_json(path, manifest)


def run_today(root: Path | None = None, run_date: str | None = None) -> dict[str, Any]:
    manager = StoryManager(root or Path.cwd(), run_date=run_date)
    return manager.run()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run Story Forge M2.1 mock workflow.")
    parser.add_argument(
        "command",
        nargs="?",
        default="start-today",
        choices=["start-today", "开始今天创作"],
        help="Workflow command to run.",
    )
    parser.add_argument("--date", dest="run_date", help="Override run date as YYYYMMDD.")
    args = parser.parse_args(argv)
    summary = run_today(Path.cwd(), run_date=args.run_date)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
