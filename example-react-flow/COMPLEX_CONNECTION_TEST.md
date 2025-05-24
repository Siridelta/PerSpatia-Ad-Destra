# 复杂节点连接测试用例

## 测试场景：数学计算流水线

这个测试用例展示了一个复杂的数据流处理场景，包含多层依赖关系和数据传递。

### 节点布局图
```
[输入源A] ─┐
           ├─→ [计算节点C] ─┐
[输入源B] ─┘                ├─→ [最终结果] 
                            │
[输入源D] ──→ [处理节点E] ─┘
           ↑
[控制节点F] ┘
```

### 节点定义

#### 节点1: 输入源A - 基础数值输入
```julia
@slidebar(1, 100, 1, 10) baseValue
@slidebar(0.1, 5.0, 0.1, 2.0) multiplier
const processedA = baseValue * multiplier;
console.log("处理A: " + baseValue + " * " + multiplier + " = " + processedA);
@output processedA
```

#### 节点2: 输入源B - 角度和三角函数
```julia
@slidebar(0, 360, 1, 45) angle
@boolean(false) useRadians
const angleValue = useRadians ? angle * Math.PI / 180 : angle;
const sinValue = Math.sin(angleValue);
const cosValue = Math.cos(angleValue);
console.log("角度处理: " + angle + " -> sin=" + sinValue + ", cos=" + cosValue);
@output sinValue
@output cosValue
@output angleValue
```

#### 节点3: 计算节点C - 复合运算 (依赖A和B)
```julia
// processedA, sinValue, cosValue 将从连接的节点自动获取
const magnitude = Math.sqrt(processedA * processedA + sinValue * sinValue);
const phase = Math.atan2(sinValue, cosValue);
const complexResult = {
  real: processedA * cosValue,
  imag: processedA * sinValue,
  magnitude: magnitude,
  phase: phase
};
console.log("复数计算: magnitude=" + magnitude + ", phase=" + phase);
@output magnitude
@output phase
@output complexResult
```

#### 节点4: 输入源D - 数组处理
```julia
@slidebar(3, 10, 1, 5) arraySize
@slidebar(1, 100, 1, 42) seed
// 生成伪随机数组
const generateArray = (size, seed) => {
  const arr = [];
  let rng = seed;
  for (let i = 0; i < size; i++) {
    rng = (rng * 9301 + 49297) % 233280;
    arr.push((rng / 233280) * 100);
  }
  return arr;
};
const dataArray = generateArray(arraySize, seed);
const arraySum = dataArray.reduce((a, b) => a + b, 0);
const arrayAvg = arraySum / dataArray.length;
console.log("数组处理: 大小=" + arraySize + ", 和=" + arraySum + ", 平均=" + arrayAvg);
@output dataArray
@output arraySum
@output arrayAvg
```

#### 节点5: 处理节点E - 数据聚合 (依赖D和F)
```julia
// arraySum, arrayAvg, scaleFactor 将从连接的节点自动获取
const scaledSum = arraySum * scaleFactor;
const scaledAvg = arrayAvg * scaleFactor;
const metrics = {
  originalSum: arraySum,
  originalAvg: arrayAvg,
  scaledSum: scaledSum,
  scaledAvg: scaledAvg,
  scalingFactor: scaleFactor
};
console.log("数据聚合: 缩放因子=" + scaleFactor + ", 缩放后和=" + scaledSum);
@output scaledSum
@output scaledAvg
@output metrics
```

#### 节点6: 控制节点F - 动态参数
```julia
@boolean(true) isActive
@slidebar(0.1, 10.0, 0.1, 1.0) baseScale
@boolean(false) timeModulation
// 模拟时间变化的缩放因子
const timeValue = timeModulation ? (Date.now() % 10000) / 10000 : 0.5;
const dynamicScale = isActive ? baseScale * (1 + 0.5 * Math.sin(timeValue * Math.PI * 2)) : 1.0;
console.log("控制参数: 活跃=" + isActive + ", 基础缩放=" + baseScale + ", 动态缩放=" + dynamicScale);
@output scaleFactor: dynamicScale
```

#### 节点7: 最终结果 - 综合分析 (依赖C和E)
```julia
// magnitude, phase, scaledSum, scaledAvg, complexResult, metrics 将从连接的节点自动获取
const analysis = {
  geometric: {
    magnitude: magnitude,
    phase: phase,
    polar: magnitude.toFixed(2) + "∠" + (phase * 180 / Math.PI).toFixed(1) + "°"
  },
  statistical: {
    sum: scaledSum,
    average: scaledAvg,
    ratio: scaledSum / scaledAvg
  },
  complex: complexResult,
  summary: "Magnitude: " + magnitude.toFixed(2) + ", Scaled Sum: " + scaledSum.toFixed(2)
};
console.log("最终分析: " + analysis.summary);
@output analysis
@output summary: analysis.summary
```

### 连接关系
1. 节点1 → 节点3 (processedA)
2. 节点2 → 节点3 (sinValue, cosValue)
3. 节点4 → 节点5 (arraySum, arrayAvg)
4. 节点6 → 节点5 (scaleFactor)
5. 节点3 → 节点7 (magnitude, phase, complexResult)
6. 节点5 → 节点7 (scaledSum, scaledAvg, metrics)

### 测试步骤

1. **创建所有节点**：按顺序创建上述7个节点，每个节点输入对应的代码

2. **建立连接**（使用中键或C模式+左键）：
   - 节点1 中键点击 → 节点3 中键点击
   - 节点2 中键点击 → 节点3 中键点击
   - 节点4 中键点击 → 节点5 中键点击
   - 节点6 中键点击 → 节点5 中键点击
   - 节点3 中键点击 → 节点7 中键点击
   - 节点5 中键点击 → 节点7 中键点击

3. **交互测试**：
   - 调整节点1的baseValue滑动条，观察节点7的输出变化
   - 调整节点2的angle滑动条，观察三角函数计算的传播
   - 切换节点6的isActive开关，观察对整个数据流的影响
   - 调整节点4的arraySize，观察数组处理的变化

4. **验证数据流**：
   - 确认每个@output显示正确的值
   - 验证连接的节点能接收到正确的输入数据
   - 检查复杂计算的准确性
   - 查看console.log输出确认计算过程

### 预期效果
- 所有节点正确解析控件语法和@output
- 连接建立成功，数据在节点间正确传递
- 修改上游节点的参数会影响下游节点的计算结果
- 输出值实时更新并正确显示
- console.log输出显示详细的计算过程 