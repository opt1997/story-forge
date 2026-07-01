export type ArtifactMap = Record<string, string>;

export type ExecutionConfig = {
  rootDir: string;
  storyDir: string;
  provider: "mock" | "openai" | "claude";
  modelByAgent: Record<string, string>;
  qaThreshold: number;
  maxRewriteRounds: number;
};

export type ExecutionContext = {
  storyId: string;
  input: Record<string, unknown>;
  artifacts: ArtifactMap;
  config: ExecutionConfig;
};

export type AgentRunResult = {
  agentName: string;
  status: "success" | "rewrite" | "failed";
  output: unknown;
  artifactKey?: string;
  artifactPath?: string;
  score?: number;
  failureReason?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
};
