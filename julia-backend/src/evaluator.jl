# 代码执行器 - 安全执行Julia代码并返回结果

"""
代码执行结果结构体
"""
struct EvaluationResult
    success::Bool
    outputs::Dict{String, Any}  # 输出变量的值
    constants::Dict{String, Any}  # 常量定义的值
    variables::Vector{VariableInfo}  # 输入变量信息
    output_names::Vector{String}  # @output标记的变量名
    error_message::Union{String, Nothing}
    error_details::Union{String, Nothing}  # 详细错误信息包括栈追踪
    logs::Vector{String}  # console输出和@log输出
end

"""
执行Julia代码片段
"""
function evaluate_code(code::String, input_values::Dict{String, Any} = Dict{String, Any}())::EvaluationResult
    try
        # 解析输入变量
        input_variables = parse_input_variables(code)
        output_names = parse_output_variables(code)
        
        # 解析@log语句
        log_statements = parse_log_statements(code)
        collected_logs = String[]
        
        # 创建执行环境
        execution_env = Module()
        
        # 设置输入变量的值
        for var in input_variables
            var_name = var.name
            if haskey(input_values, var_name)
                value = input_values[var_name]
            else
                value = var.default_value
            end
            
            # 在执行环境中定义变量
            Core.eval(execution_env, :($(Symbol(var_name)) = $value))
        end
        
        # 添加常用数学函数
        Core.eval(execution_env, :(import Base: +, -, *, /, ^, sqrt, sin, cos, tan, log, exp, abs))
        
        # 预处理代码：移除控件和节点输入标记，处理@log语句，修复常见语法错误
        processed_code = preprocess_code(code)
        
        # 处理@log语句
        processed_code_with_logs = process_log_statements(processed_code, log_statements)
        
        println("Debug: 处理后的代码:")
        println(processed_code_with_logs)
        
        # 直接执行代码，不捕获stdout（简化处理）
        try
            # 执行代码 - 使用include_string来处理多行代码
            if !isempty(strip(processed_code_with_logs))
                include_string(execution_env, processed_code_with_logs)
            end
        catch execution_error
            # 如果执行出错，重新抛出
            rethrow(execution_error)
        end
        
        # 收集@log语句产生的日志
        for log_stmt in log_statements
            try
                # 在执行环境中计算log表达式的值
                result = Core.eval(execution_env, Meta.parse(log_stmt))
                push!(collected_logs, string(result))
            catch e
                push!(collected_logs, "Log error: $log_stmt -> $e")
            end
        end
        
        # 收集输出变量的值
        outputs = Dict{String, Any}()
        for output_name in output_names
            if isdefined(execution_env, Symbol(output_name))
                outputs[output_name] = Core.eval(execution_env, Symbol(output_name))
            else
                outputs[output_name] = "未定义"
            end
        end
        
        # 收集常量定义的值
        constants = collect_constants(execution_env, code)
        
        return EvaluationResult(
            true, outputs, constants, input_variables, output_names, nothing, nothing, collected_logs
        )
        
    catch e
        @error "代码执行错误" exception=(e, catch_backtrace())
        
        # 生成友好的错误消息
        error_msg = if isa(e, LoadError)
            "第$(e.line)行: $(e.error)"
        elseif isa(e, UndefVarError)
            "未定义变量: $(e.var)"
        elseif isa(e, MethodError)
            "方法错误: $(e.f) 不能应用于参数 $(typeof.(e.args))"
        elseif isa(e, BoundsError)
            "数组越界错误: $(e)"
        elseif isa(e, ArgumentError)
            "参数错误: $(e.msg)"
        else
            string(e)
        end
        
        # 生成详细的栈追踪信息
        bt = catch_backtrace()
        error_details = sprint() do io
            println(io, "错误类型: $(typeof(e))")
            println(io, "错误信息: $error_msg")
            println(io, "\n栈追踪:")
            Base.show_backtrace(io, bt)
        end
        
        return EvaluationResult(
            false, Dict{String, Any}(), Dict{String, Any}(), 
            VariableInfo[], String[], error_msg, error_details, String[]
        )
    end
end

