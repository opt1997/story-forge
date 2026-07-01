const path = require("node:path");
const { pathToFileURL } = require("node:url");

async function main() {
  const rootDir = path.resolve(__dirname, "..");
  const runDateArg = process.argv.find((arg) => arg.startsWith("--date="));
  const providerArg = process.argv.find((arg) => arg.startsWith("--provider="));
  const runDate = runDateArg ? runDateArg.slice("--date=".length) : undefined;
  const provider = providerArg ? providerArg.slice("--provider=".length) : "mock";
  const workflowUrl = pathToFileURL(path.join(rootDir, "core", "workflow", "workflow-engine.ts")).href;
  const { WorkflowEngine } = await import(workflowUrl);
  const engine = new WorkflowEngine({ rootDir, runDate, provider });
  const summary = await engine.run();
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
