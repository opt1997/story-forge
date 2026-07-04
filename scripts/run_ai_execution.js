const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { existsSync } = require("node:fs");
const { spawnSync } = require("node:child_process");

async function main() {
  reexecWithTsCapableNodeIfNeeded();
  const rootDir = path.resolve(__dirname, "..");
  const runDateArg = process.argv.find((arg) => arg.startsWith("--date="));
  const providerArg = process.argv.find((arg) => arg.startsWith("--provider="));
  const progressFileArg = process.argv.find((arg) => arg.startsWith("--progress-file="));
  const storyIndexArg = process.argv.find((arg) => arg.startsWith("--story-index="));
  const candidateIdArg = process.argv.find((arg) => arg.startsWith("--candidate-id="));
  const runDate = runDateArg ? runDateArg.slice("--date=".length) : undefined;
  const provider = providerArg
    ? providerArg.slice("--provider=".length)
    : process.env.STORY_FORGE_LLM_PROVIDER || "mock";
  const progressFile = progressFileArg ? progressFileArg.slice("--progress-file=".length) : undefined;
  const storyIndex = storyIndexArg ? Number(storyIndexArg.slice("--story-index=".length)) : undefined;
  const candidateId = candidateIdArg ? candidateIdArg.slice("--candidate-id=".length) : undefined;
  const workflowUrl = pathToFileURL(path.join(rootDir, "core", "workflow", "workflow-engine.ts")).href;
  const { WorkflowEngine } = await import(workflowUrl);
  const engine = new WorkflowEngine({ rootDir, runDate, provider, progressFile, storyIndex, candidateId });
  const summary = await engine.run();
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

function reexecWithTsCapableNodeIfNeeded() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major >= 24 || process.env.STORY_FORGE_NODE_REEXEC === "1") {
    return;
  }

  const candidates = [
    process.env.STORY_FORGE_NODE,
    path.join(
      process.env.USERPROFILE || "C:\\Users\\Administrator",
      ".cache",
      "codex-runtimes",
      "codex-primary-runtime",
      "dependencies",
      "node",
      "bin",
      "node.exe",
    ),
  ].filter(Boolean);

  const current = path.resolve(process.execPath).toLowerCase();
  const command = candidates.find((candidate) => {
    const resolved = path.resolve(candidate).toLowerCase();
    return resolved !== current && existsSync(candidate);
  });

  if (!command) {
    throw new Error(`Node ${process.versions.node} cannot run TypeScript execution modules. Set STORY_FORGE_NODE to Node 24+.`);
  }

  const result = spawnSync(command, process.argv.slice(1), {
    stdio: "inherit",
    env: {
      ...process.env,
      STORY_FORGE_NODE_REEXEC: "1",
    },
  });
  process.exit(result.status ?? 1);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
