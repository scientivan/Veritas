"use client";

import {createContext, useCallback, useContext, useEffect, useState, type ReactNode} from "react";

type Theme = "dark" | "light";
const STORAGE_KEY = "veritas-theme";

const ThemeContext = createContext<{theme: Theme; toggleTheme: () => void}>({
  theme: "dark",
  toggleTheme: () => {},
});

export function ThemeProvider({children}: {children: ReactNode}) {
  const [theme, setTheme] = useState<Theme>("dark");

  // Sync from the data-theme the no-FOUC inline script already set on <html>.
  useEffect(() => {
    const current = (document.documentElement.getAttribute("data-theme") as Theme) || "dark";
    setTheme(current);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      const el = document.documentElement;
      el.classList.add("theme-anim");
      el.setAttribute("data-theme", next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {}
      window.setTimeout(() => el.classList.remove("theme-anim"), 340);
      return next;
    });
  }, []);

  return <ThemeContext.Provider value={{theme, toggleTheme}}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

/** Inline script string run before first paint: sets the theme (URL ?theme wins, then storage, then system). */
export const themeInitScript = `(function(){try{var p=new URLSearchParams(location.search).get('theme');var t=(p==='light'||p==='dark')?p:localStorage.getItem('${STORAGE_KEY}');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}if(p==='light'||p==='dark'){try{localStorage.setItem('${STORAGE_KEY}',t);}catch(e){}}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;
