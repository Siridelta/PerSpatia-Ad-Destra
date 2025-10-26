import { useRef, useEffect } from 'react';

export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);

  // Store current value in ref after every render
  useEffect(() => {
    ref.current = value;
  }, [value]); // Run effect only when value changes

  // Return previous value (happens before update in useEffect)
  return ref.current;
}
