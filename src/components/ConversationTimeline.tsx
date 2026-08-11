import { useEffect, useMemo, useRef } from "react";
import type { ChatMessage, MessageStatus } from "../types";

interface ConversationTimelineProps {
  messages: ChatMessage[];
  activeMessageId?: string;
  onSelect(id: string): void;
}

type TimelineStatus = "running" | "complete" | "queued" | "error" | "stopped";

interface TimelineTurn {
  id: string;
  fullTopic: string;
  topic: string;
  createdAt: string;
  time: string;
  status: TimelineStatus;
  statusLabel: string;
}

type TopicMessage = ChatMessage & { topic?: string };

const STATUS_LABELS: Record<TimelineStatus, string> = {
  running: "进行中",
  complete: "已完成",
  queued: "排队",
  error: "失败",
  stopped: "已停止",
};

function graphemes(value: string): string[] {
  const Segmenter = (
    Intl as unknown as {
      Segmenter?: new (
        locale?: string,
        options?: { granularity: "grapheme" },
      ) => { segment(input: string): Iterable<{ segment: string }> };
    }
  ).Segmenter;

  if (!Segmenter) return Array.from(value);
  return Array.from(
    new Segmenter("zh-CN", { granularity: "grapheme" }).segment(value),
    (part) => part.segment,
  );
}

function truncateTopic(value: string, maximum = 22): string {
  const parts = graphemes(value);
  return parts.length > maximum ? `${parts.slice(0, maximum).join("")}…` : value;
}

function fallbackTopic(content: string): string {
  const firstLine = content
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  const firstSentence = (firstLine ?? content)
    .replace(/^(?:#{1,6}|>|[-*+]\s|\d+[.)、]\s*)\s*/, "")
    .split(/[。！？!?；;]/u, 1)[0]
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:(?:现在|接下来|然后|另外|还有)\s*[，,、:：]?\s*)+/u, "")
    .replace(/^(?:请(?:你)?|麻烦(?:你)?|帮我|我想(?:要)?|我希望)\s*/u, "")
    .replace(/^[，,、:：\s]+|[，,、:：\s]+$/gu, "")
    .trim();

  return firstSentence || "未命名阶段";
}

function topicFor(message: ChatMessage): { full: string; short: string } {
  const explicitTopic = (message as TopicMessage).topic?.replace(/\s+/g, " ").trim();
  const full = explicitTopic || fallbackTopic(message.content);
  return { full, short: truncateTopic(full) };
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  const pad = (part: number) => String(part).padStart(2, "0");
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? time
    : `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`;
}

function timelineStatus(status: MessageStatus): TimelineStatus {
  if (status === "streaming") return "running";
  return status;
}

function inferStatus(messages: ChatMessage[], userIndex: number): TimelineStatus {
  const user = messages[userIndex];
  if (user.status !== "complete") return timelineStatus(user.status);

  for (let index = userIndex + 1; index < messages.length; index += 1) {
    const adjacent = messages[index];
    if (adjacent.role === "user") break;
    if (adjacent.toolCalls?.some((tool) => tool.status === "running")) return "running";
    return timelineStatus(adjacent.status);
  }

  return "complete";
}

export default function ConversationTimeline({
  messages,
  activeMessageId,
  onSelect,
}: ConversationTimelineProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const activeItemRef = useRef<HTMLLIElement>(null);
  const turns = useMemo<TimelineTurn[]>(
    () =>
      messages.flatMap((message, index) => {
        if (message.role !== "user") return [];
        const topic = topicFor(message);
        const status = inferStatus(messages, index);
        return [
          {
            id: message.id,
            fullTopic: topic.full,
            topic: topic.short,
            createdAt: message.createdAt,
            time: formatTime(message.createdAt),
            status,
            statusLabel: STATUS_LABELS[status],
          },
        ];
      }),
    [messages],
  );

  const currentTurn =
    turns.find((turn) => turn.id === activeMessageId) ?? turns.at(-1);

  useEffect(() => {
    const list = listRef.current;
    const activeItem = activeItemRef.current;
    if (!currentTurn || !list || !activeItem) return;

    const keepActiveItemVisible = () => {
      const listBounds = list.getBoundingClientRect();
      const itemBounds = activeItem.getBoundingClientRect();
      if (itemBounds.top >= listBounds.top && itemBounds.bottom <= listBounds.bottom) return;

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      activeItem.scrollIntoView({
        block: "nearest",
        behavior: reducedMotion ? "auto" : "smooth",
      });
    };

    keepActiveItemVisible();
    const resizeObserver = new ResizeObserver(keepActiveItemVisible);
    resizeObserver.observe(list);
    return () => resizeObserver.disconnect();
  }, [currentTurn?.id, turns.length]);

  if (!currentTurn) return null;

  return (
    <nav
      className="conversation-timeline"
      aria-label="对话时间线"
      title={`当前阶段：${currentTurn.fullTopic}`}
    >
      <div className="timeline-header">
        <span>对话时间线</span>
        <small>{turns.length} 个阶段</small>
      </div>
      <ol className="timeline-list" ref={listRef}>
        {turns.map((turn) => {
          const isActive = turn.id === currentTurn.id;
          return (
            <li
              className={`timeline-item timeline-${turn.status}${isActive ? " is-active" : ""}`}
              key={turn.id}
              ref={isActive ? activeItemRef : undefined}
            >
              <button
                className="timeline-button"
                type="button"
                title={`${turn.time} · ${turn.fullTopic} · ${turn.statusLabel}`}
                aria-label={`${turn.time}，${turn.fullTopic}，${turn.statusLabel}`}
                aria-current={isActive ? "step" : undefined}
                onClick={() => onSelect(turn.id)}
              >
                <span className="timeline-rail" aria-hidden="true">
                  <span className="timeline-dot" />
                </span>
                <span className="timeline-copy">
                  <span className="timeline-topic">{turn.topic}</span>
                  <span className="timeline-meta">
                    <time className="timeline-time" dateTime={turn.createdAt}>
                      {turn.time}
                    </time>
                    <span className="timeline-status">{turn.statusLabel}</span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
