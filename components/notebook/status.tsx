import {
  FileTextIcon,
  GlobeIcon,
  Loader2Icon,
  CheckCircle2Icon,
  AlertCircleIcon,
  ClapperboardIcon,
  CaptionsIcon,
  UploadCloudIcon,
  StickyNoteIcon,
  MailIcon,
  CalendarIcon,
  FolderIcon,
  PlugIcon,
} from "lucide-react";
import type { SourceStatus, SourceType } from "@/lib/types";
import { cn } from "@/lib/utils";

export function sourceIcon(type: SourceType) {
  if (type === "pdf") return FileTextIcon;
  if (type === "website") return GlobeIcon;
  if (type === "youtube") return ClapperboardIcon;
  if (type === "transcript") return CaptionsIcon;
  if (type === "text") return StickyNoteIcon;
  if (type === "email") return MailIcon;
  if (type === "calendar") return CalendarIcon;
  if (type === "drive") return FolderIcon;
  if (type === "mcp") return PlugIcon;
  return FileTextIcon;
}

export function StatusPip({ status, className }: { status: SourceStatus; className?: string }) {
  if (status === "ready") {
    return <CheckCircle2Icon className={cn("size-3.5 text-emerald-600 dark:text-emerald-400", className)} />;
  }
  if (status === "error") {
    return <AlertCircleIcon className={cn("size-3.5 text-destructive", className)} />;
  }
  if (status === "uploading") {
    return <UploadCloudIcon className={cn("size-3.5 text-chai", className)} />;
  }
  return (
    <span className={cn("relative grid size-3.5 place-items-center", className)}>
      <span className="absolute inset-0 rounded-full bg-saffron/50 animate-pulse-ring" />
      <Loader2Icon className="size-3.5 animate-spin text-saffron" />
    </span>
  );
}

export function statusLabel(status: SourceStatus) {
  if (status === "uploading") return "Uploading";
  if (status === "extracting") return "Extracting";
  if (status === "indexing") return "Indexing";
  if (status === "ready") return "Ready";
  return "Needs attention";
}
