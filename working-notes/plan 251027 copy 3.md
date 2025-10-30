

### **重构计划 (V4 - API 驱动的解耦)**

这是我们将提供给后续 AI 的施工计划。我将为每个阶段撰写独立的、包含完整上下文的描述。

---
### **第一部分: 新架构介绍**

*(这部分将作为后续所有阶段任务的前缀，为AI工作者提供宏观视角)*

#### **核心目标**
彻底分离 **UI 状态** (用户所见和意图) 与 **计算(Evaluation)系统状态** (代码计算结果)，解决逻辑耦合、性能瓶瓶颈和并发计算等问题，并提供一个优雅、可扩展的开发者 API。

#### **新设计模式: 对称 API 与显式连接**
我们将 UI 和计算系统视为两个对等的、解耦的服务。每个服务都通过一个专门的 Hook (`useCanvasUIData`, `useCanvasEval`) 暴露一个稳定的 API 对象 (`uiDataApi`, `evalApi`)。这两个系统在顶层组件中被显式地“连接”，通过对称的订阅方法 (`subscribeFromUI`, `subscribeFromEval`) 进行双向数据同步，所有复杂的同步逻辑都被封装在 API 内部。

#### **组件树结构**
```javascript
// Canvas 组件负责创建和连接两大 API
const Canvas = () => {
  const uiDataApi = useCanvasUIData();
  const evalApi = useCanvasEval();

  useEffect(() => {
    // Canvas 只负责发出“连接”指令
    const unsubscribeEvalFromUI = evalApi.subscribeFromUI(uiDataApi);
    const unsubscribeUIFromEval = uiDataApi.subscribeFromEval(evalApi);

    return () => { // 组件卸载时自动断开连接
      unsubscribeEvalFromUI();
      unsubscribeUIFromEval();
    };
  }, [uiDataApi, evalApi]);
  
  return (
    // Provider 只负责将创建好的 API 传递下去
    <CanvasUIDataProvider api={uiDataApi}>
      <CanvasEvalProvider api={evalApi}>
        <CanvasUI />
      </CanvasEvalProvider>
    </CanvasUIDataProvider>
  );
};
```

#### **数据流与三大 Store**

1.  **`canvasPersistenceStore` (全局单例)**
    *   **职责**: 负责将 **单个** 画布的 UI 状态序列化（保存到 LocalStorage）和反序列化（从 LocalStorage 加载）。
    *   **实现**: 一个简单的 Zustand 全局 Store，提供 `saveState(state)` 和 `loadState()` 方法。
    *   **生命周期**: 它是 **`useCanvasUIData` Hook 的内部实现细节**，由该 Hook 创建和管理。当未来需要支持多个、可切换的画布时，给 useCanvasUIData 传入一个 canvasId，然后让 canvasPersistenceStore 支持 loadState(canvasId) 和 saveState(canvasId, state) 即可。

2.  **`uiStore` (每个 `<Canvas>` 一个, **内部实现细节**)**
    *   **职责**: 作为用户输入的 **唯一数据源 (Source of Truth)**。管理所有用户可直接编辑的状态，如 `nodes` (及其位置、尺寸、`code` 字符串、用户更改的 `controls` 等), `edges`, `viewport`。
    *   **生命周期**: 它是 **`useCanvasUIData` Hook 的内部实现细节**，由该 Hook 创建和管理。
    *   **交互**:
        *   初始化时，从 `canvasPersistenceStore` 加载状态。
        *   自身状态变化时，通过 `subscribe` 触发 `canvasPersistenceStore` 进行持久化。
        *   通过 `uiDataApi` 和 `CanvasUIDataProvider` 向下层提供。
        *   eval hook 里动态计算的 `controls` 发生变动时，通过 `uiDataApi` 的 `subscribeFromEval` 方法订阅到变化，并更新 `uiStore` 中的 `controls`。

3.  **`evalStore` (每个 `<Canvas>` 一个, **内部实现细节**)**
    *   **职责**: 作为所有 **计算结果** 的唯一数据源。管理节点的 `outputs`, `errors`, `logs`, 以及由代码动态生成的 `controls` 定义。
    *   **生命周期与封装**: 它是 **`useCanvasEval` Hook 的内部实现细节**，由该 Hook 创建和管理，绝不直接暴露给外部。
    *   **交互**:
        *   初始化时，通过与 uiData 的订阅来初始化自己的状态。
        *   通过 `evalApi` 和 `CanvasEvalProvider` 向下层提供。
        *   ui hook 里的变动（包括：图结构发生变化，代码片段 `code` 发生变化，用户主动调节 `controls` 值变动），通过 `evalApi` 的 `subscribeFromUI` 方法订阅到变化，并触发计算，计算完成后更新 `evalStore` 中的 `outputs`, `errors`, `logs`, `controls`。

