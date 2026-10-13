import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";
import { LANGUAGES } from "./languages";
import { configurePurchases } from "./purchases";

interface Session {
  credits: number | null;
  setCredits: (credits: number) => void;
  refreshCredits: () => Promise<number | null>;
  language: string;
  setLanguage: (code: string) => void;
  error: string | null;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [credits, setCredits] = useState<number | null>(null);
  const [language, setLanguage] = useState<string>(LANGUAGES[0].code);
  const [error, setError] = useState<string | null>(null);

  const refreshCredits = useCallback(async () => {
    try {
      const me = await api.me();
      configurePurchases(me.id);
      setCredits(me.credits);
      setError(null);
      return me.credits;
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  }, []);

  useEffect(() => {
    void refreshCredits();
  }, [refreshCredits]);

  const value = useMemo(
    () => ({ credits, setCredits, refreshCredits, language, setLanguage, error }),
    [credits, refreshCredits, language, error],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside SessionProvider");
  return session;
}
