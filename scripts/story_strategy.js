const { existsSync } = require("fs");
const { mkdir, readdir, readFile, writeFile } = require("fs/promises");
const path = require("path");

const DEFAULT_CANDIDATE_COUNT = 36;
const MAX_CANDIDATE_COUNT = 50;
const MIN_CANDIDATE_COUNT = 30;
const SHANGHAI_TZ = "Asia/Shanghai";

const COMMERCIAL_SKILLS = [
  {
    skill_id: "instant-pressure-opening",
    label: "前三百字压迫开局",
    agent: "writer",
    use_when: ["都市逆袭", "婚恋反转", "职场爽文"],
    guidance: "开头直接给羞辱、损失、倒计时或公开审判，避免慢热铺垫。",
  },
  {
    skill_id: "public-reversal-payoff",
    label: "公开场合反转打脸",
    agent: "writer",
    use_when: ["直播舆论", "豪门婚恋", "职场权力"],
    guidance: "让冲突在直播间、会议、婚礼、群聊等公开场景爆发，反转必须可被围观者确认。",
  },
  {
    skill_id: "rule-based-suspense",
    label: "规则怪谈式钩子",
    agent: "writer",
    use_when: ["规则怪谈", "悬疑奇幻", "末日规则", "都市异闻"],
    guidance: "先抛出一条违反常识的规则，再用代价证明规则真实存在。",
  },
  {
    skill_id: "identity-upgrade-loop",
    label: "身份升级循环",
    agent: "writer",
    use_when: ["女频爽文", "男频逆袭", "系统流"],
    guidance: "每个关键节点都让主角夺回一个身份标签或资源权限，形成连续正反馈。",
  },
  {
    skill_id: "emotion-before-logic",
    label: "情绪先行解释后置",
    agent: "writer",
    use_when: ["亲情撕裂", "婚恋背叛", "复仇爽文"],
    guidance: "先写人物被迫选择和情绪爆点，再补动机解释，避免先讲设定。",
  },
];

const FALLBACK_TRENDS = [
  {
    signal_id: "workplace-ai-displacement",
    topic: "AI 工具改变职场分工",
    heat: 87,
    source: "local_fallback",
    commercial_angle: "被 AI 替代的普通人反向掌控系统规则",
    suitable_genres: ["职场爽文", "都市逆袭", "系统流"],
  },
  {
    signal_id: "live-commerce-trust",
    topic: "直播带货信任危机",
    heat: 84,
    source: "local_fallback",
    commercial_angle: "直播间公开审判与身份反转",
    suitable_genres: ["直播舆论", "都市逆袭", "豪门婚恋"],
  },
  {
    signal_id: "family-asset-conflict",
    topic: "家庭资产与养老压力",
    heat: 82,
    source: "local_fallback",
    commercial_angle: "亲情绑架下的财产争夺和迟来清算",
    suitable_genres: ["亲情撕裂", "现实爽文", "婚恋反转"],
  },
  {
    signal_id: "youth-employment-anxiety",
    topic: "青年就业和副业焦虑",
    heat: 80,
    source: "local_fallback",
    commercial_angle: "低谷角色靠隐藏技能逆转收入结构",
    suitable_genres: ["都市逆袭", "职场爽文", "创业爽文"],
  },
  {
    signal_id: "short-drama-fast-payoff",
    topic: "短剧式强爽点叙事",
    heat: 78,
    source: "local_fallback",
    commercial_angle: "每三分钟一个反转和一次资源回收",
    suitable_genres: ["女频爽文", "复仇爽文", "豪门婚恋"],
  },
  {
    signal_id: "urban-legend-safety",
    topic: "城市安全与陌生人风险",
    heat: 76,
    source: "local_fallback",
    commercial_angle: "熟悉城市空间里出现不可解释规则",
    suitable_genres: ["悬疑奇幻", "都市异闻", "规则怪谈"],
  },
];

