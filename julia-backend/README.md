# Julia Canvas Backend

为JuliaCanvas前端应用提供Julia代码执行和变量解析服务的后端。

## 功能特性

- **代码执行**: 安全执行Julia代码片段并返回结果
- **变量解析**: 解析`@input`和`@output`标记的变量
- **类型推断**: 自动识别变量类型并生成控件信息
- **RESTful API**: 提供HTTP接口供前端调用
- **CORS支持**: 支持跨域请求

## 安装和启动

### 1. 安装依赖

```bash
cd julia-backend
julia --project=. -e "using Pkg; Pkg.instantiate()"
```

### 2. 启动服务器

```bash
julia server.jl
```

服务器将在 `http://127.0.0.1:8080` 启动。

## API 端点

### GET /api/health

健康检查接口，返回服务状态。

**响应示例:**
```json
{
  "status": "ok",
  "service": "Julia Canvas Backend",
  "version": "0.1.0",
  "timestamp": "2025-01-XX..."
}
```

### POST /api/evaluate

执行Julia代码并返回结果。

**请求格式:**
```json
{
  "code": "@input x @slider(0, 100, 1, 50)\n@input y @slider(0, 100, 1, 30)\nconst sum = x + y\nconst product = x * y\n@output sum\n@output product",
  "input_values": {
    "x": 49,
    "y": 30
  }
}
```

**响应格式:**
```json
{
  "success": true,
  "outputs": {
    "sum": 79,
    "product": 1470
  },
  "constants": {
    "sum": 79,
    "product": 1470
  },
  "variables": [
    {
      "name": "x",
      "type": "range",
      "value": 49,
      "default_value": 50,
      "constraints": {
        "min": 0,
        "max": 100,
        "step": 1
      },
      "is_user_defined": true
    },
    {
      "name": "y",
      "type": "range", 
      "value": 30,
      "default_value": 30,
      "constraints": {
        "min": 0,
        "max": 100,
        "step": 1
      },
      "is_user_defined": true
    }
  ],
  "output_names": ["sum", "product"],
  "error_message": null,
  "logs": []
}
```

### POST /api/parse

仅解析代码结构，不执行代码。

**请求格式:**
```json
{
  "code": "@input x @slider(0, 100, 1)\n@output result"
}
```

**响应格式:**
```json
{
  "variables": [...],
  "output_names": ["result"],
  "constants": {}
}
```

## 支持的语法

### @input 变量定义

```julia
@input variableName                          # 默认字符串输入
@input myVar @slider(min, max, step)         # 滑动条
@input myVar @slider(min, max, step, default) # 带默认值的滑动条
@input myText @string("default value")       # 字符串输入
@input myFlag @boolean(true)                 # 布尔开关
```

### @output 变量输出

```julia
@output variableName   # 将变量标记为输出
```

### 常量定义

```julia
const result = x + y   # 常量定义会被执行并返回值
```

## 错误处理

当代码执行出错时，API会返回错误信息：

```json
{
  "success": false,
  "outputs": {},
  "constants": {},
  "variables": [],
  "output_names": [],
  "error_message": "具体的错误信息",
  "logs": []
}
```

## 开发说明

- 代码执行在隔离的模块环境中进行，确保安全性
- 支持基本的数学函数 (+, -, *, /, ^, sqrt, sin, cos等)
- 未来可扩展支持Bernard.jl等专业库 