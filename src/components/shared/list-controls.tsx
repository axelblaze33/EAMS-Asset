import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { hrefWith, type SearchParams } from "@/lib/list-params";

export function SortableHead({
  label,
  column,
  sort,
  dir,
  pathname,
  sp,
  className,
}: {
  label: string;
  column: string;
  sort: string;
  dir: "asc" | "desc";
  pathname: string;
  sp: SearchParams;
  className?: string;
}) {
  const active = sort === column;
  const nextDir = active && dir === "asc" ? "desc" : "asc";
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link
        href={hrefWith(pathname, sp, { sort: column, dir: nextDir, page: undefined })}
        className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}
        scroll={false}
      >
        {label}
        <Icon className={cn("size-3.5", !active && "opacity-40")} />
      </Link>
    </TableHead>
  );
}

export function Pagination({
  total,
  page,
  pageSize,
  pathname,
  sp,
}: {
  total: number;
  page: number;
  pageSize: number;
  pathname: string;
  sp: SearchParams;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const link = (p: number, disabled: boolean, label: string, icon: React.ReactNode) =>
    disabled ? (
      <span className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }), "pointer-events-none opacity-50")} aria-disabled>
        {icon}
        <span className="sr-only">{label}</span>
      </span>
    ) : (
      <Link href={hrefWith(pathname, sp, { page: p === 1 ? undefined : p })} className={buttonVariants({ variant: "outline", size: "icon-sm" })} scroll={false}>
        {icon}
        <span className="sr-only">{label}</span>
      </Link>
    );

  return (
    <div className="flex items-center justify-between gap-4 px-1 text-sm text-muted-foreground">
      <span>
        {total === 0 ? "No results" : `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}`}
      </span>
      <div className="flex items-center gap-2">
        <span className="hidden sm:inline">
          Page {Math.min(page, pages)} of {pages}
        </span>
        {link(page - 1, page <= 1, "Previous page", <ChevronLeft />)}
        {link(page + 1, page >= pages, "Next page", <ChevronRight />)}
      </div>
    </div>
  );
}
