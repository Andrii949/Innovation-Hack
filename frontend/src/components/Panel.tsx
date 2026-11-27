import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function Panel({
  title,
  description,
  children,
  id,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <Card
      id={id}
      size="sm"
      className="min-w-0 gap-0 overflow-hidden rounded-2xl border bg-card py-0 shadow-sm ring-0"
    >
      <CardHeader className="border-b bg-muted/30 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <span
            className="flex h-3.5 w-1 shrink-0 flex-col overflow-hidden rounded-[1px]"
            aria-hidden
          >
            <span className="h-1/2 bg-brand-lime" />
            <span className="h-1/2 bg-brand-navy" />
          </span>
          <CardTitle>{title}</CardTitle>
        </div>
        {description !== undefined && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="px-4 py-4 sm:px-5">{children}</CardContent>
    </Card>
  );
}