const STORY_ARCHETYPES = [
  {
    type: "都市逆袭",
    theme: "公开羞辱后的资源翻盘",
    title_seed: "被裁当天我接管了老板的直播间",
    title_variants: [
      "被踢出群聊后，公司订单全停了",
      "裁员直播三分钟后，老板求我别下播",
      "我关掉后台那晚，爆款账号断流了",
      "离职交接当天，我把权限还给了系统",
      "老板撤掉我工牌后，直播间只剩空白页",
      "他们删我账号那刻，客户名单自动锁死",
    ],
    protagonist: "被低估的运营新人",
    antagonist: "抢功劳的上级和失控舆论",
    conflict: "主角被当众裁掉，却发现所有成交数据都依赖她私下搭建的系统。",
    twist: "老板以为能封号，结果直播间权限早已绑定主角身份。",
  },
  {
    type: "豪门婚恋",
    theme: "替身关系中的身份夺回",
    title_seed: "替身合约到期后全城开始找我",
    title_variants: [
      "白月光回国那晚，我撤走了并购案",
      "离开签约席后，老爷子把公章递给我",
      "替身退场当天，豪门直播间崩盘了",
      "他让我继续扮演她，我反手注销了项目",
      "退还黑卡后，董事会开始等我入席",
      "我离开婚房那夜，百亿订单改了收款人",
    ],
    protagonist: "被迫签下替身协议的女主",
    antagonist: "把婚姻当生意的豪门继承人",
    conflict: "合约到期当天，对方要求她继续配合演戏，她却公开退出。",
    twist: "真正能救豪门项目的人不是白月光，而是一直被轻视的替身。",
  },
  {
    type: "规则怪谈",
    theme: "日常空间里的生存规则",
    title_seed: "末班地铁禁止回复第三条消息",
    title_variants: [
      "末班地铁上，我收到自己的求救短信",
      "十三号车厢里，不能叫出同伴的名字",
      "最后一站前，所有乘客都开始模仿我",
      "电梯停在负一层时，妈妈给我发来遗言",
      "便利店灯灭三次后，收银员换成了我",
      "凌晨公交到站时，司机念出了我的生日",
    ],
    protagonist: "加班到深夜的普通乘客",
    antagonist: "不断模仿熟人的未知乘客",
    conflict: "手机连续收到来自同事、亲人和自己的求救消息，规则要求只能回复一次。",
    twist: "真正被困在车厢里的不是主角，而是所有回复过第三条消息的人。",
  },
  {
    type: "亲情撕裂",
    theme: "家庭道德绑架的反向清算",
    title_seed: "我停掉转账后全家开始审判我",
    title_variants: [
      "我取消亲情卡后，家族群开了审判直播",
      "母亲寿宴那天，我公开了三十七张欠条",
      "弟弟买房前夜，我把转账记录投上大屏",
      "他们骂我不孝时，医院缴费单亮了",
      "父亲遗嘱宣读前，我冻结了家庭账户",
      "亲戚来讨债那天，我带来了真正的债主",
    ],
    protagonist: "长期供养家庭的长女",
    antagonist: "把牺牲视为理所当然的亲属",
    conflict: "主角停止无底线转账后，被全家直播控诉不孝。",
    twist: "她保留了所有债务、病历和转账证据，并把真正欠债的人推到镜头前。",
  },
  {
    type: "职场爽文",
    theme: "权力结构反杀",
    title_seed: "会议室里他们让我背锅",
    title_variants: [
      "客户到场前十分钟，我打开了同步日志",
      "事故复盘会上，我把录音接进了投屏",
      "他们让我签责任书，我递上了权限截图",
      "周一晨会开始前，审计机器人先点了名",
      "总监甩锅那秒，会议纪要自动发给客户",
      "我被踢出项目群后，生产环境锁住了",
    ],
    protagonist: "掌握关键日志的项目负责人",
    antagonist: "临时甩锅的管理层",
    conflict: "产品事故当天，所有人要求主角在客户面前认错。",
    twist: "主角提前把每次违规指令写入自动同步报告，客户代表正好在场。",
  },
  {
    type: "女频爽文",
    theme: "退婚后的规则制定权",
    title_seed: "退婚后我成了新规则的制定者",
    title_variants: [
      "退婚宴结束后，平台请我重写准入规则",
      "他撕掉婚约那刻，我拿到了行业白名单",
      "我离开订婚台，全场资本开始改口",
      "前未婚夫封杀我后，竞标名单只剩我",
      "婚礼取消当天，我签下了他的最大客户",
      "他们等我认输，我却坐上了评审席",
    ],
    protagonist: "被退婚羞辱的创业者",
    antagonist: "用婚约交换资源的前未婚夫",
    conflict: "退婚宴上，对方试图夺走她的项目入场资格。",
    twist: "主角不是来求入场，她是被平台邀请来重写行业规则的人。",
  },
];

