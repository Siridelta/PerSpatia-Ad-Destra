import { usePrevious } from './usePrevious';

export function use1xHistory<T>(current: T): { previous: T | undefined; current: T } {
  const previous = usePrevious(current);
  return { previous, current };
}