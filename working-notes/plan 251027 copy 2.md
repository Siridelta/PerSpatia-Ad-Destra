

### **重构计划 (V3 - Provider/Hook 架构)**

这是我们将提供给后续 AI 的施工计划。我将为每个阶段撰写独立的、包含完整上下文的描述。

---
### **第一部分: 新架构介绍**

*(这部分将作为后续所有阶段任务的前缀，为AI工作者提供宏观视角)*

#### **核心目标**
彻底分离 **UI 状态** (用户所见和意图) 与 **计算(Evaluation)系统状态** (代码计算结果)，解决逻辑耦合、性能瓶颈和并发计算等问题，并提供一个优雅、可扩展的开发者 API。

#### **计算系统的设计模式: Provider + Hook**
我们将为求值系统分别设计一套 `Provider` + `Hook` 的门面，这符合现代 React 的最佳实践，能最大化地实现封装和简化使用。

#### **组件树结构**
```
App
├─ <Canvas>
│   └─ <UIStoreProvider> (提供该画布实例的 UI 状态，目前看来可以直接提供 store 实例下去)
│       └─ <CanvasEvalProvider> (提供该画布实例的求值能力)
│           └─ <CanvasUI /> (React Flow 画布、节点、边等，我们应用的实际 UI)
└─ ...未来可以有多个 Canvas
```

#### **数据流与三大 Store**

1.  **`persistenceStore` (全局单例)**
    *   **职责**: 负责将 **单个** 画布的 UI 状态序列化（保存到 LocalStorage）和反序列化（从 LocalStorage 加载）。
    *   **实现**: 一个简单的 Zustand 全局 Store，提供 `saveState(state)` 和 `loadState()` 方法。

2.  **`uiStore` (每个 `<Canvas>` 一个)**
    *   **职责**: 作为用户输入的 **唯一数据源 (Source of Truth)**。管理所有用户可直接编辑的状态，如 `nodes` (及其位置、尺寸、`code` 字符串), `edges`, `viewport`。
    *   **生命周期**: 在 `<UIStoreProvider>` 内部创建。
    *   **交互**:
        *   初始化时，从 `persistenceStore` 加载状态。
        *   自身状态变化时，通过 `subscribe` 触发 `persistenceStore` 进行持久化。
        *   通过 `UIStoreContext` 向下层提供。

3.  **`evalStore` (每个 `<Canvas>` 一个，**内部实现细节**)**
    *   **职责**: 作为所有 **计算结果** 的唯一数据源。管理节点的 `outputs`, `errors`, `logs`, 以及由代码动态生成的 `controls` 定义。
    *   **生命周期与封装**: 它是 **`CanvasEvalProvider` 的内部实现细节**，由 `Provider` 创建和管理，绝不直接暴露给下层组件。

#### **计算系统的开发者 API (门面)**

1.  **`CanvasEvalProvider` 组件**
    *   **角色**: 计算系统的“引擎室”。
    *   **职责**:
        *   从上层 `UIStoreContext` 消费 UI 状态 (`nodes`, `edges`)。
        *   内部创建并管理 `evalStore` 和 `evalApi` 对象。
        *   监听 UI 状态变化，当 `code` 或图结构变更时，调用 `evalApi` 触发重新计算。
        *   通过 `CanvasEvalContext` 向下层提供 `evalApi` 对象。

2.  **`useCanvasEval()` / `useNodeEval(id)` Hooks**
    *   **角色**: 组件消费计算结果的“仪表盘”。
    *   **职责**:
        *   这是下层组件（如 `TextNode`）与求值系统交互的 **唯一** 方式。
        *   `useCanvasEval()`: 获取完整的 `evalApi` 对象，用于需要全局操作的场景。
        *   `useNodeEval(id)`: **(推荐)** 一个更精细的钩子，它从 `evalApi` 订阅指定 ID 节点的状态，并将数据 (`outputs`, `errors`) 和相关操作 (`updateNodeControls`) 组合成一个简洁的对象返回。

---
### **第二部分: 具体施工阶段**

#### **阶段 1 (已完成): 核心逻辑修复 - 重写求值引擎**
*   **状态**: 已完成。
*   **产出**: 求值逻辑已从错误的递归模式重构为基于拓扑排序的、可处理并发的迭代模式。