async function buildTodayStrategy(root, options = {}) {
  const date = options.date || shanghaiDate();
  const targetCount = clampInt(options.targetCount, 1, 5, 1);
  const history = await readHistory(root, date);
  const trends = await readTrendSignals(root);
  const learning = await readFeedbackLearning(root);
  const candidates = buildCandidates({ date, targetCount, history, trends, learning });
  const filtered = applyDiversityFilter(candidates, history);
  const ranked = rankCandidates(filtered.kept, history, learning);
  const selected = ranked.slice(0, targetCount);
  const plan = {
    date,
    status: "top_n_selected",
    target_story_count: targetCount,
    history_windows: buildHistoryWindows(history),
    planned_genres: summarizePlannedGenres(selected),
    avoid_genres: history.fatiguedGenres.map((genre) => ({
      genre,
      reason: "最近 7 天出现频率偏高，今日降低重复风险。",
    })),
    improvement_targets: buildImprovementTargets(history, learning),
    trend_inputs: {
      source_note: "当前实现读取 knowledge/trends.json；缺失时使用本地商业题材趋势种子。后续可接入经用户授权的热点源。",
      signals: trends.slice(0, 8),
    },
    feedback_adjustments: buildFeedbackAdjustments(history, learning),
    topic_candidates: candidates,
    diversity_filter: {
      rules_applied: [
        "近期 7 天同题材过密降权",
        "核心冲突和关键场景相似降权",
        "人工反馈高流失模式降权",
        "高阅读低流失模式加权",
      ],
      kept_candidate_ids: filtered.kept.map((candidate) => candidate.candidate_id),
      removed_candidates: filtered.removed,
    },
    ranking: {
      scoring_dimensions: [
        "innovation",
        "conflict",
        "twist",
        "platform_fit",
        "hook",
        "emotion",
        "trend_heat",
        "feedback_bonus",
        "diversity_bonus",
        "repetition_penalty",
      ],
      ranked_candidates: ranked,
    },
    selected_top_n: selected,
    writer_skill_pack: selected.map((candidate) => ({
      candidate_id: candidate.candidate_id,
      skill_id: candidate.writing_skill.skill_id,
      label: candidate.writing_skill.label,
      guidance: candidate.writing_skill.guidance,
    })),
    qa_learning: {
      calibration_version: learning.version || "local-feedback-v1",
      scoring_bias: learning.qa_calibration || [],
      note: "QA 根据人工回填的 read_count/drop_off_users 形成小步校准建议，但不自动覆盖 scoring prompt。",
    },
    agent_rule_update_proposals: buildAgentRuleProposals(selected, learning),
    reasons: [
      "根据本地趋势输入、历史题材分布和人工反馈数据生成 Top N。",
      "优先选择商业爽点清晰、强冲突、可快速兑现反转的题材。",
      "对近期重复题材和高流失模式进行降权。",
    ],
    updated_at: nowIso(),
  };

  await writeJson(path.join(root, "planning", "today.json"), plan);
  await writeLearningProposals(root, date, plan);
  return plan;
}

async function readTodayStrategy(root) {
  return readJson(path.join(root, "planning", "today.json"), null);
}

async function selectCandidateForStory(root, runDate, storyIndex = 1, options = {}) {
  const preferredCandidateId = typeof options === "string" ? options : options.candidateId || options.candidate_id;
  const existing = await readTodayStrategy(root);
  if (existing?.date === runDate) {
    const preferred = findCandidateInPlan(existing, preferredCandidateId);
    if (preferred) {
      return {
        plan: existing,
        candidate: preferred,
      };
    }
  }
  if (existing?.date === runDate && Array.isArray(existing.selected_top_n) && existing.selected_top_n.length >= storyIndex) {
    return {
      plan: existing,
      candidate: existing.selected_top_n[storyIndex - 1],
    };
  }
  const plan = await buildTodayStrategy(root, { date: runDate, targetCount: Math.max(1, storyIndex) });
  const preferred = findCandidateInPlan(plan, preferredCandidateId);
  return {
    plan,
    candidate: preferred || plan.selected_top_n[Math.min(storyIndex - 1, plan.selected_top_n.length - 1)],
  };
}

