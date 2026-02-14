

### 1. 为什么“剥离”是正确的方向？

目前的架构（以及 React Flow 的默认模式）是“全家桶”式的：
*   React Flow 的 `nodes` 数组里既有 `position`（位置），又有 `data.code`（代码）、`data.isCollapsed`（UI折叠状态）、`data.controls`（控制值）。
*   **弊端**：
    *   **性能问题**：每次修改代码或拖动滑块，虽然只改变了 `data`，但因为是 immutable update，导致整个 `nodes` 数组更新，React Flow 可能会重新校验整个图结构。
    *   **职责不清**：React Flow 应该只负责“画框框和连线”，而不应该关心框框里是代码还是图表。
    *   **序列化复杂**：存档时把一堆 React Flow 特有的 `measured`、`handleBounds` 等内部属性和你的业务数据混在一起，不干净。

### 2. 对 `TextNodeData` 的定位分析

看了你的 `nodeData.ts`，这些数据确实处于一个“尴尬”的中间地带：

*   **业务数据 (Business Logic)**: `code`, `controls`, `nodeName`。这些直接影响 `eval` 计算。
*   **节点级 UI 状态 (Node-level UI State)**: `width`, `height`, `isCollapsed`, `hiddenSections`。这些影响节点长什么样，但不影响 React Flow 的拓扑布局（除了宽高可能会间接影响布局，但更多是节点内部渲染的事）。

这部分数据确实**不适合**放在 React Flow 的 `data` 属性里传来传去。

### 3. 完善后的重构计划（Phase 1 + 2）

基于你的计划，我建议的架构调整如下：

#### A. 数据结构拆分

我们将状态分为三块：

1.  **FlowData states (`flowNodes`, `flowEdges`, `viewport`)**: **React Flow 的“物理世界”**
    *   **结构**: `nodes: [{ id, position, type }]`, `edges: [{ id, source, target }]`, `viewport`。
    *   **职责**: 告诉 React Flow 节点在哪，怎么连。只在增删节点、移动节点、连线时更新。
    *   **特点**: 轻量，只包含 React Flow 渲染必需的最小集。

2.  **UI Data Store (`uiData`)**: **节点和边的“内心世界”**
    *   **结构** (Map形式): `Map<NodeId, TextNodeData>`，边暂时没有数据，但是未来会有。
    *   **内容**: `code`, `width`, `isCollapsed`, `hiddenSections` 等。
    *   **职责**: 具体的 React 组件（`TextNode`）直接从这里订阅自己的数据来渲染，**绕过 React Flow 的 props 传递**。

3.  **Eval Store (`evalData`)**: **计算引擎的“逻辑世界”**
    *   **结构** (Map形式): `Map<NodeId, EvalResult>`
    *   **内容**: `outputs`, `logs`, `errors`, `controls` (计算出的最新值)。

#### B. 数据流向变化

*   **Before**: Canvas -> ReactFlow (props: nodes) -> Node组件 (props: data)
*   **After**:
    *   Canvas -> ReactFlow (props: flowData) -> Node组件 (只是个空壳)
    *   Canvas -> uiData API -> `useNodeState(id)` -> Node组件 (从 `uiData` 获取 code, isCollapsed 等)
    *   Canvas -> eval API -> `useNodeEval(id)` -> Node组件 (从 `eval` 获取 outputs 等)

#### C. 对你计划的具体点评

1.  **关于 ID 一致性 (Phase 1)**:
    *   你的担心是对的。在 Phase 1（数组并存）阶段，必须严格保证 `flowData` 的增删操作同步触发 `uiData` 的增删。我们暂时用 useEffect 来进行

2.  **关于 Map 改造 (Phase 2)**:
    *   这是性能优化的关键。React Flow 内部其实也是用 Map 索引的，但暴露给用户的是数组。我们在 `uiData` 层改用 Map 后，`useNodeState(id)` 的复杂度从 O(n) 降为 O(1)，这对大图非常重要。

3.  **关于存档 (Persistence)**:
    *   存档结构应该变成：
        ```json
        {
          "flow": { "nodes": [...], "edges": [...], "viewport": ... },
          "uiData": { "node-1": { "code": "...", "width": 400 ... }, ... }
        }
        ```
    *   加载时，分别填充 uiData 和 flowData。
接下来跟你说说我的重构计划，然后你可以阅读新的文件（如果你需要的话）。
我的重构计划分为如下几步：
1. 我们现在可能Canvas组件通过ReactFlow组件向TextNode组件传递一些数据，即使这些数据实际上不被用到。为了逻辑清晰，以及绕开react flow使用数组形式存储图结构的天然缺陷，我们把面向reactflow的数据传递彻底弱化，我们向reactflow里传的nodes和edges数组不再包含任何我们业务的数据（代码内容，等等），只包含reactflow自带的数据（节点位置，等等），这两个数组变为独立状态（不用store，仅为react state）。我们把面向reactflow的数据从uiData里拆分出来命名为flowData（flowNodes, flowEdges），同样也是nodes数组+edges数组的形式，flowData只用于声明式的创建节点UI删除节点UI，以及创建删除边，以及维护位置等数据。需要保证flowData里的id和uiData的id能一致对上，临时使用低效的双遍历算法，因为后面我们会把uiData模块和eval模块都从数组形式改成Map形式。这时候存档时把flowData和uiData并列存储。然后ReactFlow的onNodeChange和onEdgeChange不再对接uiData的handlexxxChange，而是直接应用在flowData上。
2. 把uiData模块和eval模块里面的nodes数据和edges数据从数组形式改成Map形式。然后这样的话node数据就不必再存储id了。重写delta resolution逻辑。
3. 把eval模块重构成使用useSyncExternalStore的模块，方便以后做出其他版本（nix画布，julia画布，...）并且作为tauri跨平台应用时，搭建起前后端架构，后端计算。


然后这里还有另一个AI关于这个重构计划的一些补充说明。