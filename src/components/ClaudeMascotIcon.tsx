import type { SVGProps } from "react";

export type ClaudeMascotVariant = "default" | "explain" | "debug" | "build";

interface ClaudeMascotIconProps extends SVGProps<SVGSVGElement> {
  variant?: ClaudeMascotVariant;
}

function MascotBody({ offsetY = 0 }: { offsetY?: number }) {
  return (
    <g transform={offsetY ? `translate(0 ${offsetY})` : undefined}>
      <path
        className="claude-mascot-body"
        d="M28 3h84v28h14v14h-14v14h-7v14H98V59h-7v14h-7V59H56v14h-7V59h-7v14h-7V59h-7V45H14V31h14V3Z"
      />
      <path className="claude-mascot-eye" d="M42 17h7v14h-7zM91 17h7v14h-7z" />
    </g>
  );
}

function ExplainProp() {
  return (
    <g aria-hidden="true">
      <path
        className="claude-mascot-prop-dark"
        d="M111 49h34l7 6 7-6h34v39h-31l-10 7-10-7h-31V49Z"
      />
      <path className="claude-mascot-prop-light" d="M116 43h28l8 7v36l-9-6h-27V43Z" />
      <path className="claude-mascot-prop-light" d="M188 43h-28l-8 7v36l9-6h27V43Z" />
      <path className="claude-mascot-prop-line" d="M122 54h18v5h-18zm0 12h18v5h-18zm42-12h18v5h-18zm0 12h18v5h-18z" />
    </g>
  );
}

function DebugProp() {
  return (
    <g aria-hidden="true">
      <path
        className="claude-mascot-prop-light"
        d="M128 29h28v7h8v28h-8v8h-28v-8h-8V36h8v-7Zm7 10h14v5h5v14h-5v5h-14v-5h-5V44h5v-5Z"
        fillRule="evenodd"
      />
      <path className="claude-mascot-prop-dark" d="m155 63 8-8 9 9-4 4 17 17-10 10-17-17-4 4-9-9 10-10Z" />
    </g>
  );
}

function BuildProp() {
  return (
    <g aria-hidden="true">
      <path
        className="claude-mascot-prop-dark"
        d="M145 31h10v16l7 7 7-7V31h10v22l-11 11v27h-19V65l-12-12V39h10v9l6 6 6-6V31h-14Z"
      />
      <path className="claude-mascot-prop-light" d="M169 7h8v12h12v8h-12v12h-8V27h-12v-8h12V7Z" />
    </g>
  );
}

export default function ClaudeMascotIcon({
  variant = "default",
  className,
  ...props
}: ClaudeMascotIconProps) {
  const hasProp = variant !== "default";
  const classes = ["claude-mascot", `claude-mascot-${variant}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <svg
      aria-hidden="true"
      className={classes}
      focusable="false"
      shapeRendering="crispEdges"
      viewBox={hasProp ? "0 0 194 96" : "0 0 140 78"}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <MascotBody offsetY={hasProp ? 8 : 0} />
      {variant === "explain" && <ExplainProp />}
      {variant === "debug" && <DebugProp />}
      {variant === "build" && <BuildProp />}
    </svg>
  );
}
