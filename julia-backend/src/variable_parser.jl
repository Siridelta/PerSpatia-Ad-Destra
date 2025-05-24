# 变量解析器 - 解析Julia代码中的变量定义和类型

"""
变量信息结构体
"""
struct VariableInfo
    name::String
    type::String  # "number", "string", "boolean", "range", "unknown"
    value::Any
    default_value::Any
    constraints::Union{Dict{String, Any}, Nothing}
    is_user_defined::Bool
end

"""
解析@input标记的变量（新语法支持）
支持两种格式：
1. 控件输入：@slidebar(min, max, step, default) variableName
2. 节点输入：@input variableName (从上游节点获取)
3. 自动检测：代码中使用但未定义的变量自动视为输入变量
"""
function parse_input_variables(code::String)::Vector{VariableInfo}
    variables = VariableInfo[]
    
    # 解析控件输入的正则表达式
    # 格式: @slidebar(min, max, step, default) variableName 或 @inputbox(default) variableName 等
    control_regex = r"@(\w+)\(([^)]*)\)\s+(\w+)"
    
    # 解析显式节点输入的正则表达式  
    # 格式: @input variableName
    input_regex = r"@input\s+(\w+)"
    
    # 解析控件输入
    for match in eachmatch(control_regex, code)
        control_type = String(match.captures[1])
        params_str = String(match.captures[2])
        var_name = String(match.captures[3])
        
        println("Debug: 捕获到控件变量: $var_name, 控制类型: $control_type, 参数: $params_str")
        
        variable = parse_control_variable(var_name, control_type, params_str)
        if variable !== nothing
            push!(variables, variable)
        end
    end
    
    # 解析显式节点输入
    for match in eachmatch(input_regex, code)
        var_name = String(match.captures[1])
        
        println("Debug: 捕获到显式输入变量: $var_name")
        
        # 节点输入变量默认为数字类型，不是用户定义的
        variable = VariableInfo(
            var_name, "number", 0.0, 0.0, nothing, false
        )
        push!(variables, variable)
    end
    
    # 自动检测未定义但被使用的变量
    undefined_vars = find_undefined_variables(code)
    for var_name in undefined_vars
        # 检查是否已经被显式定义
        if !any(v -> v.name == var_name, variables)
            println("Debug: 自动检测到输入变量: $var_name")
            
            variable = VariableInfo(
                var_name, "number", 0.0, 0.0, nothing, false
            )
            push!(variables, variable)
        end
    end
    
    return variables
end

"""
查找代码中使用但未定义的变量（推断为输入变量）
"""
function find_undefined_variables(code::String)::Vector{String}
    undefined_vars = String[]
    
    # 预处理代码，移除注释和字符串字面量
    processed_code = remove_comments_and_strings(code)
    
    # 查找所有变量使用
    used_vars = Set{String}()
    var_usage_regex = r"\b([a-zA-Z_][a-zA-Z0-9_]*)\b"
    for match in eachmatch(var_usage_regex, processed_code)
        var_name = match.captures[1]
        # 过滤掉Julia关键字和内置函数
        if !is_julia_keyword(var_name)
            push!(used_vars, var_name)
        end
    end
    
    # 查找所有变量定义
    defined_vars = Set{String}()
    
    # 1. const 定义
    const_regex = r"const\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*="
    for match in eachmatch(const_regex, processed_code)
        push!(defined_vars, match.captures[1])
    end
    
    # 2. 普通赋值
    assign_regex = r"([a-zA-Z_][a-zA-Z0-9_]*)\s*="
    for match in eachmatch(assign_regex, processed_code)
        push!(defined_vars, match.captures[1])
    end
    
    # 3. 控件变量定义
    control_regex = r"@\w+\([^)]*\)\s+([a-zA-Z_][a-zA-Z0-9_]*)"
    for match in eachmatch(control_regex, processed_code)
        push!(defined_vars, match.captures[1])
    end
    
    # 4. 显式输入变量
    input_regex = r"@input\s+([a-zA-Z_][a-zA-Z0-9_]*)"
    for match in eachmatch(input_regex, processed_code)
        push!(defined_vars, match.captures[1])
    end
    
    # 找出使用但未定义的变量
    for var_name in used_vars
        if !(var_name in defined_vars)
            push!(undefined_vars, var_name)
        end
    end
    
    return unique(undefined_vars)
end

