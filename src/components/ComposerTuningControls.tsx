import {
  Bot,
  Check,
  ChevronDown,
  Code2,
  Gauge,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatSession, EffortLevel, PermissionMode } from "../types";

export const modeInfo: Record<
  PermissionMode,
  { label: string; description: string; icon: typeof ShieldCheck }
> = {
  auto: {
    label: "自动",
    description: "Claude 根据任务判断并执行",
    icon: Zap,
  },
  plan: {
    label: "规划",
    description: "只分析和制定计划，不修改文件",
    icon: ShieldCheck,
  },
  acceptEdits: {
    label: "接受编辑",
    description: "自动允许文件编辑，其他操作仍遵循权限",
    icon: Code2,
  },
  dontAsk: {
    label: "不询问",
    description: "未预先允许的工具会直接拒绝",
    icon: Gauge,
  },
};

export const effortInfo: Record<
  EffortLevel,
  { label: string; shortLabel: string; description: string; level: number }
> = {
  "": {
    label: "自动",
    shortLabel: "自动",
    description: "跟随当前模型与供应商的默认强度",
    level: 0,
  },
  low: {
    label: "快速",
    shortLabel: "快速",
    description: "响应更快、更省 Token，适合简单任务",
    level: 1,
  },
  medium: {
    label: "省时",
    shortLabel: "省时",
    description: "在速度和分析深度之间取得平衡",
    level: 2,
  },
  high: {
    label: "标准",
    shortLabel: "标准",
    description: "适合大多数编码和排查任务",
    level: 3,
  },
  xhigh: {
    label: "深入",
    shortLabel: "深入",
    description: "投入更多思考，适合复杂任务",
    level: 4,
  },
  max: {
    label: "极致",
    shortLabel: "极致",
    description: "最高推理投入，同时会更慢、更耗 Token",
    level: 5,
  },
};

export const commonModels = [
  {
    value: "",
    label: "跟随 CC Switch",
    description: "使用 CC Switch 当前供应商的默认模型",
  },
  {
    value: "sonnet",
    label: "Claude Sonnet",
    description: "均衡的编码与推理能力",
  },
  {
    value: "opus",
    label: "Claude Opus",
    description: "复杂任务与深度分析",
  },
  {
    value: "haiku",
    label: "Claude Haiku",
    description: "轻量、快速的日常任务",
  },
  {
    value: "fable",
    label: "Claude Fable",
    description: "Claude Code 兼容模型别名",
  },
  {
    value: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    description: "常用的第三方供应商模型 ID",
  },
];

type OpenMenu = "model" | "effort" | "permission" | null;
const effortOrder = Object.keys(effortInfo) as EffortLevel[];

interface ComposerTuningControlsProps {
  session: ChatSession;
  disabled: boolean;
  onUpdate: (patch: Partial<ChatSession>) => Promise<void>;
}

function displayModel(session: ChatSession): string {
  const requested = (session.requestedModel ?? "").trim();
  if (!requested) return "跟随 CC Switch";
  return commonModels.find((option) => option.value === requested)?.label ?? requested;
}

function EffortGlyph({ level }: { level: number }) {
  return (
    <span className={`effort-glyph effort-level-${level}`} aria-hidden="true">
      {[1, 2, 3, 4, 5].map((bar) => (
        <i key={bar} />
      ))}
    </span>
  );
}

