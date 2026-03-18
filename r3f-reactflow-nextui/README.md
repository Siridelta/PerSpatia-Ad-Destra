# JuliaCanvas - JS版本

## 概述

已将后端从Julia改为纯前端JavaScript执行，提供完整的控件系统和代码执行环境。

## IO库使用说明

### 控件类

1. **滑动条控件 (Slider)**
```javascript
const slider = new Slider(defaultValue, min, max, step);
// 例如: new Slider(50, 0, 100, 1)
```

2. **输入框控件 (InputBox)**
```javascript
const input = new InputBox(defaultValue);
// 例如: new InputBox("Hello")
```

3. **开关控件 (Switch)**
```javascript
const switch = new Switch(defaultValue);
// 例如: new Switch(false)
```

### 输入输出函数

1. **node_input(控件对象, 名称)** - 创建输入控件
```javascript
const x = node_input(new Slider(50, 0, 100, 1), "x");
const text = node_input(new InputBox("Hello"), "text");
const enabled = node_input(new Switch(false), "enabled");
```

2. **node_output(值, 名称)** - 输出结果
```javascript
node_output(x * 2, "result");
node_output(text + " World", "greeting");
```

### 示例代码

```javascript
// 创建控件
const x = node_input(new Slider(50, 0, 100, 1), "x");
const y = node_input(new Slider(30, 0, 100, 1), "y");
const message = node_input(new InputBox("Hello"), "message");

// 计算
const sum = x + y;
const product = x * y;

// 输出日志
console.log("x =", x, "y =", y);
console.log("计算结果:", sum, product);

// 输出结果
node_output(sum, "sum");
node_output(product, "product");
node_output(message + " World!", "greeting");
```

## 功能特性

- ✅ 纯前端JS代码执行
- ✅ 三种控件类型（滑动条、输入框、开关）
- ✅ 控件右键清空功能
- ✅ 实时日志捕获
- ✅ 节点间数据连接
- ✅ 自动保存/恢复状态
- ✅ 可折叠的卡片界面

## 界面操作

- **双击节点**: 进入代码编辑模式
- **点击Code标签**: 显示/隐藏其他区域
- **右键输入框**: 清空到默认值
- **拖拽连接**: 在连接模式下连接节点
- **快捷键**: V(选择) / T(文本) / C(连接) / WASD(移动画布) 