function findCandidateInPlan(plan, candidateId) {
  const id = String(candidateId || "").trim();
  if (!id || !plan) return null;
  const pools = [
    plan.selected_top_n,
    plan.ranking?.ranked_candidates,
    plan.topic_candidates,
  ].filter(Array.isArray);
  for (const candidates of pools) {
    const candidate = candidates.find((item) => item?.candidate_id === id);
    if (candidate) return candidate;
  }
  return null;
}

async function updateFeedbackLearning(root, storyId, metrics) {
  const learningPath = path.join(root, "knowledge", "feedback_learning.json");
  const learning = (await readJson(learningPath, null)) || {
    version: "local-feedback-v1",
    positive_patterns: [],
    negative_patterns: [],
    qa_calibration: [],
    updated_stories: [],
  };
  const story = await readStorySnapshot(root, storyId);
  const readCount = Number(metrics.read_count || 0);
  const dropOffUsers = Number(metrics.drop_off_users || 0);
  const dropRate = readCount > 0 ? dropOffUsers / readCount : 0;
  const signal = {
    story_id: storyId,
    title: story.title,
    genre: story.genre,
    read_count: readCount,
    drop_off_users: dropOffUsers,
    drop_rate: Number(dropRate.toFixed(4)),
    updated_at: nowIso(),
  };

  const isPositive = readCount >= 1000 && dropRate <= 0.18;
  const isNegative = readCount >= 100 && dropRate >= 0.32;
  if (isPositive) {
    upsertPattern(learning.positive_patterns, {
      key: `${story.genre}:positive`,
      genre: story.genre,
      lesson: "该题材在当前反馈中阅读表现较好，后续选题可增加相邻变体。",
      evidence: signal,
    });
  }
  if (isNegative) {
    upsertPattern(learning.negative_patterns, {
      key: `${story.genre}:dropoff`,
      genre: story.genre,
      lesson: "该题材或开篇承诺可能导致高流失，后续需要降低重复或强化开头兑现。",
      evidence: signal,
    });
    upsertPattern(learning.qa_calibration, {
      key: `${story.genre}:opening-dropoff`,
      genre: story.genre,
      lesson: "QA 对类似题材应更严格检查开篇承诺、爽点兑现速度和读者预期落差。",
      evidence: signal,
    });
  }

  learning.updated_stories = [signal, ...(learning.updated_stories || []).filter((item) => item.story_id !== storyId)].slice(0, 50);
  learning.updated_at = nowIso();
  await writeJson(learningPath, learning);
  await writeFeedbackProposal(root, storyId, signal, learning);
  return learning;
}

async function readHistory(root, date) {
  const canonicalStories = await readCanonicalStories(root);
  const recent7 = canonicalStories.filter((story) => daysBetween(story.date, date) <= 7);
  const recent30 = canonicalStories.filter((story) => daysBetween(story.date, date) <= 30);
  const genreCounts7 = countBy(recent7, "genre");
  const genreCounts30 = countBy(recent30, "genre");
  const fatiguedGenres = Object.entries(genreCounts7)
    .filter(([, count]) => count >= 2)
    .map(([genre]) => genre);
  const highQualityGenres = recent30
    .filter((story) => story.read_count >= median(canonicalStories.map((item) => item.read_count)) && story.drop_rate <= 0.22)
    .map((story) => story.genre);
  const lowQualityGenres = recent30
    .filter((story) => story.read_count > 0 && story.drop_rate >= 0.32)
    .map((story) => story.genre);
  return {
    date,
    stories: canonicalStories,
    recent7,
    recent30,
    genreCounts7,
    genreCounts30,
    fatiguedGenres: unique(fatiguedGenres),
    highQualityGenres: unique(highQualityGenres),
    lowQualityGenres: unique(lowQualityGenres),
  };
}

