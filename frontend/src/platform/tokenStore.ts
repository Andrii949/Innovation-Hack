import { Capacitor, registerPlugin } from "@capacitor/core";

import { isNativeApp } from "@/platform/server";

const TOKEN_STORAGE_KEY = "lab.session-token";

export type TokenStorageAdapter = {
  get: () => Promise<string | null>;
  set: (token: string) => Promise<void>;
  clear: () => Promise<void>;
};

export type TokenStore = {
  getToken: () => Promise<string | null>;
  setToken: (token: string) => Promise<void>;
  clearToken: () => Promise<void>;
};

type SecureStoragePluginShape = {
  get: (options: { key: string }) => Promise<{ value: string }>;
  set: (options: { key: string; value: string }) => Promise<void>;
  remove: (options: { key: string }) => Promise<void>;
};

const SecureStoragePlugin = registerPlugin<SecureStoragePluginShape>("SecureStoragePlugin");

const browserAdapter: TokenStorageAdapter = {
  get: () => Promise.resolve(sessionStorage.getItem(TOKEN_STORAGE_KEY)),
  set: (token: string) => {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    return Promise.resolve();
  },
  clear: () => {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    return Promise.resolve();
  },
};

const nativeAdapter: TokenStorageAdapter = {
  get: async () => {
    try {
      const result = await SecureStoragePlugin.get({ key: TOKEN_STORAGE_KEY });
      return result.value === "" ? null : result.value;
    } catch {
      return null;
    }
  },
  set: async (token: string) => {
    await SecureStoragePlugin.set({ key: TOKEN_STORAGE_KEY, value: token });
  },
  clear: async () => {
    try {
      await SecureStoragePlugin.remove({ key: TOKEN_STORAGE_KEY });
    } catch {
      // Key may already be absent on logout/reset.
    }
  },
};

export function createTokenStore(adapter: TokenStorageAdapter): TokenStore {
  return {
    getToken: () => adapter.get(),
    setToken: (token: string) => adapter.set(token),
    clearToken: () => adapter.clear(),
  };
}

function activeAdapter(): TokenStorageAdapter {
  if (isNativeApp() && Capacitor.isPluginAvailable("SecureStoragePlugin")) {
    return nativeAdapter;
  }
  return browserAdapter;
}

export function getToken(): Promise<string | null> {
  return activeAdapter().get();
}

export function setToken(token: string): Promise<void> {
  return activeAdapter().set(token);
}

export function clearToken(): Promise<void> {
  return activeAdapter().clear();
}
