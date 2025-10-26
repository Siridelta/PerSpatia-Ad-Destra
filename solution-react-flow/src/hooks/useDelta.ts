import { useMemo, useRef } from 'react';

interface DeltaOptions<T, D> {
  /**
   * 自定义比较函数，用于判断前后值是否等价。如果返回 true，则不会触发 delta 计算。
   * 默认使用 Object.is。
   */
  isEqual?: (prev: T, current: T) => boolean;
  /**
   * 当 prev 为 undefined（首次执行）时是否跳过计算。默认 true。
   */
  skipOnFirstRun?: boolean;
  /**
   * 如果 prev === undefined 时 provide fallback prev 值。
   */
  initialPrev?: T;
}

/**
 * 通用增量计算 hook。
 *
 * @param current   当前值
 * @param compute   基于 prev/current 计算 delta 的函数
 * @param options   选项，允许自定义比较逻辑和首次执行策略
 */
export function useDelta<T, D>(
  current: T,
  compute: (prev: T, current: T) => D,
  options: DeltaOptions<T, D> = {},
): D | undefined {
  const { isEqual = Object.is, skipOnFirstRun = true, initialPrev } = options;
  const prevRef = useRef<T | undefined>(initialPrev);
  const hasPrevRef = useRef<boolean>(initialPrev !== undefined);

  const delta = useMemo(() => {
    const hasPrev = hasPrevRef.current;
    const prev = prevRef.current;

    if (hasPrev && prev !== undefined && isEqual(prev, current)) {
      return undefined;
    }

    if (!hasPrev && skipOnFirstRun && initialPrev === undefined) {
      hasPrevRef.current = true;
      prevRef.current = current;
      return undefined;
    }

    const effectivePrev = prev ?? current;
    const result = compute(effectivePrev, current);

    hasPrevRef.current = true;
    prevRef.current = current;

    return result;
  }, [compute, current, initialPrev, isEqual, skipOnFirstRun]);

  return delta;
}