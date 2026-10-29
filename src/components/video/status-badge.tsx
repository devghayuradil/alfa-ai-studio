import { CheckCircle2, CircleSlash, Clock, Loader2, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "@/lib/client/format";
import type { TaskStatus } from "@/types/video";

const VARIANTS = {
  queued: { variant: "info", Icon: Clock, spin: false },
  running: { variant: "default", Icon: Loader2, spin: true },
  succeeded: { variant: "success", Icon: CheckCircle2, spin: false },
  failed: { variant: "destructive", Icon: XCircle, spin: false },
  cancelled: { variant: "outline", Icon: CircleSlash, spin: false },
} as const;

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  const { variant, Icon, spin } = VARIANTS[status];
  return (
    <Badge variant={variant} className={className}>
      <Icon className={spin ? "animate-spin" : undefined} />
      {STATUS_LABELS[status]}
    </Badge>
  );
}
