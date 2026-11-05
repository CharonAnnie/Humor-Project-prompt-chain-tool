"use client";

import { useSyncExternalStore } from "react";

export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "pct-theme";

/**
 * The inline script that runs before first paint.
 *
 * It only ever writes the attribute for an *explicit* preference. "System" is
 * the absence of the attribute, which hands the decision back to the
 * `prefers-color-scheme` media query in globals.css -- so the stored preference
 * and the CSS cannot disagree, and a visitor with JavaScript off still gets
 * their OS theme instead of being pinned to light.
 *
 * Kept as a string rather than a module because it has to execute before React
 * hydrates; anything bundled is already too late and shows a flash of the wrong
 * theme.
 */
export const THEME_SCRIPT = `
try {
  var p = localStorage.getItem("${THEME_STORAGE_KEY}");
  if (p === "light" || p === "dark") {
    document.documentElement.setAttribute("data-theme", p);
  }
} catch (e) {}
`.trim();

const OPTIONS: { value: ThemePreference; label: string; icon: string }[] = [
  { value: "light", label: "Light", icon: "☀" },
  { value: "dark", label: "Dark", icon: "☾" },
  { value: "system", label: "System", icon: "◐" },
];

/**
 * localStorage is an external store, so it is read through the hook meant for
 * one rather than copied into state inside an effect. That is what makes the
 * server's render ("system", because the server cannot know) and the client's
 * first render disagree safely: React renders the server snapshot during
 * hydration and switches to the real one immediately after.
 *
 * The subscription carries the `storage` event as well as this tab's own
 * writes, so changing the theme in one tab updates the toggle in the others.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // Private mode, or site data blocked. System default is a fine answer.
  }
  return "system";
}

// A string primitive, so repeated reads are referentially equal and the hook
// does not re-render for ever.
function serverPreference(): ThemePreference {
  return "system";
}

function choose(next: ThemePreference) {
  const root = document.documentElement;

  if (next === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", next);

  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // The attribute is already set, so the choice holds for this page view and
    // is simply forgotten on the next one.
  }

  // `storage` does not fire in the tab that wrote the value, so this tab is
  // told directly.
  listeners.forEach((listener) => listener());
}

/** Light / dark / system, as a three-way segmented control. */
export default function ThemeToggle() {
  const preference = useSyncExternalStore(
    subscribe,
    readPreference,
    serverPreference,
  );

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-lg border p-0.5"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      role="group"
      aria-label="Colour theme"
    >
      {OPTIONS.map((option) => {
        const active = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => choose(option.value)}
            aria-pressed={active}
            title={`${option.label} theme`}
            className="rounded-md px-2 py-1 text-xs transition-colors"
            style={
              active
                ? { background: "var(--surface-2)", color: "var(--accent)" }
                : { color: "var(--muted)" }
            }
          >
            <span aria-hidden>{option.icon}</span>
            <span className="sr-only">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