---

#### **阶段 2: 基础建设 - UI 状态实例与持久化**

**目标**: 将现有的全局 `canvasStore` 拆分，实现每个画布实例拥有独立的、可自动存取的 UI 状态。为未来的双 store 架构打下基础。

1.  **创建 `persistenceStore`**:
    *   新建一个 Zustand 全局 Store，只包含 `saveState` 和 `loadState` 方法，用于与 `localStorage` 交互。

2.  **改造 `canvasStore` 为 `createUIStore`**:
    *   将 `solution-react-flow/src/store/canvasStore.ts` 重构为一个 **工厂函数** `createUIStore(initialState?)`。
    *   此函数返回一个 **全新的、非单例的** Zustand Store 实例，管理 `nodes`, `edges` 等 UI 状态。

3.  **创建 `UIStoreProvider` 和 `useUIStore`**:
    *   创建一个 `UIStoreProvider` 组件。它将在内部创建并持有一个 `uiStore` 实例。
    *   在首次挂载时，`UIStoreProvider` 从 `persistenceStore` 加载数据来初始化自己的 `uiStore`。
    *   使用 `uiStore.subscribe()` 监听变化，并在每次变化后调用 `persistenceStore` 的 `saveState` 方法。
    *   通过 React Context 将 `uiStore` 实例提供出去。
    *   提供一个 `useUIStore` 钩子来方便下层组件消费。

4.  **改造 `Canvas` 和 `CanvasUI`**:
    *   简化 `Canvas` 组件，让它主要负责渲染 `<UIStoreProvider>`。
    *   所有之前直接从全局 `canvasStore` 获取数据的组件，现在都改为通过 `useUIStore()` 钩子获取。

**阶段产出**:
*   全局 `canvasStore` 被移除。
*   UI 状态管理变为实例级别，并具备自动持久化能力。
*   为下一步解耦计算逻辑铺平了道路。

---

#### **阶段 3: 架构升级 - 实现 Eval Provider/Hook 门面**

**目标**: 将求值逻辑完全从 UI 组件中剥离，并封装在优雅的 `Provider` + `Hook` API 背后。

1.  **重构 `useCanvasEval` 为内部控制器**:
    *   将 `solution-react-flow/src/hooks/useCanvasEval.ts` 的核心逻辑（创建 `evalStore`、拓扑排序、执行计算等）保留。
    *   将其改造为一个内部 Hook，例如 `useCanvasEvalController(evalInput)`。
    *   它的职责是接收 UI 输入，并返回一个稳定、封装好的 `evalApi` 对象。

2.  **创建 `CanvasEvalProvider` 和 `CanvasEvalContext`**:
    *   创建 `solution-react-flow/src/contexts/CanvasEvalContext.tsx`。
    *   `CanvasEvalProvider` 组件将:
        *   使用 `useUIStore()` 订阅 `nodes` 和 `edges` 的变化，并将其格式化为 `evalInput`。
        *   调用 `useCanvasEvalController(evalInput)` 获取 `evalApi`。
        *   通过 `CanvasEvalContext.Provider` 将 `evalApi` 向下传递。

3.  **创建面向消费者的 Hooks**:
    *   在 `CanvasEvalContext.tsx` 中，创建 `useCanvasEval()` 和 `useNodeEval(id)` 两个钩子。
    *   `useCanvasEval()` 用于获取整个 `evalApi`。
    *   `useNodeEval(id)` 用于获取特定节点的数据和方法，这将是 `TextNode` 主要使用的方式。

4.  **改造 `TextNode`**:
    *   移除所有旧的、直接的求值逻辑。
    *   完全通过 `useNodeEval(id)` 钩子来获取 `outputs`, `errors`, `controls`, `isEvaluating` 等数据，以及 `setControlValues` 等方法。

**阶段产出**:
*   UI 与计算逻辑完全解耦，实现了最终的架构目标。
*   `CanvasEvalProvider` 成为驱动所有计算的核心。
*   `TextNode` 等 UI 组件变为纯粹的数据消费者，其内部逻辑变得极其简单清晰。
*   整个应用架构变得清晰、可扩展且高性能。