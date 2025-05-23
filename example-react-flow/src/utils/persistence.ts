// 画布状态持久化工具
// 支持保存、加载、清除，带版本号，便于未来兼容

const STORAGE_KEY = 'julia-canvas-flow-state';
const STORAGE_VERSION = 1;

export interface CanvasState {
  version: number;
  nodes: any[];
  edges: any[];
}

export function saveCanvasState(nodes: any[], edges: any[]) {
  const state: CanvasState = {
    version: STORAGE_VERSION,
    nodes,
    edges,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // 可扩展为 UI 提示
    console.warn('保存画布状态失败', e);
  }
}

export function loadCanvasState(): CanvasState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (state.version !== STORAGE_VERSION) {
      // 版本兼容处理，可扩展
      return null;
    }
    return state;
  } catch (e) {
    console.warn('加载画布状态失败', e);
    return null;
  }
}

export function clearCanvasState() {
  localStorage.removeItem(STORAGE_KEY);
} 