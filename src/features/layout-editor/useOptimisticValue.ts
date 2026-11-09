import { useState } from 'react';

/**
 * For a controlled input whose truth is in the store. Saves are async, so without this the control
 * snaps back for a moment after every change. The shown value returns to the store's once the save
 * ends, which also undoes it if the save was refused.
 */
export function useOptimisticValue<T>(
  saved: T,
  save: (next: T) => Promise<unknown>,
): [T, (next: T) => void] {
  const [pending, setPending] = useState<{ value: T } | null>(null);

  const change = async (next: T) => {
    setPending({ value: next });
    try {
      await save(next);
    } finally {
      setPending(null);
    }
  };

  return [pending ? pending.value : saved, (next) => void change(next)];
}
