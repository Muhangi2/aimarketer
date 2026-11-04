import type { PostStatus } from "@/lib/posts/types"

/* How each post status looks on the calendar: badge, card accent and dot. */
export const STATUS_STYLE: Record<PostStatus, { label: string; badge: string; accent: string; dot: string }> = {
  draft: { label: "Draft", badge: "bg-slate-500/12 text-slate-700 dark:text-slate-300", accent: "border-l-slate-400", dot: "bg-slate-400" },
  approved: { label: "Approved", badge: "bg-sky-500/12 text-sky-700 dark:text-sky-300", accent: "border-l-sky-500", dot: "bg-sky-500" },
  pending: { label: "Pending", badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300", accent: "border-l-amber-500", dot: "bg-amber-500" },
  scheduled: { label: "Scheduled", badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300", accent: "border-l-amber-500", dot: "bg-amber-500" },
  publishing: { label: "Publishing…", badge: "bg-sky-500/12 text-sky-700 dark:text-sky-300", accent: "border-l-sky-500", dot: "bg-sky-500" },
  published: { label: "Published", badge: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300", accent: "border-l-emerald-500", dot: "bg-emerald-500" },
  failed: { label: "Failed", badge: "bg-destructive/10 text-destructive", accent: "border-l-destructive", dot: "bg-destructive" },
  archived: { label: "Archived", badge: "bg-muted text-muted-foreground", accent: "border-l-muted-foreground", dot: "bg-muted-foreground" },
}
