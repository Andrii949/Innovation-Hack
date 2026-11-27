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
          <span className="size-1.5 shrink-0 bg-chart-2" aria-hidden />
          <CardTitle>{title}</CardTitle>
        </div>
        {description !== undefined && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="px-4 py-4 sm:px-5">{children}</CardContent>
    </Card>
  );
}