async function readCanonicalStories(root) {
  const storiesDir = path.join(root, "stories");
  if (!existsSync(storiesDir)) return [];
  const entries = await readdir(storiesDir, { withFileTypes: true });
  const snapshots = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const storyId = entry.name;
    if (/^\d{8}$/.test(storyId)) continue;
    const snapshot = await readStorySnapshot(root, storyId);
    if (snapshot.story_id) snapshots.push(snapshot);
  }
  return snapshots.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

async function readStorySnapshot(root, storyId) {
  const storyDir = path.join(root, "stories", storyId);
  const meta = (await readJson(path.join(storyDir, "meta.json"), null)) || {};
  const manifest = (await readJson(path.join(storyDir, "story_manifest.json"), null)) || {};
  const idea = (await readJson(path.join(storyDir, "idea.json"), null)) || {};
  const createdAt = meta.created_at || manifest.created_at || "";
  const readCount = Number(meta.metrics?.read_count ?? meta.read_count ?? 0);
  const dropOffUsers = Number(meta.metrics?.drop_off_users ?? meta.drop_off_users ?? 0);
  return {
    story_id: storyId,
    title: meta.title || manifest.title || idea.title || storyId,
    summary: meta.summary || "",
    genre: manifest.genre || idea.genre || "unknown",
    status: meta.status || manifest.status || "unknown",
    created_at: createdAt,
    date: dateFromStory(storyId, createdAt),
    read_count: Number.isFinite(readCount) ? readCount : 0,
    drop_off_users: Number.isFinite(dropOffUsers) ? dropOffUsers : 0,
    drop_rate: readCount > 0 ? dropOffUsers / readCount : 0,
  };
}

async function readTrendSignals(root) {
  const trendPath = path.join(root, "knowledge", "trends.json");
  const data = await readJson(trendPath, null);
  const signals = Array.isArray(data?.signals) ? data.signals : Array.isArray(data) ? data : FALLBACK_TRENDS;
  return signals
    .map((signal, index) => ({
      signal_id: String(signal.signal_id || `trend-${index + 1}`),
      topic: String(signal.topic || signal.keyword || "商业热点"),
      heat: clampInt(signal.heat, 1, 100, 70),
      source: String(signal.source || "knowledge"),
      commercial_angle: String(signal.commercial_angle || signal.angle || "转化为强冲突、高爽点、快反转题材。"),
      suitable_genres: Array.isArray(signal.suitable_genres) && signal.suitable_genres.length
        ? signal.suitable_genres.map(String)
        : ["都市逆袭", "女频爽文"],
    }))
    .sort((a, b) => b.heat - a.heat);
}

async function readFeedbackLearning(root) {
  return (await readJson(path.join(root, "knowledge", "feedback_learning.json"), null)) || {
    version: "local-feedback-v1",
    positive_patterns: [],
    negative_patterns: [],
    qa_calibration: [],
  };
}

