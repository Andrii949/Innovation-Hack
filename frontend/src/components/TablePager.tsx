import { cn } from "cn";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { pageLabel, pageWindow } from "@/lib/table";

/** Footer for a paged table: visible range, page numbers, previous/next. */
export function TablePager({
  page,
  pageCount,
  pageSize,
  total,
  onPageChange,
  className,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  if (total === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 pt-3 text-xs text-muted-foreground",
        className,
      )}
    >
      <span className="tabular-nums">{pageLabel(page, pageSize, total)}</span>
      {pageCount > 1 && (
        <Pagination className="mx-0 w-auto justify-start sm:justify-end">
          <PaginationContent>
            <PaginationItem>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Poprzednia strona"
                disabled={page <= 1}
                onClick={() => {
                  onPageChange(page - 1);
                }}
              >
                <ChevronLeft aria-hidden />
              </Button>
            </PaginationItem>
            {pageWindow(page, pageCount).map((entry, index) =>
              entry === "gap" ? (
                <PaginationItem key={`gap-${String(index)}`}>
                  <span className="hidden px-1 text-muted-foreground sm:inline" aria-hidden>
                    …
                  </span>
                </PaginationItem>
              ) : (
                <PaginationItem key={entry}>
                  <Button
                    type="button"
                    variant={entry === page ? "outline" : "ghost"}
                    size="icon-sm"
                    className="hidden tabular-nums sm:inline-flex"
                    aria-label={`Strona ${entry}`}
                    aria-current={entry === page ? "page" : undefined}
                    onClick={() => {
                      onPageChange(entry);
                    }}
                  >
                    {entry}
                  </Button>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <span className="px-1 tabular-nums sm:hidden">
                {page} / {pageCount}
              </span>
            </PaginationItem>
            <PaginationItem>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Następna strona"
                disabled={page >= pageCount}
                onClick={() => {
                  onPageChange(page + 1);
                }}
              >
                <ChevronRight aria-hidden />
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
