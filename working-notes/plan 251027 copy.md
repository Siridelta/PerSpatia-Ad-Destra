

### **重构计划 (修订版)**

这是我们将提供给后续 AI 的施工计划。我将为每个阶段撰写独立的、包含完整上下文的描述。

---
### **第一部分: 整体架构蓝图介绍**

*(这部分将作为后续所有阶段任务的前缀，为执行者提供宏观视角)*

**项目背景与目标**
当前项目正在进行一次大型架构重构，目标是将画布的 **UI 状态** 与 **代码求值（计算）状态** 进行彻底分离，以解决逻辑耦合、性能瓶颈和并发计算等问题。

**新架构核心设计：**
我们将采用“双 Store + 控制器 + Host 组件”的模式。

1.  **`UI Store` (实例级)**:
    *   **职责**: 作为用户输入的唯一数据源 (Source of Truth)。
    *   **管理内容**: `nodes`, `edges` (及其位置、样式等 UI 信息)，节点中的 `code` 字符串，以及用户通过 UI 设置的 `controls` 的 `value`。
    *   **特性**: 每个画布 (`Canvas`) 拥有一个独立的 `UI Store` 实例。

2.  **`Eval Store` (实例级)**:
    *   **职责**: 作为所有计算结果的唯一数据源。
    *   **管理内容**: 节点的 `outputs`, `errors`, `logs`，以及由代码动态生成的 `controls` 的定义 (如 `min`, `max`, `step`)。
    *   **特性**: 每个画布拥有一个独立的 `Eval Store` 实例。

3.  **`useCanvasEval` 钩子，返回 `EvalController` (实例级)**:
    *   **职责**: 作为 `Eval Store` 的门面 (Facade)，封装其内部实现，并暴露清晰的、面向业务的 API（例如 `recalculate()`, `useNodeOutput(nodeId)`）。下游组件将通过 Controller 与求值系统交互，而非直接操作 `Eval Store`。

4.  **`CanvasEvalHost` (逻辑组件)**:
    *   **职责**: 这是一个无 UI 的 React 组件，扮演 canvas eval 相关逻辑的“宿主”的角色。它 **订阅** `UI Store` 的变化，当检测到与计算相关的输入（如 `code` 变化）时，调用 `EvalController` 的方法来 **触发** 计算。它 **不订阅** `Eval Store`，从而避免了重计算循环。

5.  **`Persistence Store` (全局单例)**:
    *   **职责**: 负责将**单个** `UI Store` 的状态进行序列化（保存到 LocalStorage）和反序列化（从 LocalStorage 加载）。它是连接实例级状态和持久化存储的桥梁。

组件结构：

```
Canvas
- 持有：
  - UI Store 实例
  - Eval Controller 实例（包装 Eval Store）
- 链接全局 Persistence Store
- UIStoreContext.Provider
  - EvalControllerContext.Provider
    - CanvasUI
      - 订阅 UI Store 和 Eval Controller
      - 更新 UI Store
      - ReactFlow 组件
    - CanvasEvalHost
      - 订阅 UI Store
      - 使用 Eval Controller 计算并更新 Eval Store
```

计算流程：
1. 用户在 UI 上进行操作，触发 UI Store 的变化。
2. CanvasEvalHost 订阅 UI Store 的变化，当检测到与计算相关的输入（如 `code` 变化），或者图结构发生变化时，调用 EvalController 的方法来触发计算。
3. EvalController 使用 Eval Store 的计算结果来更新 Eval Store。
如果 controls 发生用户发起的更新，则通过上面的流程从 UI Store 的 controls 更新 Eval Store 的 controls。

1. 当 Eval Store 的计算结果发生变化时，CanvasUI 会通过 Eval Controller 订阅到更新；
2. CanvasUI 更新 UI；
3. 如果有 controls 变化，则同步更新 UI Store 的 Controls。
如果 controls 发生变化，则通过上面的流程从 Eval Store 的 Controls 更新 UI Store 的 Controls。

---
### **第二部分: 具体施工阶段**

#### **阶段 1 (已完成): 核心逻辑修复 - 重写求值引擎**
*   **状态**: 已完成。
*   **产出**: 求值逻辑已从错误的递归模式重构为基于拓扑排序的、可处理并发的迭代模式。

---

#### **阶段 2: 基础建设 - 持久化与 UI 状态分离**

**当前状态**: 我们已经修复了核心计算逻辑，但整个状态管理系统仍是耦合的。本阶段的目标是建立新架构的基础设施，首先将 `UI Store` 分离出来，并立即为其配备持久化能力。

**工作描述**:

