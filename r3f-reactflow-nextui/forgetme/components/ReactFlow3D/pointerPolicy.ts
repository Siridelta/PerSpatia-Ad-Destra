/**
 * 与 React Flow 配套的「是否不要把指针交给相机」判断。
 * CameraControl 本身不引用 RF 类名；策略集中在此文件，由 Canvas 注入。
 */

/** 空白命中层：放在 <ReactFlow> children 里，z-index 低于节点 */
export const RF_EMPTY_SURFACE_ATTR = 'data-per-spatia-rf-empty-surface';

/**
 * @returns true → 相机忽略本次指针（不 startPan / startRotate）
 */
export function shouldIgnorePointerForCameraRf(
  target: EventTarget | null
): boolean {
  if (!target || !(target instanceof Element)) {
    return true;
  }

  const el = target as Element;

  // 显式声明的「只有空白才会点到的底」→ 交给相机
  if (el.classList.contains(`react-flow__pane`)) {
    console.log('shouldIgnorePointerForCameraRf: react-flow__pane');
    return false;
  }

  if (el.classList.contains(`react-flow-3d`)) {
    console.log('shouldIgnorePointerForCameraRf: react-flow-3d');
    return false;
  }

  // 在 RF 视口内点到其它东西（节点、边、handle、内置 pane 等）→ 不抢 RF
  if (el.closest('.react-flow__viewport')) {
    console.log('shouldIgnorePointerForCameraRf: react-flow__viewport');
    return true;
  }

  // 工具栏、设置、3D Canvas 等与图无关的区域 → 不启画布平移
  return true;
}