"""
预处理代码：移除控件和节点输入标记，移除@log语句，修复常见语法错误
"""
function preprocess_code(code::String)::String
    processed = code
    
    # 移除控件标记行（包括整行）
    # @slidebar(min, max, step, default) variableName
    processed = replace(processed, r"@slidebar\([^)]*\)\s+\w+\s*(\n|$)" => "")
    
    # @inputbox(default) variableName  
    processed = replace(processed, r"@inputbox\([^)]*\)\s+\w+\s*(\n|$)" => "")
    
    # @switch(default) variableName
    processed = replace(processed, r"@switch\([^)]*\)\s+\w+\s*(\n|$)" => "")
    
    # 移除@input标记行
    processed = replace(processed, r"@input\s+\w+\s*(\n|$)" => "")
    
    # 移除@output行（包括整行）
    processed = replace(processed, r"@output\s+\w+\s*(\n|$)" => "")
    
    # 移除@log行（这些在process_log_statements中单独处理）
    processed = replace(processed, r"@log\s+.+?(\n|$)" => "")
    
    # 语法修复：将过时的{}向量语法替换为[]
    processed = replace(processed, r"\{([^}]*)\}" => s"[\1]")
    
    # 语法修复：修复字符串连接（将字符串+字符串替换为字符串*字符串）
    # 这个正则表达式匹配引号包围的字符串之间的+操作符
    processed = replace(processed, r"\"([^\"]*)\"\s*\+\s*\"([^\"]*)\""  => s"\"\1\" * \"\2\"")
    processed = replace(processed, r"'([^']*)'\s*\+\s*'([^']*)'"  => s"'\1' * '\2'")
    
    # 语法修复：修复变量与字符串的连接
    # 匹配 变量名 + "字符串" 或 "字符串" + 变量名 的模式
    processed = replace(processed, r"(\w+)\s*\+\s*(\"[^\"]*\")" => s"\1 * \2")
    processed = replace(processed, r"(\"[^\"]*\")\s*\+\s*(\w+)" => s"\1 * \2")
    processed = replace(processed, r"(\w+)\s*\+\s*('[^']*')" => s"\1 * \2")
    processed = replace(processed, r"('[^']*')\s*\+\s*(\w+)" => s"\1 * \2")
    
    # 语法修复：修复函数调用结果与字符串的连接
    # 匹配 function(...) + "字符串" 或 "字符串" + function(...) 的模式
    processed = replace(processed, r"(\w+\([^)]*\))\s*\+\s*(\"[^\"]*\")" => s"\1 * \2")
    processed = replace(processed, r"(\"[^\"]*\")\s*\+\s*(\w+\([^)]*\))" => s"\1 * \2")
    processed = replace(processed, r"(\w+\([^)]*\))\s*\+\s*('[^']*')" => s"\1 * \2")
    processed = replace(processed, r"('[^']*')\s*\+\s*(\w+\([^)]*\))" => s"\1 * \2")
    
    # 语法修复：修复复杂表达式与字符串的连接
    # 匹配 任何表达式 + "字符串" 的模式（更通用的处理）
    # 注意：这个要放在最后，因为它比较通用
    processed = replace(processed, r"([^+\s]+)\s*\+\s*(\"[^\"]*\")" => s"\1 * \2")
    processed = replace(processed, r"(\"[^\"]*\")\s*\+\s*([^+\s]+)" => s"\1 * \2")
    
    # 移除多余的空行
    processed = replace(processed, r"\n\s*\n" => "\n")
    processed = strip(processed)
    
    return processed
end

"""
处理@log语句，将它们转换为println调用
"""
function process_log_statements(code::String, log_statements::Vector{String})::String
    processed = code
    
    # 为每个@log语句生成对应的println
    for log_stmt in log_statements
        println_stmt = "println($log_stmt)"
        processed = processed * "\n" * println_stmt
    end
    
    return processed
end

"""
收集执行环境中的常量定义
"""
function collect_constants(env::Module, original_code::String)::Dict{String, Any}
    constants = Dict{String, Any}()
    
    # 解析原始代码中的常量定义
    const_defs = parse_constants(original_code)
    
    for (name, _) in const_defs
        if isdefined(env, Symbol(name))
            constants[name] = Core.eval(env, Symbol(name))
        end
    end
    
    return constants
end

"""
安全执行代码的包装函数（未来可以添加沙箱功能）
"""
function safe_evaluate(code::String, input_values::Dict{String, Any} = Dict{String, Any}())::EvaluationResult
    # 这里可以添加代码安全检查
    # 例如：禁止文件操作、网络请求等危险操作
    
    return evaluate_code(code, input_values)
end 