import { cn } from "cn";
import {
  Bell,
  CalendarDays,
  ChartLine,
  Check,
  ChevronDown,
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
const headerHeight = "top-14";

const sectionLeads: Record<Section, string> = {
  overview: "",
  schedule:
    "Wszystkie terminy w jednym miejscu: wzorcowania, sprawdzenia, ważność partii i spisy odczynników.",
  equipment:
    "Rejestr wyposażenia pomiarowego. Karta urządzenia zbiera świadectwa, sprawdzenia i historię.",
  plans: "Wysyłki urządzeń do firm wzorcujących i zatwierdzenia kierownika laboratorium.",
  results: "Wyniki badań cementu z kontrolą zakresu wpisu i progami weryfikacji.",
  reagents: "Stany odczynników i materiałów odniesienia, partie i daty ważności.",
  reports: "Raporty dla kierownika: wyniki, wykresy i weryfikacja danych w PDF.",
  settings: "Pracownie, użytkownicy, szablony sprawdzeń i reguły powiadomień.",
  audit: "Każdy zapis i każda zmiana z autorem i czasem, zgodnie z PN-EN ISO/IEC 17025.",
  notifications: "Przypomnienia o terminach, przekroczeniach i gotowych raportach.",
};

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
      .querySelector(`[data-strip] [data-section="${activeSection}"]`)
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
  const unreadCount = unread?.data?.length ?? 0;

  return (
    <div className="hatch min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[88rem] items-center gap-3 px-4 sm:px-6">
          <a
            href="/"
            className="flex min-w-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <BrandMark className="size-7" />
            <span className="truncate text-[15px] font-semibold tracking-tight text-brand-navy-deep">
              Laboratorium
            </span>
            <span className="hidden truncate text-[15px] tracking-tight text-muted-foreground sm:block">
              Cementownia Warta
            </span>
          </a>
          {reviewPassword && (
            <span className="hidden shrink-0 rounded-full px-2 py-0.5 font-mono text-[11px] text-muted-foreground ring-1 ring-line ring-inset md:inline">
              dane testowe
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
                      className="h-8 rounded-full px-3 text-[13px] ring-1 ring-line ring-inset hover:bg-foreground/[0.04]"
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
      <div className="mx-auto min-h-[calc(100dvh-3.5rem)] max-w-[88rem] border-x border-line bg-white">
        {!session ? (
          <main className="grid lg:min-h-[calc(100dvh-3.5rem)] lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <section className="flex flex-col justify-between border-b border-line px-6 pt-12 sm:px-10 lg:border-r lg:border-b-0 lg:px-14 lg:pt-24">
              <div>
                <p className="text-sm font-semibold text-brand-lime-ink">Cementownia Warta S.A.</p>
                <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-tighter text-balance text-brand-navy-deep sm:text-5xl lg:text-6xl">
                  Nadzór nad wyposażeniem laboratorium.
                </h1>
                <p className="mt-6 max-w-lg text-lg/8 text-muted-foreground">
                  Rejestr urządzeń, terminy wzorcowań i sprawdzeń, odczynniki oraz wyniki badań
                  cementu w jednym miejscu. Każda zmiana zostaje w historii.
                </p>
              </div>
              <PlantSkyline className="mt-16 w-full max-w-2xl text-brand-navy/25" />
            </section>
            <div className="flex items-start justify-center px-6 py-12 sm:px-10 lg:items-center">
              <div className="w-full max-w-sm">
                {session === undefined ? (
                  <Loading />
                ) : (
                  <LoginForm
                    busy={busy}
                    error={error}
                    login={login}
                    equipment={publicId !== null}
                  />
                )}
              </div>
            </div>
          </main>
        ) : (
          <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
            <aside className="hidden lg:block lg:border-r lg:border-line">
              <nav
                aria-label="Sekcje laboratorium"
                className="sticky top-14 max-h-[calc(100dvh-3.5rem)] overflow-y-auto px-6 py-10"
              >
                {groups.map((group) => {
                  const items = permitted.filter((item) => item.group === group);
                  if (items.length === 0) {
                    return null;
                  }
                  if (group === "") {
                    return (
                      <ul key="start" className="mb-10 grid gap-3">
                        {items.map(({ key, icon: Icon, label }) => (
                          <li key={key}>
                            <button
                              type="button"
                              aria-current={activeSection === key ? "page" : undefined}
                              onClick={() => navigate(key)}
                              className={cn(
                                "group flex items-center gap-3 rounded-md text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                                activeSection === key
                                  ? "text-brand-navy"
                                  : "text-foreground/80 hover:text-foreground",
                              )}
                            >
                              <span
                                className={cn(
                                  "grid size-7 place-items-center rounded-md ring-1 ring-inset",
                                  activeSection === key
                                    ? "bg-brand-navy text-brand-lime ring-brand-navy"
                                    : "text-muted-foreground ring-line group-hover:text-foreground",
                                )}
                              >
                                <Icon className="size-4" aria-hidden />
                              </span>
                              {label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    );
                  }
                  return (
                    <div key={group} className="mb-8">
                      <h2 className="text-sm font-semibold text-brand-navy-deep">{group}</h2>
                      <ul className="mt-3 grid gap-2.5 border-l border-line">
                        {items.map(({ key, label }) => (
                          <li key={key}>
                            <button
                              type="button"
                              aria-current={activeSection === key ? "page" : undefined}
                              onClick={() => navigate(key)}
                              className={cn(
                                "-ml-px block w-full border-l pl-4 text-left text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                                activeSection === key
                                  ? "border-brand-lime font-semibold text-brand-navy"
                                  : "border-transparent text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                              )}
                            >
                              {label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </nav>
            </aside>
            <div className="min-w-0">
              <nav
                aria-label="Sekcje laboratorium"
                data-strip
                className={cn(
                  "no-scrollbar sticky z-20 flex overflow-x-auto border-b border-line bg-white px-2 lg:hidden",
                  // A fade pinned to the right edge hints that more sections scroll in.
                  "after:pointer-events-none after:sticky after:right-0 after:w-10 after:shrink-0 after:bg-linear-to-l after:from-white after:content-['']",
                  headerHeight,
                )}
              >
                {permitted.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    data-section={key}
                    aria-current={activeSection === key ? "page" : undefined}
                    onClick={() => navigate(key)}
                    className={cn(
                      "shrink-0 border-b-2 border-transparent px-3 py-3 text-sm whitespace-nowrap text-muted-foreground transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      activeSection === key && "border-brand-lime font-semibold text-brand-navy",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              <main
                key={activeSection}
                className="duration-300 animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none"
              >
                {activeSection === "overview" ? (
                  <Overview
                    token={session.token}
                    permissions={session.user.permissions}
                    onOpenDevice={openDevice}
                    onNavigate={navigate}
                    error={error}
                  />
                ) : (
                  <>
                    <div className="border-b border-line px-4 py-10 sm:px-8 lg:px-12 lg:py-14">
                      <p className="text-sm font-semibold text-brand-lime-ink">
                        {current?.group || "Konto"}
                      </p>
                      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-brand-navy-deep sm:text-4xl">
                        {current?.label ?? "Powiadomienia"}
                      </h1>
                      <p className="mt-3 max-w-2xl text-base/7 text-muted-foreground">
                        {activeSection === undefined ? "" : sectionLeads[activeSection]}
                      </p>
                    </div>
                    <div className="grid gap-6 px-4 py-8 sm:px-8 lg:px-12 lg:py-10">
                      {error && <Message>{error}</Message>}
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
                        <CalibrationPlans
                          token={session.token}
                          permissions={session.user.permissions}
                        />
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
                        <Administration
                          token={session.token}
                          permissions={session.user.permissions}
                        />
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
                  </>
                )}
              </main>
            </div>
          </div>
        )}
      </div>
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
    <div>
      <h2 className="text-2xl font-semibold tracking-tight text-brand-navy-deep">Zaloguj się</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {equipment ? "Po zalogowaniu otworzymy kartę z etykiety." : "Użyj konta laboratorium."}
      </p>
      <form className="mt-8 grid gap-5" onSubmit={submit}>
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
        <Button type="submit" size="lg" disabled={busy} className="mt-1">
          {busy ? "Logowanie…" : "Zaloguj się"}
        </Button>
      </form>
      {reviewPassword && (
        <p className="mt-6 text-xs text-muted-foreground">
          Do przeglądu wybierz konto testowe w prawym górnym rogu.
        </p>
      )}
    </div>
  );
}