export default function ComposerTuningControls({
  session,
  disabled,
  onUpdate,
}: ComposerTuningControlsProps) {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [modelDraft, setModelDraft] = useState(session.requestedModel ?? "");
  const rootRef = useRef<HTMLDivElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);

  const modelOptions = useMemo(() => {
    const options = [...commonModels];
    for (const value of [session.requestedModel, session.activeModel]) {
      if (value && !options.some((option) => option.value === value)) {
        options.push({
          value,
          label: value,
          description:
            value === session.activeModel ? "当前实际运行模型" : "当前会话自定义模型",
        });
      }
    }
    return options;
  }, [session.activeModel, session.requestedModel]);

  useEffect(() => {
    if (!openMenu) setModelDraft(session.requestedModel ?? "");
  }, [openMenu, session.requestedModel]);

  useEffect(() => {
    if (!openMenu) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpenMenu(null);
      }
    };
    window.addEventListener("pointerdown", closeOnOutside);
    window.addEventListener("keydown", closeOnEscape, true);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutside);
      window.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [openMenu]);

  useEffect(() => {
    if (disabled) setOpenMenu(null);
  }, [disabled]);

  const toggleMenu = (menu: Exclude<OpenMenu, null>) => {
    if (disabled) return;
    setOpenMenu((current) => {
      const next = current === menu ? null : menu;
      if (next === "model") {
        setModelDraft(session.requestedModel ?? "");
        requestAnimationFrame(() => modelInputRef.current?.focus());
      }
      return next;
    });
  };

  const chooseModel = async (value: string) => {
    setModelDraft(value);
    await onUpdate({ requestedModel: value });
    setOpenMenu(null);
  };

  const applyCustomModel = async () => {
    await chooseModel(modelDraft.trim());
  };

  const chooseEffort = async (value: EffortLevel) => {
    await onUpdate({ effort: value });
    setOpenMenu(null);
  };

  const choosePermission = async (value: PermissionMode) => {
    await onUpdate({ permissionMode: value });
    setOpenMenu(null);
  };

  const PermissionIcon = modeInfo[session.permissionMode].icon;

  return (
    <div className="tuning-controls" ref={rootRef}>
      <div className="tuning-control-wrap model-control-wrap">
        <button
          type="button"
          className={`tuning-trigger ${openMenu === "model" ? "is-open" : ""}`}
          onClick={() => toggleMenu("model")}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              if (openMenu !== "model") toggleMenu("model");
            }
          }}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={openMenu === "model"}
          aria-controls="composer-model-picker"
          title="选择当前会话使用的模型"
        >
          <Bot size={15} />
          <span>{displayModel(session)}</span>
          <ChevronDown size={13} className="trigger-chevron" />
        </button>

        {openMenu === "model" && (
          <div
            id="composer-model-picker"
            className="tuning-popover model-popover"
            role="dialog"
            aria-label="选择模型"
          >
            <div className="tuning-popover-header">
              <span className="popover-icon model-icon">
                <Bot size={17} />
              </span>
              <span>
                <strong>选择模型</strong>
                <small>只影响当前会话，从下一条消息开始生效</small>
              </span>
            </div>

            <div className="model-custom-row">
              <Bot size={14} />
              <input
                ref={modelInputRef}
                value={modelDraft}
                onChange={(event) => setModelDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void applyCustomModel();
                  }
                }}
                placeholder="输入任意模型 ID，例如 deepseek-v4-pro"
                aria-label="自定义模型 ID"
              />
              <button
                type="button"
                onClick={() => void applyCustomModel()}
                disabled={modelDraft.trim() === (session.requestedModel ?? "")}
              >
                应用
              </button>
            </div>

            <div className="tuning-section-label">常用模型</div>
            <div className="tuning-option-list" role="listbox" aria-label="常用模型">
              {modelOptions.map((option) => {
                const selected = session.requestedModel === option.value;
                return (
                  <button
                    type="button"
                    className={`tuning-option model-option ${selected ? "selected" : ""}`}
                    key={option.value || "follow"}
                    data-value={option.value}
                    onClick={() => void chooseModel(option.value)}
                    role="option"
                    aria-selected={selected}
                  >
                    <span className="model-option-mark">
                      {option.value ? <Sparkles size={15} /> : <Zap size={15} />}
                    </span>
                    <span className="tuning-option-copy">
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </span>
                    {selected && <Check size={16} className="option-check" />}
                  </button>
                );
              })}
            </div>

            <div className="tuning-popover-footer">
              <span>实际运行</span>
              <strong>{session.activeModel || "等待首次回复"}</strong>
            </div>
          </div>
        )}
      </div>

      <div className="tuning-control-wrap effort-control-wrap">
        <button
          type="button"
          className={`tuning-trigger ${openMenu === "effort" ? "is-open" : ""}`}
          onClick={() => toggleMenu("effort")}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              if (openMenu !== "effort") toggleMenu("effort");
              return;
            }
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              const currentIndex = effortOrder.indexOf(session.effort);
              const direction = event.key === "ArrowRight" ? 1 : -1;
              const nextIndex = Math.min(
                effortOrder.length - 1,
                Math.max(0, currentIndex + direction),
              );
              if (nextIndex !== currentIndex) {
                void onUpdate({ effort: effortOrder[nextIndex] });
              }
            }
          }}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={openMenu === "effort"}
          aria-controls="composer-effort-picker"
          title={effortInfo[session.effort].description}
        >
          <Gauge size={15} />
          <span>{effortInfo[session.effort].shortLabel}</span>
          <ChevronDown size={13} className="trigger-chevron" />
        </button>

        {openMenu === "effort" && (
          <div
            id="composer-effort-picker"
            className="tuning-popover effort-popover"
            role="dialog"
            aria-label="推理强度"
          >
            <div className="tuning-popover-header">
              <span className="popover-icon effort-icon">
                <Gauge size={17} />
              </span>
              <span>
                <strong>推理强度</strong>
                <small>更高的强度通常更聪明，但回复会更慢</small>
              </span>
            </div>

            <div className="effort-scale" aria-hidden="true">
              <span>更快</span>
              <i />
              <span>更深入</span>
            </div>

            <div className="tuning-option-list" role="listbox" aria-label="推理强度">
              {(Object.entries(effortInfo) as [EffortLevel, (typeof effortInfo)[EffortLevel]][]).map(
                ([value, info]) => {
                  const selected = session.effort === value;
                  return (
                    <button
                      type="button"
                      className={`tuning-option effort-option ${selected ? "selected" : ""}`}
                      key={value || "default"}
                      data-value={value}
                      onClick={() => void chooseEffort(value)}
                      role="option"
                      aria-selected={selected}
                    >
                      <EffortGlyph level={info.level} />
                      <span className="tuning-option-copy">
                        <strong>{info.label}</strong>
                        <small>{info.description}</small>
                      </span>
                      {selected && <Check size={16} className="option-check" />}
                    </button>
                  );
                },
              )}
            </div>

            <div className="tuning-popover-note">
              <Zap size={13} />
              这是思考投入，不是网络下载速度。
            </div>
          </div>
        )}
      </div>

      <div className="tuning-control-wrap permission-control-wrap">
        <button
          type="button"
          className={`tuning-trigger ${openMenu === "permission" ? "is-open" : ""}`}
          onClick={() => toggleMenu("permission")}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              if (openMenu !== "permission") toggleMenu("permission");
            }
          }}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={openMenu === "permission"}
          aria-controls="composer-permission-picker"
          title={modeInfo[session.permissionMode].description}
        >
          <PermissionIcon size={15} />
          <span>{modeInfo[session.permissionMode].label}</span>
          <ChevronDown size={13} className="trigger-chevron" />
        </button>

        {openMenu === "permission" && (
          <div
            id="composer-permission-picker"
            className="tuning-popover permission-popover"
            role="dialog"
            aria-label="权限模式"
          >
            <div className="tuning-popover-header">
              <span className="popover-icon permission-icon">
                <ShieldCheck size={17} />
              </span>
              <span>
                <strong>权限模式</strong>
                <small>控制 Claude Code 在当前项目中可以执行的操作</small>
              </span>
            </div>

            <div className="tuning-option-list permission-option-list" role="listbox" aria-label="权限模式">
              {(Object.entries(modeInfo) as [PermissionMode, (typeof modeInfo)[PermissionMode]][]).map(
                ([value, info]) => {
                  const selected = session.permissionMode === value;
                  const Icon = info.icon;
                  return (
                    <button
                      type="button"
                      className={`tuning-option permission-option ${selected ? "selected" : ""}`}
                      key={value}
                      data-value={value}
                      onClick={() => void choosePermission(value)}
                      role="option"
                      aria-selected={selected}
                    >
                      <span className="permission-option-mark">
                        <Icon size={15} />
                      </span>
                      <span className="tuning-option-copy">
                        <strong>{info.label}</strong>
                        <small>{info.description}</small>
                      </span>
                      {selected && <Check size={16} className="option-check" />}
                    </button>
                  );
                },
              )}
            </div>

            <div className="tuning-popover-note permission-note">
              <ShieldCheck size={13} />
              权限选择只影响当前会话，从下一条消息开始生效。
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
