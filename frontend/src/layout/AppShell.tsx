import { cn } from "cn";
import { Bell, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";

import type { Snapshot } from "@/api/types";
import { BrandMark, PlantSkyline } from "@/components/BrandMark";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatDateTime } from "@/lib/format";

type Props = {
  snapshot: Snapshot;
  children: ReactNode;
  onRoleChange: (roleCode: string) => void;
  onReset: () => void;
  onMarkNotificationsRead: () => void;
};

export function AppShell({
  snapshot,
  children,
  onRoleChange,
  onReset,
  onMarkNotificationsRead,
}: Props) {
  const unread = snapshot.notifications.filter((notification) => notification.readAt === null);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-30">
        <div className="h-1 bg-brand-lime" aria-hidden />
        <div className="relative overflow-hidden border-b border-chart-2/30 bg-primary text-primary-foreground">
          <div
            className="cement-grain-light pointer-events-none absolute inset-0 opacity-80"
            aria-hidden
          />
          <div className="kiln-hatch pointer-events-none absolute inset-0 opacity-40" aria-hidden />
          <div className="relative mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-2.5">
            <BrandMark className="size-9 sm:size-10" />
            <div className="min-w-0">
              <p className="font-mono text-[9px] tracking-[0.2em] whitespace-nowrap text-chart-2 uppercase sm:tracking-[0.26em]">
                <span className="sm:hidden">Cementownia Warta</span>
                <span className="hidden sm:inline">Cementownia Warta S.A.</span>
              </p>
              <p className="flex items-center gap-2 text-[13px] font-semibold tracking-tight sm:text-sm">
                <span className="truncate">Laboratorium zakładowe</span>
                <span className="hidden shrink-0 rounded-sm border border-chart-2/40 bg-chart-2/15 px-1.5 py-px font-mono text-[9px] tracking-[0.1em] text-chart-2 uppercase sm:inline">
                  17025
                </span>
              </p>
              <p className="hidden text-[11px] leading-tight text-white/65 md:block">
                Nadzór wyposażenia pomiarowego i wyników badań
              </p>
            </div>

            <div className="ml-6 hidden h-10 min-w-0 flex-1 items-end text-primary-foreground/30 md:flex [mask-image:linear-gradient(to_right,black,transparent)]">
              <PlantSkyline className="h-10 w-full" />
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Badge
                variant="outline"
                className="hidden border-white/20 bg-white/5 font-mono text-[9px] tracking-[0.16em] text-white/70 uppercase sm:inline-flex"
              >
                Prototyp · dane demo
              </Badge>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    className="relative border-white/20 bg-white/5 text-primary-foreground hover:bg-white/10 hover:text-primary-foreground"
                    aria-label={`Powiadomienia: ${unread.length} nieprzeczytanych`}
                  >
                    <Bell aria-hidden />
                    {unread.length > 0 && (
                      <Badge className="absolute -top-1.5 -right-1.5 h-4 min-w-4 rounded-full bg-chart-2 px-1 text-[10px] text-primary tabular-nums">
                        {unread.length}
                      </Badge>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
                  <DropdownMenuLabel>Powiadomienia</DropdownMenuLabel>
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      disabled={unread.length === 0}
                      onSelect={onMarkNotificationsRead}
                    >
                      Oznacz przeczytane
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    {snapshot.notifications.length === 0 && (
                      <DropdownMenuItem disabled>Brak powiadomień dla tej roli.</DropdownMenuItem>
                    )}
                    {snapshot.notifications.slice(0, 8).map((notification) => (
                      <DropdownMenuItem
                        key={notification.id}
                        className={cn(
                          "flex-col items-start gap-0.5 whitespace-normal",
                          notification.readAt === null ? "bg-accent/60" : "opacity-70",
                        )}
                        onSelect={(event) => {
                          event.preventDefault();
                        }}
                      >
                        <span className="font-medium">{notification.title}</span>
                        <span className="text-xs text-muted-foreground">{notification.body}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {formatDateTime(notification.createdAt)}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-primary-foreground/80 hover:bg-white/10 hover:text-primary-foreground"
                  >
                    <RotateCcw aria-hidden />
                    <span className="hidden sm:inline">Reset</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Przywrócić dane demonstracyjne?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Wszystkie wpisy wykonane w prototypie (wzorcowania, sprawdzenia, spisy,
                      wyniki) zostaną usunięte, a dane wrócą do stanu początkowego. Tej operacji nie
                      można cofnąć.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Anuluj</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={onReset}>
                      Przywróć dane
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>

        <div className="border-b bg-card">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-0.5 bg-chart-2" aria-hidden />
              <span className="font-mono text-[9px] tracking-[0.18em] text-muted-foreground uppercase">
                Podgląd roli
              </span>
            </span>
            <ToggleGroup
              type="single"
              value={snapshot.session.role.code}
              onValueChange={(value) => {
                if (value !== "") {
                  onRoleChange(value);
                }
              }}
              variant="outline"
              size="sm"
              spacing={0}
              className="max-w-full overflow-x-auto"
            >
              {snapshot.demoRoles.map((role) => (
                <ToggleGroupItem
                  key={role.code}
                  value={role.code}
                  aria-label={role.name}
                  className="shrink-0 px-2.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                >
                  <span className="font-mono text-[10px] tracking-[0.06em] sm:hidden">
                    {role.code}
                  </span>
                  <span className="hidden sm:inline">{role.name}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              <span className="hidden h-3 w-px bg-border sm:block" aria-hidden />
              {snapshot.session.user.fullName}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>

      <footer className="border-t bg-card/60">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5 font-medium text-foreground/80">
            <span className="size-1.5 bg-chart-2" aria-hidden />
            Cementownia Warta S.A. · Laboratorium zakładowe
          </span>
          <span className="hidden sm:inline">
            PN-EN ISO/IEC 17025 · uprawnienia i statusy wylicza API.
          </span>
          <span className="ml-auto font-mono text-[10px] tracking-[0.12em] uppercase">
            {snapshot.labs.map((lab) => lab.code).join(" · ")} / 17025
          </span>
        </div>
      </footer>
    </div>
  );
}
