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
      className="min-w-0 gap-0 overflow-hidden rounded-xl border border-border/70 bg-card py-0 shadow-none ring-0"
    >
      <CardHeader className="gap-1 border-b border-border/60 px-4 py-3">
        <CardTitle className="text-sm font-semibold tracking-tight">{title}</CardTitle>
        {description !== undefined && (
          <CardDescription className="text-xs leading-relaxed">{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="px-4 py-4">{children}</CardContent>
    </Card>
  );
}
