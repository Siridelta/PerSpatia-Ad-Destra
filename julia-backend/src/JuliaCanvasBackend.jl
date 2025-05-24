module JuliaCanvasBackend

using HTTP
using JSON3
using Logging
using Dates

# 先导入变量解析器（定义了VariableInfo）
include("variable_parser.jl")
# 然后导入评估器（使用了VariableInfo）
include("evaluator.jl")
# 最后导入服务器（使用了前面的所有组件）
include("server.jl")

# 导出主要函数
export start_server, stop_server
export evaluate_code, safe_evaluate
export VariableInfo, EvaluationResult
export parse_input_variables, parse_output_variables, parse_constants

end # module 