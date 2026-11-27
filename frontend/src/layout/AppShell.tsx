import { cn } from "cn";
import { Bell, Check, ChevronDown, Menu, RotateCcw } from "lucide-react";
import { type ReactNode, useState } from "react";

import type { Snapshot } from "@/api/types";
import { BrandMark } from "@/components/BrandMark";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateTime } from "@/lib/format";

type Props = {
  snapshot: Snapshot;
  children: ReactNode;
  onRoleChange: (roleCode: string) => void;
  onReset: () => void;
  onMarkNotificationsRead: () => void;
};

function ResetDataDialog({
  className,
  label = "Reset",
  variant = "ghost",
  size = "sm",
  onReset,
}: {
  className?: string;
  label?: string;
  variant?: "ghost" | "outline";
  size?: "sm" | "default";
  onReset: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant={variant} size={size} className={className}>
          <RotateCcw aria-hidden />
          <span>{label}</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Przywrócić dane demonstracyjne?</AlertDialogTitle>
          <AlertDialogDescription>
            Wszystkie wpisy wykonane w prototypie (wzorcowania, sprawdzenia, spisy, wyniki) zostaną
            usunięte, a dane wrócą do stanu początkowego. Tej operacji nie można cofnąć.
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
  );
}

export function AppShell({
  snapshot,
  children,
  onRoleChange,
  onReset,
  onMarkNotificationsRead,
}: Props) {
  const unread = snapshot.notifications.filter((notification) => notification.readAt === null);
  const [menuOpen, setMenuOpen] = useState(false);
  const labs = snapshot.labs.map((lab) => lab.code).join(" · ");

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background">
        <div className="h-0.5 bg-brand-lime" aria-hidden />
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-2.5 px-3 sm:px-4">
          <BrandMark className="size-8 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm leading-tight font-semibold tracking-tight">
              Laboratorium zakładowe
            </p>
            <p className="truncate font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase">
              Cementownia Warta
              <span className="hidden sm:inline"> · PN-EN ISO/IEC 17025</span>
              <span className="sm:hidden"> · 17025</span>
            </p>
          </div>

          <Badge
            variant="outline"
            className="hidden font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase lg:inline-flex"
          >
            Prototyp · dane demo
          </Badge>

          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="relative"
                    aria-label={`Powiadomienia: ${unread.length} nieprzeczytanych`}
                  >
                    <Bell aria-hidden />
                    {unread.length > 0 && (
                      <span
                        className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-destructive ring-2 ring-background"
                        aria-hidden
                      />
                    )}
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                {unread.length === 0
                  ? "Powiadomienia — brak nieprzeczytanych"
                  : `Powiadomienia — nieprzeczytane: ${unread.length}`}
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
              <DropdownMenuLabel className="flex items-center justify-between gap-2">
                Powiadomienia
                <span className="font-mono text-[10px] font-normal text-muted-foreground">
                  {unread.length} nowych
                </span>
              </DropdownMenuLabel>
              <DropdownMenuGroup>
                <DropdownMenuItem disabled={unread.length === 0} onSelect={onMarkNotificationsRead}>
                  Oznacz przeczytane
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              {snapshot.notifications.length === 0 ? (
                <DropdownMenuItem disabled>Brak powiadomień dla tej roli.</DropdownMenuItem>
              ) : (
                <ScrollArea className="max-h-80">
                  <DropdownMenuGroup className="pr-2">
                    {snapshot.notifications.map((notification) => (
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
                </ScrollArea>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="hidden md:inline-flex"
                aria-label="Wybierz rolę"
              >
                {snapshot.session.role.name}
                <ChevronDown aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{snapshot.session.user.fullName}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {snapshot.demoRoles.map((role) => (
                <DropdownMenuItem key={role.code} onSelect={() => onRoleChange(role.code)}>
                  {role.name}
                  {role.code === snapshot.session.role.code && (
                    <Check className="ml-auto" aria-hidden />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <ResetDataDialog
            className="hidden text-muted-foreground md:inline-flex"
            onReset={onReset}
          />

          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Menu sesji"
            className="md:hidden"
            onClick={() => {
              setMenuOpen(true);
            }}
          >
            <Menu aria-hidden />
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-4 sm:px-4 sm:py-6">{children}</main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-3 py-3 text-[11px] text-muted-foreground sm:px-4">
          <span>Cementownia Warta S.A. · Laboratorium zakładowe</span>
          <span className="ml-auto font-mono text-[10px] tracking-[0.12em] uppercase">
            {labs} / 17025
          </span>
        </div>
      </footer>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 rounded-t-2xl p-0">
          <SheetHeader className="border-b border-border/60 px-4 py-3 pr-12">
            <SheetTitle>Podgląd roli</SheetTitle>
            <SheetDescription>
              Persona demo — uprawnienia i widoki zmieniają się od razu.
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-1 overflow-y-auto p-3">
            {snapshot.demoRoles.map((role) => {
              const active = role.code === snapshot.session.role.code;
              return (
                <button
                  key={role.code}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    onRoleChange(role.code);
                    setMenuOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors",
                    active ? "border-primary/30 bg-accent" : "border-border/60 hover:bg-muted/60",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{role.name}</span>
                    <span className="block font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                      {role.code}
                    </span>
                  </span>
                  {active && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
                </button>
              );
            })}
          </div>
          <div className="grid gap-2 border-t border-border/60 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <p className="text-xs text-muted-foreground">
              {snapshot.session.user.fullName} · {labs}
            </p>
            <ResetDataDialog
              variant="outline"
              size="default"
              className="w-full justify-center"
              label="Przywróć dane demonstracyjne"
              onReset={onReset}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
