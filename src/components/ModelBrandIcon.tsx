import { Bot, Shuffle } from "lucide-react";

export type ModelIconKind =
  | "follow"
  | "anthropic"
  | "deepseek"
  | "openai"
  | "gemini"
  | "qwen"
  | "zhipu"
  | "kimi"
  | "minimax"
  | "doubao"
  | "mistral"
  | "cohere"
  | "xai"
  | "hunyuan"
  | "xiaomi"
  | "stepfun"
  | "custom";

export interface ModelDefinition {
  value: string;
  label: string;
  description: string;
  kind: ModelIconKind;
}

export const modelDefinitions: ModelDefinition[] = [
  {
    value: "",
    label: "跟随 CC Switch",
    description: "使用 CC Switch 当前供应商的默认模型",
    kind: "follow",
  },
  {
    value: "sonnet",
    label: "Claude Sonnet",
    description: "Claude Code 的 Sonnet 角色别名",
    kind: "anthropic",
  },
  {
    value: "opus",
    label: "Claude Opus",
    description: "Claude Code 的 Opus 角色别名",
    kind: "anthropic",
  },
  {
    value: "haiku",
    label: "Claude Haiku",
    description: "Claude Code 的 Haiku 角色别名",
    kind: "anthropic",
  },
  {
    value: "fable",
    label: "Claude Fable",
    description: "Claude Code 的 Fable 角色别名",
    kind: "anthropic",
  },
  {
    value: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    description: "DeepSeek V4 Flash 官方模型 ID",
    kind: "deepseek",
  },
];

const providerLabels: Record<ModelIconKind, string> = {
  follow: "CC Switch",
  anthropic: "Anthropic / Claude",
  deepseek: "DeepSeek",
  openai: "OpenAI / GPT / Codex",
  gemini: "Google Gemini",
  qwen: "阿里云 Qwen",
  zhipu: "智谱 GLM",
  kimi: "Moonshot Kimi",
  minimax: "MiniMax",
  doubao: "字节豆包",
  mistral: "Mistral AI",
  cohere: "Cohere",
  xai: "xAI Grok",
  hunyuan: "腾讯混元",
  xiaomi: "小米 MiMo",
  stepfun: "阶跃星辰 StepFun",
  custom: "其他 / 自定义",
};

const iconAssetKinds = new Set<ModelIconKind>([
  "anthropic",
  "deepseek",
  "openai",
  "gemini",
  "qwen",
  "zhipu",
  "kimi",
  "minimax",
  "doubao",
  "mistral",
  "cohere",
  "xai",
  "hunyuan",
  "xiaomi",
  "stepfun",
]);

const monochromeKinds = new Set<ModelIconKind>([
  "openai",
  "xai",
  "xiaomi",
  "kimi",
]);

export function modelIconKind(value?: string, provider?: string): ModelIconKind {
  const providerValue = (provider ?? "").trim().toLowerCase() as ModelIconKind;
  if (iconAssetKinds.has(providerValue)) return providerValue;

  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return "follow";
  const exact = modelDefinitions.find((model) => model.value === normalized);
  if (exact) return exact.kind;
  if (normalized.includes("claude")) return "anthropic";
  if (normalized.includes("deepseek")) return "deepseek";
  if (/\b(?:gpt|codex|openai|o[134](?:-|\b))/.test(normalized)) return "openai";
  if (normalized.includes("gemini")) return "gemini";
  if (normalized.includes("qwen") || normalized.includes("qwq")) return "qwen";
  if (normalized.includes("glm")) return "zhipu";
  if (normalized.includes("kimi") || /^k[23]\b/.test(normalized)) return "kimi";
  if (normalized.includes("minimax")) return "minimax";
  if (normalized.includes("doubao")) return "doubao";
  if (
    normalized.includes("mistral") ||
    normalized.includes("codestral") ||
    normalized.includes("devstral") ||
    normalized.includes("magistral")
  ) {
    return "mistral";
  }
  if (normalized.includes("command-") || normalized.includes("cohere")) return "cohere";
  if (normalized.includes("grok")) return "xai";
  if (normalized.includes("hunyuan") || /^hy3\b/.test(normalized)) return "hunyuan";
  if (normalized.includes("mimo")) return "xiaomi";
  if (normalized.includes("step-")) return "stepfun";
  return "custom";
}

export function modelProviderLabel(kind: ModelIconKind): string {
  return providerLabels[kind];
}

export function modelLabel(value?: string): string {
  const normalized = (value ?? "").trim();
  if (!normalized) return modelDefinitions[0].label;
  return modelDefinitions.find((model) => model.value === normalized.toLowerCase())?.label ?? normalized;
}

export default function ModelBrandIcon({
  model,
  provider,
  size = 15,
}: {
  model?: string;
  provider?: string;
  size?: number;
}) {
  const kind = modelIconKind(model, provider);
  if (kind === "follow" || kind === "custom") {
    const Icon = kind === "follow" ? Shuffle : Bot;
    return (
      <span className={`model-brand-icon model-brand-${kind}`} aria-hidden="true">
        <Icon size={size} strokeWidth={1.9} />
      </span>
    );
  }

  const assetName =
    kind === "anthropic" ? "claude" : kind === "xiaomi" ? "xiaomimimo" : kind;
  const assetUrl = `./model-icons/${assetName}.svg`;
  return (
    <span
      className={`model-brand-icon model-brand-${kind}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {monochromeKinds.has(kind) ? (
        <i
          className="model-brand-mask"
          style={{
            WebkitMaskImage: `url("${assetUrl}")`,
            maskImage: `url("${assetUrl}")`,
          }}
        />
      ) : (
        <img src={assetUrl} alt="" width={size} height={size} />
      )}
    </span>
  );
}