function buildCandidates({ date, targetCount, history, trends, learning }) {
  const candidateTarget = clampInt(targetCount * 16, MIN_CANDIDATE_COUNT, MAX_CANDIDATE_COUNT, DEFAULT_CANDIDATE_COUNT);
  const candidates = [];
  const usedTitleKeys = new Set(history.stories.map((story) => titleKey(story.title)));
  for (let index = 0; index < candidateTarget; index += 1) {
    const trend = trends[index % trends.length];
    const archetype = STORY_ARCHETYPES[index % STORY_ARCHETYPES.length];
    const genre = archetype.type;
    const skill = chooseSkill(genre, trend, index);
    const fatiguePenalty = history.fatiguedGenres.includes(genre) ? 8 : 0;
    const negativePenalty = hasLearningForGenre(learning.negative_patterns, genre) ? 6 : 0;
    const positiveBonus = hasLearningForGenre(learning.positive_patterns, genre) ? 5 : 0;
    const diversityBonus = genre === archetype.type ? 4 : 7;
    const sequence = index + 1;
    const title = uniqueTitle(buildTitle(trend, archetype, sequence), usedTitleKeys, trend, archetype, sequence);
    const candidate = {
      candidate_id: `${date}-candidate-${String(sequence).padStart(2, "0")}`,
      working_title: title,
      slug: slugify(title, `story-${sequence}`),
      genre,
      theme: archetype.theme,
      type: archetype.type,
      target_audience: inferAudience(genre),
      trend_signals: [trend.signal_id],
      hotness_basis: `${trend.topic} / heat ${trend.heat} / ${trend.source}`,
      commercial_angle: trend.commercial_angle,
      priority: sequence,
      core_conflict: `${archetype.conflict} 同时借用热点“${trend.topic}”制造现实代入。`,
      protagonist: archetype.protagonist,
      obstacle_or_antagonist: archetype.antagonist,
      twist_direction: archetype.twist,
      monetization_hook: "前三百字给压力，中段连续打脸，结尾兑现身份或资源反转。",
      writing_skill: skill,
      feedback_learning: {
        positive_bonus: positiveBonus,
        negative_penalty: negativePenalty,
        fatigue_penalty: fatiguePenalty,
      },
      scores: {
        innovation: 72 + (sequence % 9) + Math.round(trend.heat / 20),
        conflict: 78 + (sequence % 7),
        twist: 76 + ((sequence * 3) % 10),
        platform_fit: 80 + ((sequence * 5) % 9),
        hook: 82 + ((sequence * 2) % 8),
        emotion: 76 + ((sequence * 4) % 9),
        trend_heat: trend.heat,
        feedback_bonus: positiveBonus,
        diversity_bonus: diversityBonus,
        repetition_penalty: fatiguePenalty + negativePenalty,
      },
    };
    candidate.scores.total = scoreCandidate(candidate);
    candidates.push(candidate);
  }
  return candidates;
}

function applyDiversityFilter(candidates, history) {
  const kept = [];
  const removed = [];
  const seenGenre = new Map();
  for (const candidate of candidates) {
    const genreSeen = seenGenre.get(candidate.genre) || 0;
    const recentPenalty = history.fatiguedGenres.includes(candidate.genre);
    if (genreSeen >= 6 || (recentPenalty && genreSeen >= 3)) {
      removed.push({
        candidate_id: candidate.candidate_id,
        working_title: candidate.working_title,
        genre: candidate.genre,
        reason: recentPenalty ? "近期题材疲劳，且候选池内同题材已足够。" : "候选池内同题材密度过高。",
      });
      continue;
    }
    seenGenre.set(candidate.genre, genreSeen + 1);
    kept.push(candidate);
  }
  return { kept, removed };
}