#### **计算系统的开发者 API (门面)**

1.  **顶层 Hooks: `useCanvasUIData()` & `useCanvasEval()`**
    *   **角色**: 两大系统的“工厂”。
    *   **职责**: 分别创建和管理内部的 `uiStore` 和 `evalStore`，并返回一个稳定、封装好的 API 对象 (`uiDataApi`, `evalApi`)。

2.  **API 对象: `uiDataApi` & `evalApi`**
    *   **角色**: 与系统交互的唯一窗口。
    *   **职责**: 封装所有内部逻辑，提供清晰的方法。例如：
        *   `subscribeFromEval(evalApi)`: `uiDataApi` 的方法，用于订阅 `evalApi` 的数据变化并同步到 `uiStore`，使用增量分析。
        *   `subscribeFromUI(uiDataApi)`: `evalApi` 的方法，用于订阅 `uiDataApi` 的数据变化并触发重新计算，更新 `evalStore`，使用增量分析。
        *   `subscribeData(callback)`: 通用订阅方法，允许下层消费者 (如 `useNodeEval`) 监听数据变化。
        *   其他业务方法，如 `updateNodeControls`, `addNode` 等。

3.  **Provider 组件: `CanvasUIDataProvider` & `CanvasEvalProvider`**
    *   **角色**: API 的“投递员”。
    *   **职责**: 接收顶层创建的 `api` 对象作为 prop，并通过 React Context 将其提供给所有下层组件。

4.  **消费型 Hooks: `useNodeData(id)` & `useNodeEval(id)`**
    *   **角色**: 组件消费状态的“仪表盘”。
    *   **职责**: 这是下层组件（如 `TextNode`）与系统交互的 **推荐** 方式。它们从对应的 Provider 获取 `api`，并使用 `api.subscribeData` 来订阅特定节点的数据，实现高效、精确的更新。

---
### **第二部分: 具体施工阶段**

#### **阶段 1 (已完成): 核心逻辑修复 - 重写求值引擎**
*   **状态**: 已完成。
*   **产出**: 求值逻辑已从错误的递归模式重构为基于拓扑排序的、可处理并发的迭代模式。

---

#### **阶段 2: 基础建设 - UI 状态实例与持久化**

**目标**: 将现有的全局 `canvasStore` 拆分，实现每个画布实例拥有独立的、可自动存取的 UI 状态。为后续的 `uiDataApi` 提供内部 store 实现。

1.  **创建 `canvasPersistenceStore`**:
    *   新建一个 Zustand 全局 Store，只包含 `saveState` 和 `loadState` 方法，用于与 `localStorage` 交互。

2.  **改造 `canvasStore` 为 `createUIStore`**:
    *   将 `solution-react-flow/src/store/canvasStore.ts` 重构为一个 **工厂函数** `createUIStore(initialState?)`。
    *   此函数返回一个 **全新的、非单例的** Zustand Store 实例，管理 `nodes`, `edges` 等 UI 状态。

3.  **（此阶段可选，可合并到阶段3）创建 `UIStoreProvider` 和 `useUIStore`**:
    *   为了平滑过渡，可以先创建一个临时的 `UIStoreProvider`。它将在内部创建并持有一个 `uiStore` 实例。
    *   在首次挂载时，`UIStoreProvider` 从 `canvasPersistenceStore` 加载数据来初始化自己的 `uiStore`。
    *   使用 `uiStore.subscribe()` 监听变化，并在每次变化后调用 `canvasPersistenceStore` 的 `saveState` 方法。
    *   通过 React Context 将 `uiStore` 实例提供出去，让现有组件可以先迁移到 `useUIStore()`。

**阶段产出**:
*   全局 `canvasStore` 被移除。
*   UI 状态管理变为实例级别，并具备自动持久化能力。
*   为 `uiDataApi` 的实现铺平了道路。

---

#### **阶段 3: 架构升级 - 实现子系统 API 门面**

