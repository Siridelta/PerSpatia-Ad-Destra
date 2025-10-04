import { createContext, ReactNode, useContext, useMemo, useCallback } from 'react';
import { CanvasEvalController } from '@/hooks/useCanvasEval';

interface CanvasEvalProviderProps {
  controller: CanvasEvalController;
  children: ReactNode;
}

const CanvasEvalContext = createContext<CanvasEvalController | null>(null);

export const CanvasEvalProvider = ({ controller, children }: CanvasEvalProviderProps) => (
  <CanvasEvalContext.Provider value={controller}>{children}</CanvasEvalContext.Provider>
);

export const useCanvasEvalController = () => {
  const context = useContext(CanvasEvalContext);
  if (!context) {
    throw new Error('useCanvasEvalController must be used within CanvasEvalProvider');
  }
  return context;
};

export const useNodeEval = (nodeId: string) => {
  const controller = useCanvasEvalController();
  const node = controller.useEvalStore((state) => state[nodeId]);

  const setControlValues = useCallback(
    (values: Record<string, unknown>) => {
      controller.updateNodeControls(nodeId, values);
    },
    [controller, nodeId]
  );

  const evaluate = useCallback(() => controller.evaluateNode(nodeId), [controller, nodeId]);

  return useMemo(
    () => ({
      node,
      controls: node?.controls ?? [],
      outputs: node?.outputs ?? {},
      logs: node?.logs ?? [],
      errors: node?.errors ?? [],
      warnings: node?.warnings ?? [],
      isEvaluating: node?.isEvaluating ?? false,
      setControlValues,
      evaluate,
    }),
    [node, setControlValues, evaluate]
  );
};