"""
移除代码中的注释和字符串字面量，避免误判
"""
function remove_comments_and_strings(code::String)::String
    processed = code
    
    # 移除单行注释
    processed = replace(processed, r"#.*$"m => "")
    
    # 更准确地移除字符串字面量，处理转义字符
    # 移除双引号字符串
    processed = replace(processed, r"\"(?:[^\"\\]|\\.)*\"" => " STRING ")
    # 移除单引号字符串  
    processed = replace(processed, r"'(?:[^'\\]|\\.)*'" => " STRING ")
    
    # 移除@标记行，这些不应该参与变量检测
    processed = replace(processed, r"@\w+.*?(\n|$)" => "")
    
    return processed
end

"""
检查是否为Julia关键字或内置函数
"""
function is_julia_keyword(word::AbstractString)::Bool
    word_str = String(word)  # 转换为String类型以确保兼容性
    keywords = Set([
        "true", "false", "if", "else", "elseif", "end", "for", "while", "do", 
        "try", "catch", "finally", "function", "return", "const", "let", "global",
        "local", "import", "using", "export", "module", "struct", "mutable", "abstract",
        "primitive", "type", "where", "in", "isa", "begin", "quote", "macro",
        # 数学函数
        "sin", "cos", "tan", "sqrt", "log", "exp", "abs", "max", "min", "sum",
        "length", "size", "println", "print", "string", "Int", "Float64", "String", "Bool",
        # 自定义标记关键字 - 防止被误识别为变量
        "output", "slidebar", "inputbox", "switch", "input", "log"
    ])
    return word_str in keywords
end

"""
解析@log语句
"""
function parse_log_statements(code::String)::Vector{String}
    logs = String[]
    
    # 解析 @log 语句的正则表达式
    # 支持格式: @log "message" 或 @log expression
    log_regex = r"@log\s+(.+?)(?:\n|$)"
    
    for match in eachmatch(log_regex, code)
        log_content = strip(match.captures[1])
        push!(logs, log_content)
    end
    
    return logs
end

"""
解析@output标记的变量
"""
function parse_output_variables(code::String)::Vector{String}
    outputs = String[]
    
    # 解析 @output 变量的正则表达式
    output_regex = r"@output\s+(\w+)"
    
    for match in eachmatch(output_regex, code)
        push!(outputs, match.captures[1])
    end
    
    return outputs
end

"""
解析单个控件变量
支持的控件类型：
- @slidebar(min, max, step, default) variableName - 滑动条
- @inputbox(default) variableName - 文本输入框  
- @switch(default) variableName - 开关
"""
function parse_control_variable(name::String, control_type::String, params_str::String)::Union{VariableInfo, Nothing}
    params = split(strip(params_str), ',')
    params = map(strip, params)
    
    if control_type == "slidebar"
        # 解析滑动条参数: @slidebar(min, max, step, default) variableName
        min_val = length(params) >= 1 ? tryparse(Float64, params[1]) : 0.0
        max_val = length(params) >= 2 ? tryparse(Float64, params[2]) : 100.0
        step_val = length(params) >= 3 ? tryparse(Float64, params[3]) : 1.0
        default_val = length(params) >= 4 ? tryparse(Float64, params[4]) : (min_val === nothing ? 0.0 : min_val)
        
        # 处理解析失败的情况
        min_val = min_val === nothing ? 0.0 : min_val
        max_val = max_val === nothing ? 100.0 : max_val
        step_val = step_val === nothing ? 1.0 : step_val
        default_val = default_val === nothing ? min_val : default_val
        
        constraints = Dict{String, Any}(
            "min" => min_val,
            "max" => max_val,
            "step" => step_val
        )
        
        return VariableInfo(
            name, "range", default_val, default_val, constraints, true
        )
        
    elseif control_type == "inputbox"
        # 解析文本输入框参数: @inputbox(default) variableName
        default_val = length(params) >= 1 ? strip(params[1], ['"', '\'']) : ""
        
        return VariableInfo(
            name, "string", default_val, default_val, nothing, true
        )
        
    elseif control_type == "switch"
        # 解析开关参数: @switch(default) variableName
        default_val = length(params) >= 1 ? (lowercase(strip(params[1])) == "true") : false
        
        return VariableInfo(
            name, "boolean", default_val, default_val, nothing, true
        )
    else
        # 不支持的控件类型
        println("Warning: 不支持的控件类型: $control_type")
        return nothing
    end
end

"""
解析代码中的常量定义 (如 const x = 5)
"""
function parse_constants(code::String)::Dict{String, Any}
    constants = Dict{String, Any}()
    
    # 简单的常量定义匹配
    const_regex = r"const\s+(\w+)\s*=\s*([^;\n]+)"
    
    for match in eachmatch(const_regex, code)
        var_name = match.captures[1]
        expr_str = strip(match.captures[2])
        
        # 这里暂时简单处理，后续可以扩展为完整的表达式解析
        constants[var_name] = expr_str
    end
    
    return constants
end 