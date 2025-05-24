# 简单连接测试用例（更新版）

## 快速测试：基础数据传递

### 节点A: 数据源
```julia
@slidebar(0, 100, 1, 50) x
@slidebar(0, 100, 1, 30) y
const sum = x + y;
const product = x * y;
@log "计算结果: sum=" * string(sum)
@log "product=" * string(product)
@output sum
@output product
```

### 节点B: 数据处理 (连接A)
```julia
# sum 和 product 将从连接的节点A自动获取（自动检测输入变量）
const average = (sum + product) / 2;
const ratio = product / sum;
@log "平均值: " * string(average)
@log "比值: " * string(ratio)
@output average
@output ratio
```

### 节点C: 最终结果 (连接B)
```julia
# average 和 ratio 将从连接的节点B自动获取
const result = "Average: " * string(round(average, digits=2)) * ", Ratio: " * string(round(ratio, digits=3));
@log result
@output result
```

## 新语法说明

### 输入变量语法
1. **自动检测**：代码中使用但未定义的变量会自动视为输入变量
2. **显式声明**：使用`@input variableName`显式声明输入变量

### 输出语法
- `@output variableName` - 标记变量为输出

### 日志语法
- `@log expression` - 输出日志，支持表达式或字符串

### 控件语法
- `@slidebar(min, max, step, defaultValue) variableName` - 滑动条控件
- `@inputbox(defaultValue) variableName` - 文本输入框
- `@switch(defaultValue) variableName` - 布尔开关

## 测试步骤

1. **创建三个节点**，输入上述代码
2. **建立连接**：
   - 节点A → 节点B（传递sum和product）
   - 节点B → 节点C（传递average和ratio）
3. **测试数据流**：
   - 调整节点A的x滑动条，观察所有节点的输出变化
   - 调整节点A的y滑动条，验证数据传递
4. **验证输出显示**：
   - 确认@output显示实际值
   - 检查连接后的输入变量值更新
   - 查看@log输出

## 预期结果（x=50, y=30时）
- 节点A显示：@output sum: 80, @output product: 1500
- 节点B显示：@output average: 790, @output ratio: 18.75
- 节点C显示：@output result: "Average: 790.00, Ratio: 18.750"

## 语法修复说明
- 使用Julia的字符串连接语法（`*`）替代JavaScript的`+`
- 使用`string()`函数将数值转换为字符串
- 使用`round(value, digits=n)`进行数值格式化
- 使用`@log`替代`console.log`