AI助手请查阅 working-notes 文件夹中的文件，以获取背景信息。

# Desmos Canvas

基于JavaScript+React Flow的画布式编程环境，支持变量、表达式、公式对象的可视化、交互式编辑与复合，并与Bernard.js库协作构建Desmos图表。

## 🚀 快速开始

### 安装依赖

1. **安装 pnpm（如未安装）**

   推荐使用 [pnpm](https://pnpm.io/zh/installation) 作为包管理工具。你可以通过以下命令全局安装 pnpm：

   ```bash
   npm install -g pnpm
   ```

2. **安装项目依赖**

   进入前端项目目录，执行依赖安装：

   ```bash
   cd solution-react-flow
   pnpm install
   ```

   这将自动安装所有所需依赖包。

### 启动前端（React开发服务器）
```bash
cd solution-react-flow
pnpm dev
```

## 📡 服务地址

- **前端界面**: http://127.0.0.1:5173

## 🛠️ 技术栈

### 后端
目前本项目没有后端，所有功能均在浏览器端实现，数据和计算都在本地完成。后续如果有需要，可以考虑增加基于 JavaScript 的后端服务，或者在实现 Julia 版本时，配套开发 Julia 后端以支持更复杂的计算和数据处理。

### 前端
- **React + TypeScript**: 前端框架
- **React Flow**: 画布和节点系统
- **Vite**: 构建工具
- **TailwindCSS**: 样式框架
- **Zustand + Immer**: 状态管理

### 其他依赖
- **Bernard.js**：自研的 Desmos 图表生成库，与画布系统深度集成，实现数学表达式的可视化和交互

## 🎯 核心功能

### ✅ 已实现
- [x] JavaScript代码节点编辑和执行
- [x] 变量控件系统（@input/@output标记）
  - [x] 滑动条控件 (`@slider`)
  - [x] 文本输入控件 (`@string`)
  - [x] 布尔开关控件 (`@boolean`)
- [x] 实时代码执行和结果显示
- [x] 节点间连接和数据流
- [x] 多模式工具栏（选择/文本/连接模式）
- [x] 键盘快捷键支持（WASD移动，V/T/C模式切换）
- [x] 画布状态持久化（自动保存/恢复）
- [x] 导入/导出功能
- [x] 错误处理和用户反馈

### 🚧 开发中
- [ ] JavaScript语法高亮
- [ ] 节点间依赖关系可视化
- [ ] Desmos预览和导出
- [ ] Bernard.js集成
- [ ] 更多变量控件类型
- [ ] 性能优化（大规模画布支持）
- [ ] 用户引导和帮助功能

## 💡 使用示例

创建一个简单的计算节点：

```javascript
const x = 50; // @c (0, 100, 1, 50)
const y = 30; // @c (0, 100, 1, 30)

const sum = x + y;        // @o
const product = x * y;    // @o
const average = sum / 2;  // @o
```

这将创建：
- 两个滑动条控件（x和y）
- 计算总和、乘积和平均值
- 显示三个输出结果
- 滑动条改变时实时更新计算结果

## 🔧 开发环境要求

### 必需
- **Node.js** (≥18)
- **pnpm** (≥8)

### 安装前端依赖
```powershell
cd solution-react-flow
pnpm install
```

## 📄 许可证

本项目采用 MIT 许可证。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！