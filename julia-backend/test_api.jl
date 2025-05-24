#!/usr/bin/env julia

# 测试 Julia Canvas Backend API

using HTTP
using JSON3

const BASE_URL = "http://127.0.0.1:8081"

function test_health()
    println("🔍 测试健康检查接口...")
    try
        response = HTTP.get("$BASE_URL/api/health")
        if response.status == 200
            println("✅ 健康检查成功")
            return true
        else
            println("❌ 健康检查失败: HTTP $(response.status)")
            return false
        end
    catch e
        println("❌ 健康检查异常: $e")
        return false
    end
end

function test_parse()
    println("🔍 测试代码解析接口...")
    
    test_code = """
    @input x @slider(0, 100, 1, 50)
    @input y @slider(0, 100, 1, 30)
    const sum = x + y
    const product = x * y
    @output sum
    @output product
    """
    
    try
        headers = ["Content-Type" => "application/json"]
        body = JSON3.write(Dict("code" => test_code))
        
        response = HTTP.post("$BASE_URL/api/parse", headers, body)
        
        if response.status == 200
            result = JSON3.read(String(response.body))
            println("✅ 代码解析成功")
            println("   变量: $(length(result.variables))")
            println("   输出: $(length(result.output_names))")
            return true
        else
            println("❌ 代码解析失败: HTTP $(response.status)")
            println("   响应: $(String(response.body))")
            return false
        end
    catch e
        println("❌ 代码解析异常: $e")
        return false
    end
end

function test_evaluate()
    println("🔍 测试代码执行接口...")
    
    test_code = """
    @input x @slider(0, 100, 1, 50)
    @input y @slider(0, 100, 1, 30)
    const sum = x + y
    const product = x * y
    @output sum
    @output product
    """
    
    input_values = Dict("x" => 10, "y" => 20)
    
    try
        headers = ["Content-Type" => "application/json"]
        body = JSON3.write(Dict(
            "code" => test_code,
            "input_values" => input_values
        ))
        
        response = HTTP.post("$BASE_URL/api/evaluate", headers, body)
        
        if response.status == 200
            result = JSON3.read(String(response.body))
            println("✅ 代码执行成功")
            println("   成功: $(result.success)")
            if result.success
                println("   常量: $(result.constants)")
                println("   输出: $(result.outputs)")
            else
                println("   错误: $(result.error_message)")
            end
            return result.success
        else
            println("❌ 代码执行失败: HTTP $(response.status)")
            println("   响应: $(String(response.body))")
            return false
        end
    catch e
        println("❌ 代码执行异常: $e")
        return false
    end
end

function main()
    println("🚀 开始测试 Julia Canvas Backend API")
    
    # 等待服务器启动
    println("⏳ 等待服务器启动...")
    sleep(2)
    
    success_count = 0
    total_tests = 3
    
    # 测试健康检查
    if test_health()
        success_count += 1
    end
    
    println()
    
    # 测试代码解析
    if test_parse()
        success_count += 1
    end
    
    println()
    
    # 测试代码执行
    if test_evaluate()
        success_count += 1
    end
    
    println()
    println("📊 测试完成: $success_count/$total_tests 通过")
    
    if success_count == total_tests
        println("🎉 所有测试通过！")
    else
        println("⚠️  有测试失败，请检查服务器状态")
    end
end

if abspath(PROGRAM_FILE) == @__FILE__
    main()
end 