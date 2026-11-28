import {
  Bell,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  FlaskConical,
  History,
  LayoutGrid,
  LogOut,
  Microscope,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { type DemoEvent, fetchDemoEvents } from "@/api/demoEvents";
import {
  api,
  ApiError,
  type ApiRecord,
  apiVoid,
  errorMessage,
  onUnauthorized,
  textValue,
} from "@/api/workspaceClient";
import { BrandMark, PlantSkyline } from "@/components/BrandMark";
import { Badge } from "@/components/ui/badge";
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
import { notifyLocally } from "@/platform/localNotify";
import { clearServerUrl, getServerUrl, isNativeApp } from "@/platform/server";
import { clearToken, getToken, setToken } from "@/platform/tokenStore";

import { Administration, Audit, roleLabel } from "./Administration";
import { Equipment } from "./Equipment";
import { CalibrationPlans, Notifications, Reagents, Schedule } from "./Operations";
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
  { key: "schedule", label: "Harmonogram", icon: CalendarDays, permissions: ["schedule:read"] },
  { key: "equipment", label: "Urządzenia", icon: Microscope, permissions: ["equipment:read"] },
  {
    key: "plans",
    label: "Plan wzorcowań",
    icon: ClipboardList,
    permissions: ["calibration:write", "calibration:approve"],
  },
  { key: "results", label: "Wyniki badań", icon: SlidersHorizontal, permissions: ["result:read"] },
  { key: "reagents", label: "Odczynniki i CRM", icon: FlaskConical, permissions: ["reagent:read"] },
  { key: "reports", label: "Raporty", icon: LayoutGrid, permissions: ["report:read"] },
  {
    key: "settings",
    label: "Administracja",
    icon: Settings,
    permissions: ["settings:write", "users:write", "equipment:write"],
  },
  { key: "audit", label: "Historia zmian", icon: History, permissions: ["audit:read"] },
] as const;
type Section = (typeof sections)[number]["key"] | "notifications";