function rankCandidates(candidates, history, learning) {
  return candidates
    .map((candidate) => {
      const repeatPenalty = (history.genreCounts7[candidate.genre] || 0) * 3 + (history.genreCounts30[candidate.genre] || 0);
      const feedbackBonus = hasLearningForGenre(learning.positive_patterns, candidate.genre) ? 5 : 0;
      const feedbackPenalty = hasLearningForGenre(learning.negative_patterns, candidate.genre) ? 6 : 0;
      const scores = {
        ...candidate.scores,
        feedback_bonus: candidate.scores.feedback_bonus + feedbackBonus,
        repetition_penalty: candidate.scores.repetition_penalty + repeatPenalty + feedbackPenalty,
      };
      return {
        ...candidate,
        scores: {
          ...scores,
          total: scoreCandidate({ ...candidate, scores }),
        },
      };
    })
    .sort((a, b) => b.scores.total - a.scores.total)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

function scoreCandidate(candidate) {
  const scores = candidate.scores;
  const total =
    scores.innovation * 0.12 +
    scores.conflict * 0.16 +
    scores.twist * 0.14 +
    scores.platform_fit * 0.14 +
    scores.hook * 0.16 +
    scores.emotion * 0.12 +
    scores.trend_heat * 0.1 +
    scores.feedback_bonus +
    scores.diversity_bonus -
    scores.repetition_penalty;
  return Math.max(1, Math.min(100, Math.round(total)));
}

function buildHistoryWindows(history) {
  return {
    recent_7_days: {
      genres_seen: Object.keys(history.genreCounts7),
      repeated_genres: history.fatiguedGenres,
      high_quality_genres: history.highQualityGenres,
      missing_genres: missingGenres(history.genreCounts7),
      notes: `最近 7 天共读取 ${history.recent7.length} 篇本地故事。`,
    },
    recent_30_days: {
      genres_seen: Object.keys(history.genreCounts30),
      repeated_genres: Object.entries(history.genreCounts30).filter(([, count]) => count >= 3).map(([genre]) => genre),
      high_quality_genres: history.highQualityGenres,
      low_quality_genres: history.lowQualityGenres,
      missing_genres: missingGenres(history.genreCounts30),
      notes: `最近 30 天共读取 ${history.recent30.length} 篇本地故事。`,
    },
  };
}

function summarizePlannedGenres(selected) {
  return Object.entries(countBy(selected, "genre")).map(([genre, count]) => ({ genre, count }));
}

function buildImprovementTargets(history, learning) {
  const targets = [
    "开篇 300 字内必须给出损失、羞辱、倒计时或异常规则。",
    "每篇至少有一个可公开验证的反转，便于短剧式传播。",
    "减少近期重复题材，优先选择热点相邻但冲突不同的变体。",
  ];
  if ((learning.negative_patterns || []).length) {
    targets.push("对高流失题材提高爽点兑现速度，避免只铺设定不兑现。");
  }
  if (history.highQualityGenres.length) {
    targets.push(`保留高反馈题材的相邻变体：${history.highQualityGenres.slice(0, 3).join("、")}。`);
  }
  return targets;
}

function buildFeedbackAdjustments(history, learning) {
  return {
    positive_patterns: (learning.positive_patterns || []).slice(0, 5),
    negative_patterns: (learning.negative_patterns || []).slice(0, 5),
    high_quality_genres: history.highQualityGenres,
    low_quality_genres: history.lowQualityGenres,
  };
}

function buildAgentRuleProposals(selected, learning) {
  const skills = unique(selected.map((candidate) => candidate.writing_skill.label));
  return [
    {
      agent: "story_manager",
      target_file: "agents/story_manager.agent.md",
      proposal: "把 Top N 排名中的 feedback_bonus 与 repetition_penalty 作为每日选题固定字段。",
      review_required: true,
    },
    {
      agent: "writer",
      target_file: "agents/writer.agent.md",
      proposal: `下一版写作规则可加入热门商业技法：${skills.join("、")}。`,
      review_required: true,
    },
    {
      agent: "qa",
      target_file: "agents/qa.agent.md",
      proposal: "QA 评分应参考人工回填的高流失模式，提高开篇承诺和爽点兑现的扣分权重。",
      review_required: true,
      evidence: (learning.qa_calibration || []).slice(0, 3),
    },
    {
      agent: "evolver",
      target_file: "agents/evolver.agent.md",
      proposal: "Evolver 只生成 proposal，不自动覆盖 agent 或 prompt 文件；用户审核后再升版。",
      review_required: true,
    },
  ];
}

async function writeLearningProposals(root, date, plan) {
  const dir = path.join(root, "agents", "_learning_proposals");
  await mkdir(dir, { recursive: true });
  const text = [
    `# ${date} Agent Learning Proposal`,
    "",
    "本文件由 Story Manager planning execution 生成，只作为人工审核材料，不自动覆盖 agent 规则或 prompt。",
    "",
    "## 今日 Top N",
    ...plan.selected_top_n.map((candidate) => `- ${candidate.working_title}：${candidate.genre} / ${candidate.theme} / ${candidate.writing_skill.label}`),
    "",
    "## 建议更新",
    ...plan.agent_rule_update_proposals.map((item) => `- ${item.agent} -> ${item.target_file}：${item.proposal}`),
    "",
  ].join("\n");
  await writeFile(path.join(dir, `${date}-agent-learning.md`), text, "utf8");
}

async function writeFeedbackProposal(root, storyId, signal, learning) {
  const dir = path.join(root, "agents", "_learning_proposals");
  await mkdir(dir, { recursive: true });
  const date = shanghaiDate();
  const text = [
    `# ${date} Feedback Learning Proposal`,
    "",
    `Story: ${storyId}`,
    `Read count: ${signal.read_count}`,
    `Drop off users: ${signal.drop_off_users}`,
    `Drop rate: ${signal.drop_rate}`,
    "",
    "## 建议",
    "- Story Manager：后续选题排序加入该反馈信号。",
    "- Writer：对高流失题材加强前三百字压力和爽点兑现。",
    "- QA：对类似题材提高开篇承诺、冲突强度和情绪回报的扣分敏感度。",
    "",
    "## 当前学习摘要",
    `Positive patterns: ${(learning.positive_patterns || []).length}`,
    `Negative patterns: ${(learning.negative_patterns || []).length}`,
    `QA calibration items: ${(learning.qa_calibration || []).length}`,
    "",
  ].join("\n");
  await writeFile(path.join(dir, `${date}-${storyId}-feedback.md`), text, "utf8");
}

function chooseSkill(genre, trend, index) {
  const matched = COMMERCIAL_SKILLS.filter((skill) => skill.use_when.some((keyword) => genre.includes(keyword)));
  return matched[index % matched.length] || COMMERCIAL_SKILLS[index % COMMERCIAL_SKILLS.length];
}

function buildTitle(trend, archetype, sequence) {
  const variants = Array.isArray(archetype.title_variants) && archetype.title_variants.length
    ? archetype.title_variants
    : [archetype.title_seed];
  const round = Math.floor((sequence - 1) / STORY_ARCHETYPES.length);
  return variants[round % variants.length];
}

function uniqueTitle(title, usedTitleKeys, trend, archetype, sequence) {
  const candidates = [
    title,
    `${title}，${shortTrendTail(trend.topic)}`,
    `${archetype.protagonist.replace(/^被/, "")}的第 ${sequence} 次反击`,
    `${shortTrendTail(trend.topic)}那天，${archetype.theme}`,
  ];
  for (const candidate of candidates) {
    const key = titleKey(candidate);
    if (!usedTitleKeys.has(key)) {
      usedTitleKeys.add(key);
      return candidate;
    }
  }
  const fallback = `${title}·${String(sequence).padStart(2, "0")}号证据`;
  usedTitleKeys.add(titleKey(fallback));
  return fallback;
}

function shortTrendTail(topic) {
  return String(topic || "关键证据")
    .replace(/工具|危机|压力|叙事|风险/g, "")
    .replace(/\s+/g, "")
    .slice(0, 8) || "关键证据";
}

function titleKey(value) {
  return String(value || "")
    .replace(/[《》“”"'`，。！？!?,.\s·：:、-]/g, "")
    .toLowerCase();
}

function inferAudience(genre) {
  if (genre.includes("女") || genre.includes("婚恋") || genre.includes("豪门")) return "女频爽感读者";
  if (genre.includes("规则") || genre.includes("悬疑")) return "悬疑反转读者";
  return "都市爽文读者";
}

function hasLearningForGenre(patterns, genre) {
  return (patterns || []).some((pattern) => String(pattern.genre || "").includes(genre) || genre.includes(String(pattern.genre || "")));
}

function upsertPattern(list, item) {
  const index = list.findIndex((existing) => existing.key === item.key);
  if (index >= 0) list.splice(index, 1);
  list.unshift(item);
  while (list.length > 20) list.pop();
}

function missingGenres(counts) {
  return STORY_ARCHETYPES.map((item) => item.type).filter((genre) => !counts[genre]);
}

function countBy(items, key) {
  return items.reduce((counts, item) => {
    const value = item[key] || "unknown";
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.floor(sorted.length / 2)];
}

function daysBetween(storyDate, runDate) {
  const a = parseDate(storyDate);
  const b = parseDate(runDate);
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.abs(Math.floor((b.getTime() - a.getTime()) / 86400000));
}

function parseDate(value) {
  const text = String(value || "");
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return new Date(`${compact[1]}-${compact[2]}-${compact[3]}T00:00:00Z`);
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateFromStory(storyId, createdAt) {
  const match = String(storyId || "").match(/^(\d{8})-/);
  if (match) return match[1];
  const date = parseDate(createdAt);
  if (!date) return "";
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}

function slugify(value, fallback) {
  const ascii = String(value || "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[-\s_]+/g, "-")
    .slice(0, 30)
    .replace(/^-+|-+$/g, "");
  return ascii || fallback;
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function nowIso() {
  return new Date().toISOString();
}

function shanghaiDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}${values.month}${values.day}`;
}

module.exports = {
  buildTodayStrategy,
  readTodayStrategy,
  selectCandidateForStory,
  updateFeedbackLearning,
};
