# HTTP服务器 - 提供RESTful API接口

using HTTP
using JSON3
using Logging
using Dates

# 全局服务器引用
const SERVER = Ref{Union{HTTP.Server, Nothing}}(nothing)

"""
启动Julia后端服务器
"""
function start_server(port::Int = 8080, host::String = "127.0.0.1")
    @info "启动Julia Canvas后端服务器" port=port host=host
    
    # 路由处理函数
    function router(req::HTTP.Request)
        # 设置CORS头
        headers = [
            "Access-Control-Allow-Origin" => "*",
            "Access-Control-Allow-Methods" => "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers" => "Content-Type",
            "Content-Type" => "application/json"
        ]
        
        # 处理预检请求
        if req.method == "OPTIONS"
            return HTTP.Response(200, headers, "")
        end
        
        try
            # 路由分发
            if req.method == "POST"
                if req.target == "/api/evaluate"
                    return handle_evaluate(req, headers)
                elseif req.target == "/api/parse"
                    return handle_parse(req, headers)
                end
            elseif req.method == "GET"
                if req.target == "/api/health"
                    return handle_health(headers)
                end
            end
            
            # 404 未找到
            return HTTP.Response(404, headers, JSON3.write(Dict("error" => "路由未找到")))
            
        catch e
            @error "请求处理错误" exception=(e, catch_backtrace())
            error_response = Dict(
                "error" => "服务器内部错误",
                "details" => string(e)
            )
            return HTTP.Response(500, headers, JSON3.write(error_response))
        end
    end
    
    # 启动服务器
    server = HTTP.serve(router, host, port; verbose=false)
    SERVER[] = server
    
    @info "服务器启动成功" url="http://$host:$port"
    return server
end

"""
停止服务器
"""
function stop_server()
    if SERVER[] !== nothing
        HTTP.close(SERVER[])
        SERVER[] = nothing
        @info "服务器已停止"
    end
end

"""
健康检查接口
"""
function handle_health(headers::Vector{Pair{String, String}})
    response = Dict(
        "status" => "ok",
        "service" => "Julia Canvas Backend",
        "version" => "0.1.0",
        "timestamp" => string(now())
    )
    return HTTP.Response(200, headers, JSON3.write(response))
end

"""
代码执行接口
"""
function handle_evaluate(req::HTTP.Request, headers::Vector{Pair{String, String}})
    try
        # 解析请求体
        body = String(req.body)
        data = JSON3.read(body)
        
        code = get(data, "code", "")
        input_values_raw = get(data, "input_values", Dict{String, Any}())
        
        # 将JSON3.Object转换为Dict{String, Any}
        input_values = Dict{String, Any}()
        for (key, value) in pairs(input_values_raw)
            input_values[String(key)] = value
        end
        
        @info "执行代码请求" code_length=length(code) input_count=length(input_values)
        
        # 执行代码
        result = safe_evaluate(code, input_values)
        
        # 构造响应
        response = Dict(
            "success" => result.success,
            "outputs" => result.outputs,
            "constants" => result.constants,
            "variables" => [
                Dict(
                    "name" => var.name,
                    "type" => var.type,
                    "value" => var.value,
                    "default_value" => var.default_value,
                    "constraints" => var.constraints,
                    "is_user_defined" => var.is_user_defined
                ) for var in result.variables
            ],
            "output_names" => result.output_names,
            "error_message" => result.error_message,
            "logs" => result.logs
        )
        
        return HTTP.Response(200, headers, JSON3.write(response))
        
    catch e
        @error "执行接口错误" exception=(e, catch_backtrace())
        error_response = Dict(
            "success" => false,
            "error" => "请求处理失败",
            "details" => string(e)
        )
        return HTTP.Response(400, headers, JSON3.write(error_response))
    end
end

"""
代码解析接口（仅解析，不执行）
"""
function handle_parse(req::HTTP.Request, headers::Vector{Pair{String, String}})
    try
        # 解析请求体
        body = String(req.body)
        data = JSON3.read(body)
        
        code = get(data, "code", "")
        
        @info "解析代码请求" code_length=length(code)
        
        # 解析变量
        input_variables = parse_input_variables(code)
        output_names = parse_output_variables(code)
        constants = parse_constants(code)
        
        # 构造响应
        response = Dict(
            "variables" => [
                Dict(
                    "name" => var.name,
                    "type" => var.type,
                    "value" => var.value,
                    "default_value" => var.default_value,
                    "constraints" => var.constraints,
                    "is_user_defined" => var.is_user_defined
                ) for var in input_variables
            ],
            "output_names" => output_names,
            "constants" => constants
        )
        
        return HTTP.Response(200, headers, JSON3.write(response))
        
    catch e
        @error "解析接口错误" exception=(e, catch_backtrace())
        error_response = Dict(
            "error" => "解析失败",
            "details" => string(e)
        )
        return HTTP.Response(400, headers, JSON3.write(error_response))
    end
end 