export function Workspace({ onChangeServer }: { onChangeServer?: () => void } = {}) {
  const [session, setSession] = useState<Session | null>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [equipmentId, setEquipmentId] = useState<number>();
  const [publicId, setPublicId] = useState(() => parseEquipmentUrl(window.location.pathname));
  const [section, setSection] = useState<Section>(() =>
    publicId === null ? "schedule" : "equipment",
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
      setSection(id === null ? "schedule" : "equipment");
    }
    window.addEventListener("popstate", syncPath);
    return () => window.removeEventListener("popstate", syncPath);
  }, []);

  const signedIn = session != null;
  useEffect(() => {
    if (!signedIn) {
      return undefined;
    }
    return onUnauthorized(() => {
      void clearToken();
      setSession(null);
      setError("Sesja wygasła. Zaloguj się ponownie.");
    });
  }, [signedIn]);

  const native = isNativeApp();
  const serverUrl = native ? getServerUrl() : null;

  function changeServer() {
    clearServerUrl();
    onChangeServer?.();
  }

  const openPublic = useCallback((id: string | null) => {
    const path = id === null ? "/" : `/e/${id}`;
    if (path !== window.location.pathname) {
      window.history.pushState(null, "", path);
    }
    setPublicId(id);
  }, []);

  // Presentation console: the API queues ephemeral signals that drive the app on stage.
  useEffect(() => {
    if (!session) {
      return undefined;
    }
    const token = session.token;
    let after = 0;
    let primed = false;
    let cancelled = false;
    let timer: number | undefined;

    const apply = (event: DemoEvent): void => {
      switch (event.action) {
        case "push":
          setNotificationRevision((value) => value + 1);
          toast.success(event.title, { description: event.message });
          void notifyLocally(event.title, event.message);
          break;
        case "scan":
          if (event.public_id !== null) {
            toast.success(event.source === "qr" ? "Zeskanowano kod QR" : "Odczytano tag NFC", {
              description: [event.code, event.name].filter(Boolean).join(" · "),
            });
            openPublic(event.public_id);
            setSection("equipment");
          }
          break;
        case "card":
          if (event.public_id !== null) {
            openPublic(event.public_id);
            setSection("equipment");
          }
          break;
        case "toast":
          toast.info(event.title, { description: event.message });
          break;
      }
    };

    const poll = async (): Promise<void> => {
      try {
        const events = await fetchDemoEvents(token, after);
        if (cancelled) {
          return;
        }
        if (!primed) {
          primed = true;
          after = events.reduce((max, event) => Math.max(max, event.id), after);
        } else {
          for (const event of events) {
            after = Math.max(after, event.id);
            apply(event);
          }
        }
      } catch {
        // Best effort: a console poll hiccup must not disturb the workspace.
      }
      if (!cancelled) {
        timer = window.setTimeout(() => void poll(), 1200);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [openPublic, session]);

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
      setSection(publicId !== null || next.user.role === "worker" ? "equipment" : "schedule");
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
  function navigate(next: Section) {
    if (next !== "equipment" && publicId !== null) {
      openPublic(null);
    }
    if (next !== "results") {
      setEquipmentId(undefined);
    }
    setSection(next);
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-t-4 border-t-brand-lime border-b bg-white">
        <div className="mx-auto flex h-[4.25rem] max-w-[90rem] items-center gap-3 px-3 sm:px-7">
          {user ? (
            <button
              type="button"
              onClick={() => navigate(permitted[0]?.key ?? "schedule")}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <BrandMark className="size-9 sm:size-10" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-brand-navy sm:text-base">
                  Laboratorium zakładowe
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  Cementownia Warta S.A.
                </span>
              </span>
            </button>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <BrandMark className="size-9 sm:size-10" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-brand-navy sm:text-base">
                  Laboratorium zakładowe
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  Cementownia Warta S.A.
                </span>
              </span>
            </div>
          )}
          {user && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Powiadomienia: ${unread?.data?.length ?? 0} nowych`}
              onClick={() => navigate("notifications")}
              className="relative"
            >
              <Bell />
              {!!unread?.data?.length && (
                <span
                  className="absolute top-1 right-1 size-2 rounded-full bg-brand-lime ring-2 ring-white"
                  aria-hidden
                />
              )}
            </Button>
          )}
          {(user || reviewPassword || native) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  className="max-w-[46vw]"
                  aria-label={reviewPassword ? "Wybierz rolę" : user ? "Menu konta" : "Serwer"}
                >
                  <ShieldCheck />
                  <span className="truncate">
                    {user ? roleLabel(user.role) : reviewPassword ? "Wybierz rolę" : "Serwer"}
                  </span>
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {user && <DropdownMenuLabel>{user.full_name}</DropdownMenuLabel>}
                {native && serverUrl !== null && (
                  <>
                    <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
                      Serwer: {serverUrl}
                    </DropdownMenuLabel>
                    <DropdownMenuItem onSelect={changeServer}>Zmień serwer</DropdownMenuItem>
                  </>
                )}
                {reviewPassword && (
                  <>
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                      Konta podglądu
                    </DropdownMenuLabel>
                    {demoAccounts.map((account) => (
                      <DropdownMenuItem
                        disabled={account.login === user?.login}
                        key={account.login}
                        onSelect={() => {
                          void login(account.login, reviewPassword);
                        }}
                      >
                        {roleLabel(account.role)}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                {user && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
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
      </header>
      {!session ? (
        <main className="mx-auto grid max-w-5xl items-center gap-6 px-4 py-10 sm:grid-cols-[1.2fr_1fr] sm:py-24">
          <div className="warta-hero relative isolate overflow-hidden rounded-xl px-6 py-9 text-white sm:px-9 sm:py-12">
            <div className="h-1 w-12 bg-brand-lime" aria-hidden />
            <h1 className="my-4 text-3xl font-bold leading-tight sm:text-4xl">
              Laboratorium
              <br />
              Cementowni Warta
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-white/85">
              Urządzenia, terminy wzorcowań i wyniki badań w jednym miejscu.
            </p>
            <PlantSkyline className="mt-8 w-full max-w-sm text-white/40" />
          </div>
          {session === undefined ? (
            <Loading />
          ) : (
            <LoginForm
              busy={busy}
              error={error}
              login={login}
              equipment={publicId !== null}
              serverUrl={serverUrl}
              onChangeServer={onChangeServer ? changeServer : undefined}
            />
          )}
        </main>
      ) : (
        <main className="mx-auto grid max-w-[90rem] gap-4 px-3 py-4 sm:px-7 sm:py-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-6">
          <nav aria-label="Sekcje laboratorium" className="flex flex-wrap gap-1.5 lg:flex-col">
            {permitted.map(({ key, icon: Icon, label }) => (
              <Button
                key={key}
                type="button"
                variant={activeSection === key ? "default" : "ghost"}
                className="justify-start"
                aria-current={activeSection === key ? "page" : undefined}
                onClick={() => navigate(key)}
              >
                <Icon aria-hidden />
                {label}
              </Button>
            ))}
          </nav>
          <div className="min-w-0 space-y-4">
            <div className="warta-hero relative isolate flex min-h-32 flex-wrap items-center justify-between gap-3 overflow-hidden rounded-xl px-5 py-5 text-white sm:px-7">
              <div className="z-10">
                <div className="mb-2 h-1 w-8 bg-brand-lime" aria-hidden />
                <h1 className="text-2xl font-bold sm:text-3xl">
                  {activeSection === "notifications"
                    ? "Powiadomienia"
                    : permitted.find(({ key }) => key === activeSection)?.label}
                </h1>
              </div>
              <PlantSkyline className="pointer-events-none absolute right-4 bottom-0 w-72 text-white/30 sm:right-12 sm:w-96" />
              {reviewPassword && (
                <Badge className="z-10 border-white/35 bg-white/12 text-white" variant="outline">
                  Podgląd · dane testowe
                </Badge>
              )}
            </div>
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
              <CalibrationPlans token={session.token} permissions={session.user.permissions} />
            )}
            {activeSection === "results" && (
              <Results
                key={session.token}
                token={session.token}
                permissions={session.user.permissions}
                equipmentId={equipmentId}
                onClearEquipment={() => setEquipmentId(undefined)}
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
                key={notificationRevision}
                token={session.token}
                permissions={session.user.permissions}
                after={() => setNotificationRevision((value) => value + 1)}
              />
            )}
          </div>
        </main>
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
  serverUrl,
  onChangeServer,
}: {
  login: (name: string, password: string) => Promise<void>;
  busy: boolean;
  error: string;
  equipment: boolean;
  serverUrl: string | null;
  onChangeServer?: () => void;
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
        {serverUrl !== null && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="truncate">Serwer: {serverUrl}</span>
            {onChangeServer && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0"
                onClick={onChangeServer}
              >
                Zmień serwer
              </Button>
            )}
          </div>
        )}
        {reviewPassword && (
          <p className="mt-4 text-xs text-muted-foreground">
            Do przeglądu aplikacji wybierz rolę w prawym górnym rogu.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
