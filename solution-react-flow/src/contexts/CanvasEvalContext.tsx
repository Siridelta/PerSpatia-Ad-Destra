import { createContext, ReactNode, useContext, useMemo, useCallback } from 'react';
import { CanvasEvalApi } from '@/hooks/useCanvasEval';

interface CanvasEvalProviderProps {
  api: CanvasEvalApi;
  children: ReactNode;
}

const CanvasEvalContext = createContext<CanvasEvalApi | null>(null);

export const CanvasEvalProvider = ({ api, children }: CanvasEvalProviderProps) => (
  <CanvasEvalContext.Provider value={api}>{children}</CanvasEvalContext.Provider>
);

export const useCanvasEvalApi = () => {
  const context = useContext(CanvasEvalContext);
  if (!context) {
    throw new Error('useCanvasEvalApi must be used within CanvasEvalProvider');
  }
  return context;
};

export const useNodeEval = (nodeId: string) => {
  const evalApi = useCanvasEvalApi();
  const node = evalApi.useEvalStore((state) => state[nodeId]);

  const evaluate = useCallback(() => evalApi.evaluateNode(nodeId), [evalApi, nodeId]);

  return useMemo(
    () => ({
      node,
      controls: node?.controls ?? [],
      outputs: node?.outputs ?? {},
      logs: node?.logs ?? [],
      errors: node?.errors ?? [],
      warnings: node?.warnings ?? [],
      isEvaluating: node?.isEvaluating ?? false,
      evaluate,
    }),
    [node, evaluate]
  );
};


