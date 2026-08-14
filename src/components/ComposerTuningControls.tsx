import {
  Bot,
  Check,
  ChevronDown,
  Code2,
  Gauge,
  Info,
  Search,
  ShieldCheck,
  Zap,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type {
  ChatSession,
  EffortLevel,
  ModelCatalogEntry,
  PermissionMode,
} from "../types";
import ModelBrandIcon, {
  modelDefinitions,
  modelIconKind,
  modelLabel,
  modelProviderLabel,
  type ModelIconKind,
} from "./ModelBrandIcon";

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

export const commonModels = modelDefinitions;

type OpenMenu = "model" | "effort" | "permission" | null;
const effortOrder = Object.keys(effortInfo) as EffortLevel[];

interface ComposerTuningControlsProps {
  session: ChatSession;
  modelCatalog: ModelCatalogEntry[];
  disabled: boolean;
  onUpdate: (patch: Partial<ChatSession>) => Promise<void>;
}

function displayModel(session: ChatSession): string {
  const actual = (session.activeModel ?? "").trim();
  const requested = (session.requestedModel ?? "").trim();
  return modelLabel(actual || requested);
}

export function EffortGlyph({ level }: { level: number }) {
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
  modelCatalog,
  disabled,
  onUpdate,
}: ComposerTuningControlsProps) {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [modelDraft, setModelDraft] = useState(session.requestedModel ?? "");
  const [modelSearch, setModelSearch] = useState("");
  const [expandedProvider, setExpandedProvider] = useState<ModelIconKind | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const modelSearchRef = useRef<HTMLInputElement>(null);
  const modelTriggerRef = useRef<HTMLButtonElement>(null);
  const effortTriggerRef = useRef<HTMLButtonElement>(null);
  const permissionTriggerRef = useRef<HTMLButtonElement>(null);

  const restoreTriggerFocus = (menu: Exclude<OpenMenu, null>) => {
    window.requestAnimationFrame(() => {
      const trigger =
        menu === "model"
          ? modelTriggerRef.current
          : menu === "effort"
            ? effortTriggerRef.current
            : permissionTriggerRef.current;
      if (trigger && !trigger.disabled) trigger.focus();
    });
  };

  const closeMenu = (menu: Exclude<OpenMenu, null>, restoreFocus = false) => {
    setOpenMenu(null);
    if (restoreFocus) restoreTriggerFocus(menu);
  };

  const modelOptions = useMemo(() => {
    const options = new Map<
      string,
      { value: string; label: string; description: string; provider: ModelIconKind }
    >();
    for (const option of commonModels) {
      options.set(option.value, { ...option, provider: option.kind });
    }
    for (const model of modelCatalog) {
      options.set(model.id, {
        value: model.id,
        label: model.name,
        description: model.id,
        provider: modelIconKind(model.id, model.provider),
      });
    }
    for (const value of [session.requestedModel, session.activeModel]) {
      if (value && !options.has(value)) {
        options.set(value, {
          value,
          label: value,
          description:
            value === session.activeModel ? "当前实际运行模型" : "当前会话自定义模型",
          provider: modelIconKind(value),
        });
      }
    }
    return [...options.values()];
  }, [modelCatalog, session.activeModel, session.requestedModel]);

  const groupedModelOptions = useMemo(() => {
    const query = modelSearch.trim().toLowerCase();
    const groups = new Map<ModelIconKind, typeof modelOptions>();
    for (const option of modelOptions) {
      if (option.provider === "follow") continue;
      const providerLabel = modelProviderLabel(option.provider);
      if (
        query &&
        !`${option.label} ${option.value} ${providerLabel}`.toLowerCase().includes(query)
      ) {
        continue;
      }
      const group = groups.get(option.provider) ?? [];
      group.push(option);
      groups.set(option.provider, group);
    }
    const order: ModelIconKind[] = [
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
      "custom",
    ];
    return order.flatMap((provider) => {
      const options = groups.get(provider);
      return options?.length ? [{ provider, options }] : [];
    });
  }, [modelOptions, modelSearch]);

  const followOption = modelOptions.find((option) => option.provider === "follow");
  const isSearchingModels = modelSearch.trim().length > 0;
  const matchingModelCount = groupedModelOptions.reduce(
    (count, group) => count + group.options.length,
    0,
  );

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
        event.preventDefault();
        event.stopPropagation();
        closeMenu(openMenu, true);
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
    if (!openMenu) return;
    const frame = window.requestAnimationFrame(() => {
      if (openMenu === "model") {
        modelSearchRef.current?.focus();
        return;
      }
      rootRef.current
        ?.querySelector<HTMLButtonElement>(
          `#composer-${openMenu}-picker .tuning-option.selected`,
        )
        ?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
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
        setModelSearch("");
        setExpandedProvider(null);
      }
      return next;
    });
  };

  const chooseModel = async (value: string) => {
    setModelDraft(value);
    await onUpdate({ requestedModel: value });
    closeMenu("model", true);
  };

  const applyCustomModel = async () => {
    await chooseModel(modelDraft.trim());
  };

  const chooseEffort = async (value: EffortLevel) => {
    await onUpdate({ effort: value });
    closeMenu("effort", true);
  };

  const choosePermission = async (value: PermissionMode) => {
    await onUpdate({ permissionMode: value });
    closeMenu("permission", true);
  };

  const onProviderKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    provider: ModelIconKind,
  ) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setExpandedProvider(provider);
      return;
    }
    if (event.key === "ArrowLeft") {
      if (expandedProvider === provider) {
        event.preventDefault();
        setExpandedProvider(null);
      }
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;

    const triggers = Array.from(
      rootRef.current?.querySelectorAll<HTMLButtonElement>(".model-provider-trigger") ?? [],
    );
    const currentIndex = triggers.indexOf(event.currentTarget);
    if (currentIndex < 0 || !triggers.length) return;
    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? triggers.length - 1
          : (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + triggers.length) %
            triggers.length;
    triggers[nextIndex]?.focus();
  };

  const PermissionIcon = modeInfo[session.permissionMode].icon;

  const renderModelOption = (
    option: (typeof modelOptions)[number],
    extraClassName = "",
  ) => {
    const selected = session.requestedModel === option.value;
    return (
      <button
        type="button"
        className={`tuning-option model-option ${extraClassName} ${selected ? "selected" : ""}`.trim()}
        key={option.value || "follow"}
        data-value={option.value}
        onClick={() => void chooseModel(option.value)}
        aria-pressed={selected}
      >
        <span className="model-option-mark">
          <ModelBrandIcon model={option.value} provider={option.provider} size={16} />
        </span>
        <span className="tuning-option-copy">
          <strong>{option.label}</strong>
          <small>{option.description}</small>
        </span>
        {selected && <Check size={16} className="option-check" />}
      </button>
    );
  };

  return (
    <div className="tuning-controls" ref={rootRef}>
      <div className="tuning-control-wrap model-control-wrap">
        <button
          ref={modelTriggerRef}
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
          aria-haspopup="dialog"
          aria-expanded={openMenu === "model"}
          aria-controls="composer-model-picker"
          title="选择当前会话使用的模型"
        >
          <ModelBrandIcon
            model={session.activeModel || session.requestedModel}
            provider={modelCatalog.find((model) => model.id === (session.activeModel || session.requestedModel))?.provider}
            size={15}
          />
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
                <small>
                  {modelCatalog.length
                    ? `已加载内置模型目录，共 ${modelCatalog.length} 个模型`
                    : "可输入任意模型 ID；当前目录为空"}
                </small>
              </span>
            </div>

            <div className="model-custom-row">
              <Bot size={14} />
              <input
                value={modelDraft}
                onChange={(event) => setModelDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void applyCustomModel();
                  }
                }}
                placeholder="输入任意模型 ID，例如 deepseek-v4-flash"
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

            <label className="model-search-row">
              <Search size={14} />
              <input
                ref={modelSearchRef}
                value={modelSearch}
                onChange={(event) => setModelSearch(event.target.value)}
                placeholder="搜索模型名称、ID 或供应商"
                aria-label="搜索模型目录"
              />
              {modelSearch && (
                <button type="button" onClick={() => setModelSearch("")} aria-label="清空搜索">
                  ×
                </button>
              )}
            </label>

            <div className="tuning-section-label">
              {isSearchingModels
                ? `搜索结果 · ${matchingModelCount}`
                : `模型供应商 · ${groupedModelOptions.length}`}
            </div>
            <div className="tuning-option-list model-catalog-list" aria-label="内置模型库">
              {followOption && (
                <div className="model-follow-shortcut" role="group" aria-label="Claude Code 配置快捷选项">
                  {renderModelOption(followOption, "model-follow-option")}
                </div>
              )}

              {isSearchingModels ? (
                <div className="model-search-results" role="group" aria-label="模型搜索结果">
                  {groupedModelOptions.flatMap((group) =>
                    group.options.map((option) => renderModelOption(option)),
                  )}
                  {!groupedModelOptions.length && (
                    <div className="model-search-empty">
                      没有匹配的模型；也可以在上方直接输入模型 ID。
                    </div>
                  )}
                </div>
              ) : (
                groupedModelOptions.map((group) => {
                  const expanded = expandedProvider === group.provider;
                  const panelId = `composer-model-provider-${group.provider}`;
                  const hasSelection = group.options.some(
                    (option) => session.requestedModel === option.value,
                  );
                  return (
                    <section
                      className={`model-provider-group ${hasSelection ? "has-selection" : ""}`}
                      key={group.provider}
                    >
                      <button
                        type="button"
                        className={`model-provider-heading model-provider-trigger ${expanded ? "is-expanded" : ""}`}
                        onClick={() =>
                          setExpandedProvider((current) =>
                            current === group.provider ? null : group.provider,
                          )
                        }
                        onKeyDown={(event) => onProviderKeyDown(event, group.provider)}
                        aria-expanded={expanded}
                        aria-controls={panelId}
                      >
                        <ModelBrandIcon provider={group.provider} size={13} />
                        <span>{modelProviderLabel(group.provider)}</span>
                        <small className="model-provider-count">{group.options.length}</small>
                        <ChevronDown size={13} className="model-provider-chevron" />
                      </button>
                      {expanded && (
                        <div
                          id={panelId}
                          className="model-provider-options"
                          role="group"
                          aria-label={`${modelProviderLabel(group.provider)} 模型`}
                        >
                          {group.options.map((option) => renderModelOption(option))}
                        </div>
                      )}
                    </section>
                  );
                })
              )}
            </div>

            <div className="tuning-popover-note model-catalog-note">
              <Info size={13} />
              名称与图标来自内置品牌目录；是否可调用由当前供应商决定。
            </div>

            <div className="tuning-popover-footer">
              <span>实际运行</span>
              <strong>
                {session.activeModel
                  ? modelCatalog.find((model) => model.id === session.activeModel)?.name ??
                    modelLabel(session.activeModel)
                  : "等待下次回复确认"}
              </strong>
            </div>
          </div>
        )}
      </div>

      <div className="tuning-control-wrap effort-control-wrap">
        <button
          ref={effortTriggerRef}
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
          aria-haspopup="dialog"
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

            <div className="tuning-option-list" role="group" aria-label="推理强度">
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
                      aria-pressed={selected}
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
          ref={permissionTriggerRef}
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
          aria-haspopup="dialog"
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

            <div className="tuning-option-list permission-option-list" role="group" aria-label="权限模式">
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
                      aria-pressed={selected}
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
