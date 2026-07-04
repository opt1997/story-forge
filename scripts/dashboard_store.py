import argparse
import json
import sqlite3
import sys
from pathlib import Path
from typing import Any

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def connect(root: Path) -> sqlite3.Connection:
    db_path = root / "metrics" / "story_forge.sqlite"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    init_db(conn)
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS stories (
          id TEXT PRIMARY KEY,
          title TEXT,
          summary TEXT,
          created_at TEXT,
          status TEXT
        );

        CREATE TABLE IF NOT EXISTS story_metrics (
          story_id TEXT PRIMARY KEY,
          read_count INTEGER DEFAULT 0,
          drop_off_users INTEGER DEFAULT 0,
          FOREIGN KEY(story_id) REFERENCES stories(id)
        );

        CREATE TABLE IF NOT EXISTS pipeline_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          story_id TEXT,
          stage TEXT,
          iteration INTEGER,
          timestamp TEXT,
          status TEXT,
          FOREIGN KEY(story_id) REFERENCES stories(id)
        );

        CREATE TABLE IF NOT EXISTS dashboard_runs (
          id TEXT PRIMARY KEY,
          status TEXT,
          requested_count INTEGER,
          created_at TEXT,
          updated_at TEXT,
          error TEXT
        );

        CREATE TABLE IF NOT EXISTS dashboard_run_stories (
          run_id TEXT,
          story_id TEXT,
          story_index INTEGER,
          PRIMARY KEY(run_id, story_id),
          FOREIGN KEY(run_id) REFERENCES dashboard_runs(id),
          FOREIGN KEY(story_id) REFERENCES stories(id)
        );

        CREATE TABLE IF NOT EXISTS topic_candidates (
          id TEXT PRIMARY KEY,
          date TEXT NOT NULL,
          title TEXT NOT NULL,
          genre TEXT,
          summary TEXT,
          heat_score INTEGER,
          quality_score INTEGER,
          tags TEXT,
          source TEXT,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS cancelled_tasks (
          task_id TEXT PRIMARY KEY,
          run_id TEXT,
          story_index INTEGER,
          story_id TEXT,
          cancelled_at TEXT NOT NULL
        );
        """
    )
    conn.commit()


def print_json(value: Any) -> None:
    print(json.dumps(value, ensure_ascii=False, separators=(",", ":")))


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row else None


def create_run(conn: sqlite3.Connection, run_id: str, count: int) -> None:
    timestamp = now_iso()
    conn.execute(
        """
        INSERT INTO dashboard_runs (id, status, requested_count, created_at, updated_at, error)
        VALUES (?, 'running', ?, ?, ?, NULL)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          requested_count = excluded.requested_count,
          updated_at = excluded.updated_at,
          error = NULL
        """,
        (run_id, count, timestamp, timestamp),
    )
    conn.commit()


def update_run(conn: sqlite3.Connection, run_id: str, status: str, error: str | None = None) -> None:
    conn.execute(
        "UPDATE dashboard_runs SET status = ?, updated_at = ?, error = ? WHERE id = ?",
        (status, now_iso(), error, run_id),
    )
    conn.commit()


def upsert_story(conn: sqlite3.Connection, story: dict[str, Any], run_id: str | None, story_index: int | None) -> None:
    conn.execute(
        """
        INSERT INTO stories (id, title, summary, created_at, status)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          summary = excluded.summary,
          created_at = excluded.created_at,
          status = excluded.status
        """,
        (
            story["id"],
            story.get("title", ""),
            story.get("summary", ""),
            story.get("created_at") or now_iso(),
            story.get("status", "running"),
        ),
    )
    conn.execute(
        """
        INSERT INTO story_metrics (story_id, read_count, drop_off_users)
        VALUES (?, ?, ?)
        ON CONFLICT(story_id) DO UPDATE SET
          read_count = story_metrics.read_count,
          drop_off_users = story_metrics.drop_off_users
        """,
        (story["id"], int(story.get("read_count", 0)), int(story.get("drop_off_users", 0))),
    )
    if run_id and story_index is not None:
        conn.execute(
            """
            INSERT OR IGNORE INTO dashboard_run_stories (run_id, story_id, story_index)
            VALUES (?, ?, ?)
            """,
            (run_id, story["id"], story_index),
        )
    conn.commit()


def add_log(conn: sqlite3.Connection, story_id: str, stage: str, iteration: int, status: str, timestamp: str | None = None) -> None:
    conn.execute(
        "INSERT INTO pipeline_logs (story_id, stage, iteration, timestamp, status) VALUES (?, ?, ?, ?, ?)",
        (story_id, stage, iteration, timestamp or now_iso(), status),
    )
    conn.commit()


def update_metrics(conn: sqlite3.Connection, story_id: str, read_count: int, drop_off_users: int) -> None:
    conn.execute(
        """
        INSERT INTO story_metrics (story_id, read_count, drop_off_users)
        VALUES (?, ?, ?)
        ON CONFLICT(story_id) DO UPDATE SET
          read_count = excluded.read_count,
          drop_off_users = excluded.drop_off_users
        """,
        (story_id, read_count, drop_off_users),
    )
    conn.commit()


def fetch_story(conn: sqlite3.Connection, story_id: str) -> dict[str, Any] | None:
    row = conn.execute(
        """
        SELECT s.id, s.title, s.summary, s.created_at, s.status,
               COALESCE(m.read_count, 0) AS read_count,
               COALESCE(m.drop_off_users, 0) AS drop_off_users
        FROM stories s
        LEFT JOIN story_metrics m ON m.story_id = s.id
        WHERE s.id = ?
        """,
        (story_id,),
    ).fetchone()
    if not row:
        return None
    story = dict(row)
    story["pipeline_logs"] = fetch_logs(conn, story_id)
    return story


def fetch_logs(conn: sqlite3.Connection, story_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT stage, iteration, timestamp, status
        FROM pipeline_logs
        WHERE story_id = ?
        ORDER BY id ASC
        """,
        (story_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def list_stories(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT s.id, s.title, s.summary, s.created_at, s.status,
               COALESCE(m.read_count, 0) AS read_count,
               COALESCE(m.drop_off_users, 0) AS drop_off_users
        FROM stories s
        LEFT JOIN story_metrics m ON m.story_id = s.id
        ORDER BY s.created_at DESC, s.id DESC
        LIMIT 50
        """
    ).fetchall()
    return [dict(row) for row in rows]


def list_runs(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT id, status, requested_count, created_at, updated_at, error
        FROM dashboard_runs
        ORDER BY created_at DESC, id DESC
        LIMIT 30
        """
    ).fetchall()
    return [dict(row) for row in rows]


def upsert_topic(conn: sqlite3.Connection, topic: dict[str, Any]) -> None:
    conn.execute(
        """
        INSERT INTO topic_candidates
          (id, date, title, genre, summary, heat_score, quality_score, tags, source, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          date = excluded.date,
          title = excluded.title,
          genre = excluded.genre,
          summary = excluded.summary,
          heat_score = excluded.heat_score,
          quality_score = excluded.quality_score,
          tags = excluded.tags,
          source = excluded.source
        """,
        (
            topic["id"],
            topic["date"],
            topic["title"],
            topic.get("genre", ""),
            topic.get("summary", ""),
            int(topic.get("heat_score", 0)),
            int(topic.get("quality_score", 0)),
            json.dumps(topic.get("tags", []), ensure_ascii=False),
            topic.get("source", "mock"),
            topic.get("created_at") or now_iso(),
        ),
    )
    conn.commit()


def list_topics(conn: sqlite3.Connection, date: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT id, date, title, genre, summary, heat_score, quality_score, tags, source, created_at
        FROM topic_candidates
        WHERE date = ?
        ORDER BY quality_score DESC, heat_score DESC, id ASC
        """,
        (date,),
    ).fetchall()
    topics = []
    for row in rows:
        topic = dict(row)
        try:
            topic["tags"] = json.loads(topic.get("tags") or "[]")
        except json.JSONDecodeError:
            topic["tags"] = []
        topics.append(topic)
    return topics


def clear_topics(conn: sqlite3.Connection, date: str) -> None:
    conn.execute("DELETE FROM topic_candidates WHERE date = ?", (date,))
    conn.commit()


def cancel_task(conn: sqlite3.Connection, task_id: str, run_id: str | None, story_index: int | None, story_id: str | None) -> None:
    conn.execute(
        """
        INSERT INTO cancelled_tasks (task_id, run_id, story_index, story_id, cancelled_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(task_id) DO UPDATE SET
          run_id = excluded.run_id,
          story_index = excluded.story_index,
          story_id = excluded.story_id,
          cancelled_at = excluded.cancelled_at
        """,
        (task_id, run_id, story_index, story_id, now_iso()),
    )
    conn.commit()


def list_cancelled_tasks(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT task_id, run_id, story_index, story_id, cancelled_at FROM cancelled_tasks"
    ).fetchall()
    return [dict(row) for row in rows]


def fetch_run(conn: sqlite3.Connection, run_id: str) -> dict[str, Any] | None:
    run = row_to_dict(conn.execute("SELECT * FROM dashboard_runs WHERE id = ?", (run_id,)).fetchone())
    if not run:
        return None
    rows = conn.execute(
        """
        SELECT rs.story_index, s.id, s.title, s.summary, s.created_at, s.status,
               COALESCE(m.read_count, 0) AS read_count,
               COALESCE(m.drop_off_users, 0) AS drop_off_users
        FROM dashboard_run_stories rs
        JOIN stories s ON s.id = rs.story_id
        LEFT JOIN story_metrics m ON m.story_id = s.id
        WHERE rs.run_id = ?
        ORDER BY rs.story_index ASC
        """,
        (run_id,),
    ).fetchall()
    stories = []
    for row in rows:
        story = dict(row)
        story["pipeline_logs"] = fetch_logs(conn, story["id"])
        stories.append(story)
    run["stories"] = stories
    return run


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("init")

    create = sub.add_parser("create-run")
    create.add_argument("--run-id", required=True)
    create.add_argument("--count", required=True, type=int)

    run_status = sub.add_parser("update-run")
    run_status.add_argument("--run-id", required=True)
    run_status.add_argument("--status", required=True)
    run_status.add_argument("--error", default=None)

    upsert = sub.add_parser("upsert-story")
    upsert.add_argument("--payload", required=True)

    log = sub.add_parser("add-log")
    log.add_argument("--story-id", required=True)
    log.add_argument("--stage", required=True)
    log.add_argument("--iteration", required=True, type=int)
    log.add_argument("--status", required=True)
    log.add_argument("--timestamp", default=None)

    metrics = sub.add_parser("update-metrics")
    metrics.add_argument("--story-id", required=True)
    metrics.add_argument("--read-count", required=True, type=int)
    metrics.add_argument("--drop-off-users", required=True, type=int)

    story = sub.add_parser("story")
    story.add_argument("--story-id", required=True)

    run = sub.add_parser("run")
    run.add_argument("--run-id", required=True)

    sub.add_parser("list-stories")

    sub.add_parser("list-runs")

    upsert_topic_cmd = sub.add_parser("upsert-topic")
    upsert_topic_cmd.add_argument("--payload", required=True)

    topics = sub.add_parser("list-topics")
    topics.add_argument("--date", required=True)

    clear_topics_cmd = sub.add_parser("clear-topics")
    clear_topics_cmd.add_argument("--date", required=True)

    cancel_task_cmd = sub.add_parser("cancel-task")
    cancel_task_cmd.add_argument("--task-id", required=True)
    cancel_task_cmd.add_argument("--run-id", default=None)
    cancel_task_cmd.add_argument("--story-index", type=int, default=None)
    cancel_task_cmd.add_argument("--story-id", default=None)

    sub.add_parser("list-cancelled-tasks")

    args = parser.parse_args()
    root = Path(args.root)
    with connect(root) as conn:
        if args.cmd == "init":
            print_json({"ok": True})
        elif args.cmd == "create-run":
            create_run(conn, args.run_id, args.count)
            print_json({"ok": True})
        elif args.cmd == "update-run":
            update_run(conn, args.run_id, args.status, args.error)
            print_json({"ok": True})
        elif args.cmd == "upsert-story":
            payload = json.loads(args.payload)
            upsert_story(conn, payload["story"], payload.get("run_id"), payload.get("story_index"))
            print_json({"ok": True})
        elif args.cmd == "add-log":
            add_log(conn, args.story_id, args.stage, args.iteration, args.status, args.timestamp)
            print_json({"ok": True})
        elif args.cmd == "update-metrics":
            update_metrics(conn, args.story_id, args.read_count, args.drop_off_users)
            print_json({"ok": True})
        elif args.cmd == "story":
            print_json(fetch_story(conn, args.story_id) or {})
        elif args.cmd == "run":
            print_json(fetch_run(conn, args.run_id) or {})
        elif args.cmd == "list-stories":
            print_json({"stories": list_stories(conn)})
        elif args.cmd == "list-runs":
            print_json({"runs": list_runs(conn)})
        elif args.cmd == "upsert-topic":
            upsert_topic(conn, json.loads(args.payload))
            print_json({"ok": True})
        elif args.cmd == "list-topics":
            print_json({"topics": list_topics(conn, args.date)})
        elif args.cmd == "clear-topics":
            clear_topics(conn, args.date)
            print_json({"ok": True})
        elif args.cmd == "cancel-task":
            cancel_task(conn, args.task_id, args.run_id, args.story_index, args.story_id)
            print_json({"ok": True})
        elif args.cmd == "list-cancelled-tasks":
            print_json({"tasks": list_cancelled_tasks(conn)})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
