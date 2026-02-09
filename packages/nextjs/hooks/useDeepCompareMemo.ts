import { useMemo, useRef } from "react";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function deepEqualArrays(a: unknown[], b: unknown): boolean {
  if (!Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!deepEqual(a[i], b[i])) return false;
  }
  return true;
}

function deepEqualObjects(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a)) return deepEqualArrays(a, b);
  if (isObject(a) && isObject(b)) return deepEqualObjects(a, b);
  return false;
}

export function useDeepCompareMemo<T>(factory: () => T, deps: unknown[]): T {
  const previousDepsRef = useRef<unknown[]>([]);

  const depsChanged = !deepEqual(deps, previousDepsRef.current);
  const comparatorDeps = depsChanged ? deps : previousDepsRef.current;

  const memoizedValue = useMemo(factory, comparatorDeps);

  if (depsChanged) {
    previousDepsRef.current = deps;
  }

  return memoizedValue;
}