**目标**: 将求值逻辑与 UI 逻辑完全剥离，各自封装在优雅的 API 背后，并在顶层组件中显式连接实现同步。

1.  **创建 `useCanvasUIData` 和 `useCanvasEval` Hooks**:
    *   **`useCanvasUIData`**: 内部使用 `createUIStore` 工厂函数创建 `uiStore` 实例，并与 `canvasPersistenceStore` 连接。返回一个包含 `subscribeFromEval`, `subscribeData`, `addNode` 等方法的 `uiDataApi` 对象。
    *   **`useCanvasEval`**: 内部创建 `evalStore`。返回一个包含 `subscribeFromUI`, `subscribeData`, `updateNodeControls` 等方法的 `evalApi` 对象。

2.  **实现相互订阅逻辑**:
    *   在 `evalApi.subscribeFromUI(uiDataApi)` 内部，调用 `uiDataApi.subscribeData()` 来监听 UI 变化。收到变化后，进行 delta 计算，并触发新一轮的代码图计算，根据结果更新内部 `evalStore`。
    *   在 `uiDataApi.subscribeFromEval(evalApi)` 内部，调用 `evalApi.subscribeData()` 来监听计算结果（如动态生成的 `controls`）。收到变化后，更新 `uiStore` 中的对应状态。

3.  **创建 `Provider` 和消费型 Hooks**:
    *   创建 `CanvasUIDataProvider`, `CanvasEvalProvider`，它们接收 `api` 对象并向下提供。
    *   创建 `useNodeData(id)` 和 `useNodeEval(id)`。它们将从 context 中获取 `api`，并使用 `api.subscribeData` 来订阅特定节点的数据，实现高效、精确的更新。

4.  **改造 `Canvas` 与 `TextNode`**:
    *   **`Canvas`**: 按照上面“组件树结构”中的示例进行改造，负责创建、连接 API 并设置 Providers。
    *   **`TextNode`**: 移除所有旧的状态管理和求值逻辑。完全通过 `useNodeData(id)` 获取 UI 相关的属性（如 `code`），通过 `useNodeEval(id)` 获取计算结果（`outputs`, `errors`, `controls` 等）。

**阶段产出**:
*   UI 与计算逻辑完全解耦，实现了最终的架构目标。
*   `uiDataApi` 和 `evalApi` 成为驱动状态变化的唯一入口。
*   `TextNode` 等 UI 组件变为纯粹的数据消费者，其内部逻辑变得极其简单清晰。
*   整个应用架构变得清晰、可扩展且高性能。

参考实现思路：

```javascript
// 在 useCanvasUIData 钩子内部...
const uiDataApi = useMemo(() => ({
  // ... 其他 API
  
  // 提供一个专门用于连接对方的方法
  subscribeFromEval: (evalApi) => {
    // 内部调用 store.subscribe
    const unsubscribe = evalApi.subscribeData((evalData, prevEvalData) => {
        // resolveDelta 和 sync 的逻辑完全封装在内部
        const delta = resolveEvalDataDelta(evalData, prevEvalData);
        if (delta.hasChanges) {
            syncFromEval(delta);
        }
    });
    return unsubscribe; // 返回清理函数
  },

  subscribeData: (callback) => {
    // uiDataStore 上有 subscribeWithSelector 中间件，才能用这种 subscribe API
    return uiDataStore.subscribe((state) => toUIData(state), callback); 
  }
}), []);


// 在 useCanvasEval 钩子内部，也是对称的...
const evalApi = useMemo(() => ({
    // ...
    subscribeFromUI: (uiDataApi) => {
        const unsubscribe = uiDataApi.subscribeData((uiData, prevUIData) => {
            const delta = resolveUIDataDelta(uiData, prevUIData);
            if(delta.hasChanges) {
                evalAndSyncFromUI(delta, uiData);  
                // 在回调线程里进行计算和同步，而非 Canvas 组件的重计算线程。
                // 不缓存任何数据，依靠输入的 uiDataDelta，uiData(全量)，和 evalStore snapshot 进行计算。
            }
        });
        return unsubscribe;
    },
    subscribeData: (callback) => {
        // evalStore 上有 subscribeWithSelector 中间件，才能用这种 subscribe API
        return evalStore.subscribe((state) => toEvalData(state), callback); 
    }
}), []);
```