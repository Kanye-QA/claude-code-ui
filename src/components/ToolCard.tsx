import {
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  FileCode2,
  Search,
  TerminalSquare,
  Wrench,
  XCircle,
} from "lucide-react";
import type { ToolCall } from "../types";

function iconFor(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes("bash") || normalized.includes("powershell")) {
    return <TerminalSquare size={16} />;
  }
  if (["read", "write", "edit", "notebookedit"].some((item) => normalized.includes(item))) {
    return <FileCode2 size={16} />;
  }
  if (["grep", "glob", "search", "webfetch"].some((item) => normalized.includes(item))) {
    return <Search size={16} />;
  }
  return <Wrench size={16} />;
}

function summaryFor(input: unknown): string {
  if (!input || typeof input !== "object") return String(input ?? "");
  const value = input as Record<string, unknown>;
  const summary =
    value.file_path ??
    value.path ??
    value.command ??
    value.pattern ??
    value.query ??
    value.description ??
    value.url;
  if (typeof summary === "string") {
    return summary.length > 110 ? `${summary.slice(0, 110)}…` : summary;
  }
  return "";
}

function pretty(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function ToolCard({ tool }: { tool: ToolCall }) {
  return (
    <details className={`tool-card tool-${tool.status}`}>
      <summary>
        <span className="tool-icon">{iconFor(tool.name)}</span>
        <span className="tool-title">
          <strong>{tool.name}</strong>
          <span>{summaryFor(tool.input)}</span>
        </span>
        <span className="tool-status">
          {tool.status === "running" ? (
            <CircleDashed className="spin" size={15} />
          ) : tool.status === "success" ? (
            <CheckCircle2 size={15} />
          ) : (
            <XCircle size={15} />
          )}
        </span>
        <ChevronDown className="tool-chevron" size={15} />
      </summary>
      <div className="tool-detail">
        <div>
          <span className="tool-label">输入</span>
          <pre>{pretty(tool.input)}</pre>
        </div>
        {tool.output && (
          <div>
            <span className="tool-label">结果</span>
            <pre>{tool.output}</pre>
          </div>
        )}
      </div>
    </details>
  );
}
