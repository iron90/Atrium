import "@testing-library/jest-dom/vitest";

try {
  if (
    typeof window !== "undefined" &&
    typeof window.localStorage.clear !== "function"
  ) {
    throw new Error("localStorage is unavailable");
  }
} catch {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    },
  });
}
