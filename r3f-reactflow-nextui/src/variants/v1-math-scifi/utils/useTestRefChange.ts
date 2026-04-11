// 测试一个对象与上一次调用时是否发送变化，用于检查对象重建

import { useRef } from 'react';

export const useTestRefChange = <T>(obj: T) => {
    const prevRef = useRef<T>(undefined);
    if (prevRef.current !== obj) {
        prevRef.current = obj;
        return true;
    }
    return false;
};