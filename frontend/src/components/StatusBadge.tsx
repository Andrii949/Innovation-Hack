import { cn } from "cn";

import type { Status } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { statusBadgeClass, statusDotClass, statusLabel } from "@/lib/status";

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <Badge variant="outline" className={cn(statusBadgeClass(status), className)}>
      <span className={`size-1.5 rounded-full ${statusDotClass(status)}`} aria-hidden />
      {statusLabel(status)}
    </Badge>
  );
}
