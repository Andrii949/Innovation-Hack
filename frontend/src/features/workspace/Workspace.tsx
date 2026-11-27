import { cn } from "cn";
import {
  Bell,
  CalendarDays,
  ChartLine,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileText,
  FlaskConical,
  Gauge,
  History,
  LogOut,
  Microscope,
  Settings,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import {
  api,
  ApiError,
  type ApiRecord,
  apiVoid,
  errorMessage,
  textValue,
} from "@/api/workspaceClient";
import { BrandMark, PlantSkyline } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { parseEquipmentUrl } from "@/lib/qr";
import { clearToken, getToken, setToken } from "@/platform/tokenStore";

import { Administration, Audit, roleLabel } from "./Administration";
import { Equipment } from "./Equipment";
import { CalibrationPlans, Notifications, Reagents, Schedule } from "./Operations";
import { Overview } from "./Overview";
import { Reports, Results } from "./Results";
import { Control, Loading, Message, useApi } from "./shared";

type User = { full_name: string; login: string; role: string; permissions: string[] };
type Session = { user: User; token: string };

const reviewPassword = import.meta.env.DEV ? import.meta.env.VITE_REVIEW_PASSWORD : undefined;
const demoAccounts = [
  { login: "admin", role: "admin" },
  { login: "kierownik", role: "manager" },
  { login: "laborant", role: "worker" },
];
const sections = [
  { key: "overview", label: "Przegląd", icon: Gauge, group: "", permissions: ["schedule:read"] },
  {
    key: "schedule",
    label: "Harmonogram",
    icon: CalendarDays,
    group: "Wyposażenie",
    permissions: ["schedule:read"],
  },
  {
    key: "equipment",
    label: "Urządzenia",
    icon: Microscope,
    group: "Wyposażenie",
    permissions: ["equipment:read"],
  },
  {
    key: "plans",
    label: "Plan wzorcowań",
    icon: ClipboardList,
    group: "Wyposażenie",
    permissions: ["calibration:write", "calibration:approve"],
  },
  {
    key: "results",
    label: "Wyniki badań",
    icon: ChartLine,
    group: "Badania",
    permissions: ["result:read"],
  },
  {
    key: "reagents",
    label: "Odczynniki i CRM",
    icon: FlaskConical,
    group: "Badania",
    permissions: ["reagent:read"],
  },
  {
    key: "reports",
    label: "Raporty",
    icon: FileText,
    group: "Badania",
    permissions: ["report:read"],
  },
  {
    key: "settings",
    label: "Administracja",
    icon: Settings,
    group: "System",
    permissions: ["settings:write", "users:write", "equipment:write"],
  },
  {
    key: "audit",
    label: "Historia zmian",
    icon: History,
    group: "System",
    permissions: ["audit:read"],
  },
] as const;
type Section = (typeof sections)[number]["key"] | "notifications";
const groups = ["", "Wyposażenie", "Badania", "System"] as const;
const headerHeight = "top-13";
const longDate = new Intl.DateTimeFormat("pl-PL", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function initials(name: string) {
  const words = name.split(/\s+/).filter(Boolean);
  return `${words[0]?.[0] ?? ""}${words.length > 1 ? (words.at(-1)?.[0] ?? "") : ""}`.toUpperCase();
}

/** Contacts-style monogram in concrete greys; the name itself is in the menu and the label. */
function Monogram({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-linear-to-b from-brand-concrete-light to-brand-concrete font-semibold text-white",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function Workspace() {
  const [session, setSession] = useState<Session | null>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [equipmentId, setEquipmentId] = useState<number>();
  const [publicId, setPublicId] = useState(() => parseEquipmentUrl(window.location.pathname));
  const [section, setSection] = useState<Section>(() =>
    publicId === null ? "overview" : "equipment",
  );
  const [notificationRevision, setNotificationRevision] = useState(0);
  const unread = useApi<ApiRecord[]>(
    session ? "/notifications?unread=true" : null,
    session?.token ?? "",
    notificationRevision,
  );

  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const token = await getToken();
        const saved = token === null ? null : { token, user: await api<User>("/me", token) };
        if (active) {
          setSession(saved);
        }
      } catch (failure) {
        if (failure instanceof ApiError && failure.status === 401) {
          await clearToken();
        }
        if (active) {
          if (!(failure instanceof ApiError && failure.status === 401)) {
            setError(errorMessage(failure));
          }
          setSession(null);
        }
      }
    }
    void restore();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function syncPath() {
      const id = parseEquipmentUrl(window.location.pathname);
      setPublicId(id);
      setSection(id === null ? "overview" : "equipment");
    }
    window.addEventListener("popstate", syncPath);
    return () => window.removeEventListener("popstate", syncPath);
  }, []);

  function openPublic(id: string | null) {
    const path = id === null ? "/" : `/e/${id}`;
    if (path !== window.location.pathname) {
      window.history.pushState(null, "", path);
    }
    setPublicId(id);
  }

  async function login(loginName: string, password: string) {
    if (busy) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await api<Session>("/auth/login", null, "POST", { login: loginName, password });
      try {
        await setToken(next.token);
      } catch (failure) {
        await apiVoid("/auth/logout", next.token, "POST").catch(() => undefined);
        throw failure;
      }
      const previous = session?.token;
      if (previous) {
        await apiVoid("/auth/logout", previous, "POST").catch(() => undefined);
      }
      setSession(next);
      setEquipmentId(undefined);
      setSection(publicId !== null || next.user.role === "worker" ? "equipment" : "overview");
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    if (!session || busy) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiVoid("/auth/logout", session.token, "POST");
    } catch (failure) {
      if (!(failure instanceof ApiError && failure.status === 401)) {
        setError(errorMessage(failure));
      }
    } finally {
      await clearToken();
      setSession(null);
      setBusy(false);
    }
  }

  const user = session?.user;
  const permitted = sections.filter(({ permissions }) =>
    permissions.some((permission) => user?.permissions.includes(permission)),
  );
  const activeSection =
    section === "notifications" || permitted.some(({ key }) => key === section)
      ? section
      : permitted[0]?.key;
  useEffect(() => {
    // On phones the sections scroll sideways; bring the current one into view.
    document
      .querySelector(`nav [data-section="${activeSection}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [activeSection]);
  function navigate(next: Section) {
    if (next !== "equipment" && publicId !== null) {
      openPublic(null);
    }
    if (next !== "results") {
      setEquipmentId(undefined);
    }
    setSection(next);
  }
  function openDevice(id: string) {
    openPublic(id);
    setEquipmentId(undefined);
    setSection("equipment");
  }
  const current = sections.find(({ key }) => key === activeSection);
  const TitleIcon = current?.icon ?? Bell;
  const unreadCount = unread?.data?.length ?? 0;

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 bg-card shadow-[0_1px_0_rgb(0_0_0/0.08)] supports-[backdrop-filter]:bg-white/75 supports-[backdrop-filter]:backdrop-blur-xl supports-[backdrop-filter]:backdrop-saturate-150">
        <div className="flex h-13 items-center gap-3 px-3 sm:px-5">
          <a
            href="/"
            className="flex min-w-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <BrandMark className="size-7" />
            <span className="truncate text-[15px] font-semibold tracking-[-0.01em] text-foreground">
              Laboratorium
            </span>
            <span aria-hidden className="hidden h-4 w-px shrink-0 bg-foreground/15 sm:block" />
            <span className="hidden truncate text-[15px] tracking-[-0.01em] text-muted-foreground sm:block">
              Cementownia Warta
            </span>
          </a>
          {reviewPassword && (
            <span className="hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-foreground/15 ring-inset md:inline">
              Dane testowe
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {user && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Powiadomienia: ${unreadCount} nowych`}
                onClick={() => navigate("notifications")}
                className="relative rounded-full text-foreground/70 hover:bg-foreground/5 hover:text-foreground"
              >
                <Bell className="size-[1.125rem]" strokeWidth={1.75} />
                {unreadCount > 0 && (
                  <span
                    aria-hidden
                    className="absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-status-alarm px-1 text-[10px] leading-none font-semibold text-white tabular-nums ring-2 ring-white"
                  >
                    {unreadCount}
                  </span>
                )}
              </Button>
            )}
            {(user || reviewPassword) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  {user ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      aria-label={reviewPassword ? "Wybierz rolę" : "Menu konta"}
                      className="rounded-full hover:bg-foreground/5"
                    >
                      <Monogram name={user.full_name} className="size-8 text-xs" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      aria-label="Wybierz rolę"
                      className="h-8 rounded-full bg-foreground/[0.04] px-3 text-[13px] hover:bg-foreground/[0.08]"
                    >
                      Wybierz rolę
                      <ChevronDown />
                    </Button>
                  )}
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={8}
                  className="w-72 rounded-xl p-1.5 shadow-lg"
                >
                  {user && (
                    <div className="flex items-center gap-3 px-2 py-2.5">
                      <Monogram name={user.full_name} className="size-10 text-sm" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{user.full_name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {roleLabel(user.role)}
                        </p>
                      </div>
                    </div>
                  )}
                  {reviewPassword && (
                    <>
                      {user && <DropdownMenuSeparator />}
                      <DropdownMenuLabel className="px-2 text-xs font-normal text-muted-foreground">
                        Konto testowe
                      </DropdownMenuLabel>
                      {demoAccounts.map((account) => (
                        <DropdownMenuItem
                          key={account.login}
                          className="px-2 py-1.5"
                          onSelect={() => {
                            if (account.login !== user?.login) {
                              void login(account.login, reviewPassword);
                            }
                          }}
                        >
                          {roleLabel(account.role)}
                          {account.login === user?.login && (
                            <Check className="ml-auto text-brand-lime-ink" aria-label="Bieżące" />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                  {user && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="px-2 py-1.5"
                        onSelect={() => {
                          void logout();
                        }}
                      >
                        <LogOut />
                        Wyloguj
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </header>
      {!session ? (
        <main className="grid min-h-[calc(100dvh-3.25rem)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <section className="relative hidden flex-col justify-between overflow-hidden bg-brand-navy-deep px-12 pt-16 text-white lg:flex">
            <div className="max-w-lg">
              <h1 className="text-4xl leading-tight font-bold">
                Nadzór nad wyposażeniem laboratorium
              </h1>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/75">
                Rejestr urządzeń, terminy wzorcowań i sprawdzeń, odczynniki oraz wyniki badań
                cementu. Każda zmiana zostaje w historii.
              </p>
            </div>
            <PlantSkyline className="mt-12 w-full text-brand-lime/40" />
          </section>
          <div className="flex items-start justify-center px-4 py-10 sm:items-center sm:px-8">
            <div className="w-full max-w-sm">
              {session === undefined ? (
                <Loading />
              ) : (
                <LoginForm busy={busy} error={error} login={login} equipment={publicId !== null} />
              )}
            </div>
          </div>
        </main>
      ) : (
        <div className="lg:flex">
          {/* The column paints the sidebar to the page bottom; the nav inside stays in view. */}
          <div className="contents lg:block lg:w-60 lg:shrink-0 lg:border-r lg:bg-card">
            <nav
              aria-label="Sekcje laboratorium"
              className={cn(
                "no-scrollbar sticky z-20 flex overflow-x-auto border-b border-foreground/8 bg-card px-1 lg:max-h-[calc(100dvh-3.25rem)] lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:px-3 lg:py-5",
                // Phones: a fade pinned to the right edge hints that more sections scroll in.
                "max-lg:after:pointer-events-none max-lg:after:sticky max-lg:after:right-0 max-lg:after:w-10 max-lg:after:shrink-0 max-lg:after:bg-linear-to-l max-lg:after:from-card max-lg:after:content-['']",
                headerHeight,
              )}
            >
              {groups.map((group) => {
                const items = permitted.filter((item) => item.group === group);
                if (items.length === 0) {
                  return null;
                }
                return (
                  <div key={group || "start"} className="flex lg:mb-5 lg:flex-col lg:gap-0.5">
                    {group && (
                      <p className="hidden px-3 pb-1.5 text-xs font-semibold text-muted-foreground lg:block">
                        {group}
                      </p>
                    )}
                    {items.map(({ key, icon: Icon, label }) => (
                      <button
                        key={key}
                        type="button"
                        data-section={key}
                        aria-current={activeSection === key ? "page" : undefined}
                        onClick={() => navigate(key)}
                        className={cn(
                          "flex shrink-0 items-center gap-2.5 border-b-[3px] border-transparent px-3 py-3 text-sm whitespace-nowrap text-foreground/75 transition-colors outline-none hover:text-brand-navy focus-visible:ring-3 focus-visible:ring-ring/50 lg:rounded-sm lg:border-b-0 lg:border-l-[3px] lg:py-2",
                          activeSection === key
                            ? "border-brand-lime font-semibold text-brand-navy lg:bg-brand-lime-soft"
                            : "lg:hover:bg-background",
                        )}
                      >
                        <Icon className="size-4 shrink-0" aria-hidden />
                        {label}
                      </button>
                    ))}
                  </div>
                );
              })}
            </nav>
          </div>
          <main className="min-w-0 flex-1 px-3 py-5 sm:px-6 lg:px-8 lg:py-6">
            <div className="mx-auto grid max-w-[96rem] gap-4">
              <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
                <div className="min-w-0">
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    Laboratorium
                    {current?.group && (
                      <>
                        <ChevronRight className="size-3" aria-hidden />
                        {current.group}
                      </>
                    )}
                  </p>
                  <h1 className="mt-1 flex items-center gap-2.5 text-[1.375rem] leading-tight font-bold text-brand-navy">
                    <TitleIcon className="size-5 shrink-0 text-brand-lime-ink" aria-hidden />
                    {current?.label ?? "Powiadomienia"}
                  </h1>
                </div>
                {activeSection === "overview" && (
                  <p className="text-sm text-muted-foreground">
                    Stan na {longDate.format(new Date())}
                  </p>
                )}
              </div>
              {error && <Message>{error}</Message>}
              {activeSection === "overview" && (
                <Overview
                  token={session.token}
                  permissions={session.user.permissions}
                  onOpenDevice={openDevice}
                  onNavigate={navigate}
                />
              )}
              {activeSection === "schedule" && (
                <Schedule token={session.token} permissions={session.user.permissions} />
              )}
              {activeSection === "equipment" && (
                <Equipment
                  key={session.token}
                  token={session.token}
                  permissions={session.user.permissions}
                  publicId={publicId}
                  onPublicId={openPublic}
                  onResults={(id) => {
                    setEquipmentId(id);
                    navigate("results");
                  }}
                />
              )}
              {activeSection === "plans" && (
                <CalibrationPlans token={session.token} permissions={session.user.permissions} />
              )}
              {activeSection === "results" && (
                <Results
                  key={session.token}
                  token={session.token}
                  permissions={session.user.permissions}
                  equipmentId={equipmentId}
                />
              )}
              {activeSection === "reagents" && (
                <Reagents token={session.token} permissions={session.user.permissions} />
              )}
              {activeSection === "reports" && (
                <Reports token={session.token} permissions={session.user.permissions} />
              )}
              {activeSection === "settings" && (
                <Administration token={session.token} permissions={session.user.permissions} />
              )}
              {activeSection === "audit" && (
                <Audit token={session.token} permissions={session.user.permissions} />
              )}
              {activeSection === "notifications" && (
                <Notifications
                  token={session.token}
                  permissions={session.user.permissions}
                  after={() => setNotificationRevision((value) => value + 1)}
                />
              )}
            </div>
          </main>
        </div>
      )}
      <Toaster position="bottom-center" richColors />
    </div>
  );
}

function LoginForm({
  login,
  busy,
  error,
  equipment,
}: {
  login: (name: string, password: string) => Promise<void>;
  busy: boolean;
  error: string;
  equipment: boolean;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void login(textValue(values.get("login"), "").trim(), textValue(values.get("password"), ""));
  }
  return (
    <Card className="border-t-4 border-t-brand-lime">
      <CardHeader>
        <CardTitle className="text-xl text-brand-navy">Zaloguj się</CardTitle>
        <CardDescription>
          {equipment
            ? "Po zalogowaniu otworzymy kartę z etykiety."
            : "Zaloguj się na konto laboratorium."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={submit}>
          <Control label="Login" htmlFor="workspace-login">
            <Input id="workspace-login" name="login" autoComplete="username" required />
          </Control>
          <Control label="Hasło" htmlFor="workspace-password">
            <Input
              id="workspace-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </Control>
          {error && <Message>{error}</Message>}
          <Button type="submit" disabled={busy}>
            {busy ? "Logowanie…" : "Zaloguj się"}
          </Button>
        </form>
        {reviewPassword && (
          <p className="mt-4 text-xs text-muted-foreground">
            Do przeglądu aplikacji wybierz rolę w prawym górnym rogu.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
