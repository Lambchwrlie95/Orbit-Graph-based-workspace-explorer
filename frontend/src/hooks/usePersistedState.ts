import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

/**
 * `useState` that mirrors itself into `localStorage` under `key`.
 * Pass custom `serialize`/`deserialize` for types that don't survive `JSON.stringify`
 * (e.g. `Set`, `Map`).
 */
export function usePersistedState<T>(
  key: string,
  initial: T,
  options?: {
    serialize?: (value: T) => string;
    deserialize?: (raw: string) => T;
  },
): [T, Dispatch<SetStateAction<T>>] {
  const serialize = options?.serialize ?? JSON.stringify;
  const deserialize = options?.deserialize ?? (JSON.parse as (raw: string) => T);

  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.localStorage.getItem(key);
      return raw == null ? initial : deserialize(raw);
    } catch {
      return initial;
    }
  });

  // Skip the first effect tick so we don't immediately rewrite the seed value.
  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    try {
      window.localStorage.setItem(key, serialize(value));
    } catch {
      // Quota or privacy mode — silently ignore.
    }
  }, [key, value, serialize]);

  return [value, setValue];
}
