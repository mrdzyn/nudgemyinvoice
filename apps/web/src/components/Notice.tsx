import type { ReactNode } from "react";

type Kind = "info" | "warn" | "err" | "ok" | "ai";

export function Notice({
  kind,
  role,
  icon,
  className,
  children,
  id,
}: {
  kind: Kind;
  role?: "alert" | "status" | "note" | "region";
  icon?: string;
  className?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <div id={id} className={`notice notice-${kind}${className ? ` ${className}` : ""}`} role={role}>
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      <div>{children}</div>
    </div>
  );
}
