# 变量控件功能测试

## 测试用例

### 测试1：手动标记变量（基本功能）
在节点中输入以下代码，测试手动标记的变量控件：

```julia
# @var x: slider(0, 10, 1)
# @var name: text("Hello")
# @var enabled: toggle(true)

result = x * 2
println("Hello, $name! Result: $result, Enabled: $enabled")
```

预期结果：
- 节点下方显示可点击的分割线
- 点击分割线展开控件区
- x 变量显示为滑动条 (0-10, 步长1)
- name 变量显示为文本输入框（右键清空）
- enabled 变量显示为开关（显示 true/false）
- 只有手动标记的变量显示控件

### 测试2：滑动条参数编辑
```julia
# @var speed: slider(1, 100, 5)
# @var precision: slider(0.1, 1.0, 0.1)

distance = speed * time
```

预期结果：
- 点击滑动条右侧数值，弹出编辑面板
- 可以修改最小值、最大值、步长
- 按 Enter 保存，Esc 取消
- 修改后滑动条范围立即更新

### 测试3：灵活的手动标记语法
```julia
# @var count: slider(1, 10, 1)
# @var message: text("Hello World")
# @var debug: toggle(false)
# @var factor: slider(0.5, 2.0, 0.1, 1.2)

for i in 1:count
    if debug
        println("$message iteration $i, factor: $factor")
    end
end
```

预期结果：
- count: 滑动条 1-10，步长1，默认值1
- message: 文本输入，默认值"Hello World"
- debug: 开关，默认值false
- factor: 滑动条 0.5-2.0，步长0.1，默认值1.2

### 测试4：控件区交互
```julia
# @var x: slider(0, 100, 1)
# @var y: slider(0, 100, 1)

result = sqrt(x^2 + y^2)
```

预期结果：
- 分割线可点击收起/展开控件区
- 折叠状态下只显示分割线
- 展开状态下显示所有控件

## 测试步骤

1. 启动开发服务器：`pnpm dev`
2. 在浏览器中打开应用
3. 创建新节点 (双击空白区域)
4. 输入测试代码
5. 按 Shift+Enter 退出编辑
6. 观察节点下方出现分割线
7. 点击分割线展开控件区
8. 测试各种控件功能
9. 点击滑动条数值测试参数编辑
10. 测试文本输入框右键清空功能

## 预期功能

- [x] 只支持手动标记变量（不自动检测）
- [x] 手动标记语法灵活且强大
- [x] 分割线替代标题，可点击折叠/展开
- [x] 滑动条数值可点击编辑参数
- [x] 参数编辑面板美观且功能完整
- [x] 文本输入框右键清空
- [x] 开关显示true/false并右对齐
- [x] 样式符合极简设计风格
- [x] 变量值和约束参数变化时保持状态

## 手动标记语法

```julia
# 滑动条
# @var variableName: slider(min, max, step, defaultValue)
# @var x: slider(0, 10, 1)          # 0-10，步长1，默认值0
# @var y: slider(0, 10, 1, 5)       # 0-10，步长1，默认值5

# 文本输入
# @var variableName: text("defaultValue")
# @var name: text("Hello")          # 默认值"Hello"
# @var message: text("")            # 默认值为空

# 开关
# @var variableName: toggle(defaultValue)
# @var enabled: toggle(true)        # 默认开启
# @var debug: toggle(false)         # 默认关闭
```

## 新功能特点

- ✅ **纯手动控制**：只显示明确标记的变量，避免误判
- ✅ **参数实时编辑**：点击数值即可修改滑动条范围和步长
- ✅ **极简界面**：去除不必要的标题，用分割线控制展开
- ✅ **直观交互**：hover效果和点击反馈清晰
- ✅ **灵活语法**：支持默认值设置，语法简洁明了

# 功能测试文档

## 新实现的功能

### 1. 新的连接方式
- **鼠标中键连接**：
  - 用鼠标中键点击第一个节点，再中键点击第二个节点，创建从第一个到第二个的连接
  - 中键点击同一个节点可以取消连接状态
  
- **连接模式左键连接**：
  - 按C键进入连接模式（工具栏也会显示）
  - 在连接模式下，左键点击第一个节点，再左键点击第二个节点，创建连接
  - 连接完成后自动切回选择模式

### 2. 新的控件语法
- **@input 变量**：定义需要输入的变量
  - `@input myVar` - 默认文本输入
  - `@input myVar @slider(min, max, step)` - 滑动条
  - `@input myVar @string("default")` - 字符串输入
  - `@input myVar @boolean(true)` - 布尔开关
  
- **@output 变量**：将变量显示在节点上
  - `@output myVar` - 在代码和控件之间显示输出变量

### 3. 节点动画
- 节点大小变化时有平滑的动画过渡效果
- 输出变量区有淡入动画

## 测试步骤

1. **测试@input和@output语法**：
   - 打开应用，查看示例节点是否正确解析@input和@output
   - 编辑节点，添加`@input test @slider(0, 100, 1)`，检查是否生成滑动条
   - 添加`@output test`，检查是否在输出区显示

2. **测试中键连接**：
   - 用鼠标中键点击节点1
   - 再用中键点击节点2
   - 应该创建从节点1到节点2的连接

3. **测试连接模式**：
   - 按C键进入连接模式
   - 左键点击节点1，再左键点击节点2
   - 应该创建连接并自动切回选择模式

4. **测试节点动画**：
   - 拖动节点边缘调整大小
   - 观察是否有平滑的尺寸变化动画

## 预期结果

- 所有新语法应该正确解析和渲染
- 连接功能应该正常工作
- 动画应该流畅自然
- 不应该有控制台错误 