1.  **引入 `Persistence Store`**:
    *   创建一个新的全局单例 Zustand store，命名为 `persistenceStore`。
    *   它内部应包含一个 `savedCanvasState` 字段，用于存储序列化后的画布 UI 状态 (JSON 字符串)。
    *   提供两个 actions:
        *   `saveState(state: UIState)`: 接收一个 `UIState` 对象，将其 `JSON.stringify` 后存入 `savedCanvasState`，并同步写入 `localStorage`。
        *   `loadState(): UIState | null`: 从 `localStorage` 读取数据，如果存在，则 `JSON.parse` 后返回，否则返回 `null`。

2.  **创建 `UI Store`**:
    *   将现有 `canvasStore` 中与 UI 相关的部分（`nodes`, `edges`, `onNodesChange`, `onEdgesChange`, `updateNodeData` 等）剥离出来，创建一个新的、**可被多实例化的** `createUIStore` 函数。
    *   `createUIStore` 应接收一个 `initialState` 作为参数。
    *   修改 `updateNodeData` 为 `updateNodeCode`，使其职责更明确，只更新节点的代码。

3.  **改造 `Canvas` 组件**:
    *   在 `Canvas` 组件内部，使用 `useRef` 来创建并持有一个 `uiStore` 的实例。
    *   在组件首次加载时，尝试调用 `persistenceStore.getState().loadState()` 来获取初始状态，并用它来初始化 `uiStore`。如果没有已保存的状态，则使用默认的画布数据。
    *   将 `uiStore` 实例通过 React Context (`UIStoreContext.Provider`) 向下传递。
    *   **关键**: 订阅 `uiStore` 的变化。当 store 发生任何变化时，调用 `persistenceStore.getState().saveState(newState)` 来自动保存。可以使用 `uiStore.subscribe(saveFunction)` 来实现。

4.  **拆分 `CanvasUI` 子组件**:
    *   创建一个新的 `CanvasUI` 组件。
    *   将 `Canvas` 组件中所有与 React Flow 渲染相关的 JSX 和逻辑（`<ReactFlow>`, `nodeTypes`, `edgeTypes` 等）移动到 `CanvasUI` 中。
    *   `CanvasUI` 通过 `useContext` 获取 `uiStore`，并使用 `useStore` hook 订阅渲染所需的数据 (`nodes`, `edges` 等)。

**阶段产出**:
*   `Canvas` 组件转变为一个“容器”，负责创建和管理 `uiStore` 并处理持久化。
*   `CanvasUI` 负责纯粹的渲染工作。
*   画布状态现在可以被自动保存和加载，极大地改善了开发和测试体验。
*   求值逻辑暂时仍与 UI 耦合，但 UI 状态已经被成功分离，为下一步解耦计算逻辑做好了准备。

---

#### **阶段 3: 架构核心 - 计算逻辑解耦**

**当前状态**: 我们已经将 UI 状态分离并实现了持久化。现在，我们需要将核心的求值逻辑也分离出来，完成整个新架构的搭建。

**工作描述**:

1.  **重构 `useCanvasEval` Hook 为 Controller 工厂**:
    *   重写 `useCanvasEval` hook。它的新职责是**创建并管理**求值系统的核心实例，并作为其唯一的入口。
    *   在 `useCanvasEval` 内部:
        *   使用 `useRef` 创建并持有一个 `evalStore` 实例。`evalStore` 的具体实现（`createEvalStore` 函数）应作为此 hook 的内部实现细节。
        *   使用 `useMemo` 创建并持有一个 `EvalController` 实例，并将 `evalStore` 注入其中。
    *   `useCanvasEval` hook **最终只返回 `EvalController` 实例**。这样，调用方（`Canvas`）就无需关心 `evalStore` 的存在，实现了完美的封装。

2.  **在 `Canvas` 中集成**:
    *   在 `Canvas` 容器组件中，调用重构后的 `useCanvasEval()` 来获取 `evalController` 实例。
    *   将获取到的 `evalController` 实例通过新的 Context (`EvalControllerContext.Provider`) 向下传递。

3.  **实现 `CanvasEvalHost`**:
    *   创建无 UI 的 `CanvasEvalHost` 组件。它通过 Context 消费 `uiStore` 和 `EvalController`。
    *   `CanvasEvalHost` **只订阅** `uiStore` 中与计算相关的输入。当输入变化时，用 evalController 带来的 hook 分析输入数据，触发计算。

4.  **改造节点组件 (`TextNode` 等)**:
    *   修改 `TextNode` 等需要显示计算结果的组件。
    *   它们通过 `useContext` 获取 `EvalController` 实例。
    *   使用 `controller.useNodeOutput(nodeId)` 等 `EvalController` 提供的 hooks 来订阅和显示数据。

**阶段产出**:
*   UI 与计算逻辑完全解耦。
*   `Canvas` 容器负责组装 `uiStore` 和 `EvalController`。
*   `CanvasEvalHost` 负责驱动计算。
*   `CanvasUI` 负责渲染。
*   节点组件通过 `EvalController` 消费计算结果。
*   整个应用架构变得清晰、可扩展且高性能。
