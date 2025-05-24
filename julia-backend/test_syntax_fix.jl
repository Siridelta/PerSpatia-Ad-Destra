#!/usr/bin/env julia

# 测试语法修复功能

using Pkg
Pkg.activate(".")

include("src/JuliaCanvasBackend.jl")
using .JuliaCanvasBackend

println("🧪 测试语法修复功能")

# 测试1: 字符串连接错误修复
println("\n📝 测试1: 字符串连接错误修复")
test_code1 = """
@input x @slider(0, 100, 1, 50)
@input y @slider(0, 100, 1, 30)
const sum = x + y
const product = x * y
@output sum
@output product
const result = "Average: " + string((sum + product) / 2) + ", Ratio: " + string(product / sum)
@output result
"""

result1 = safe_evaluate(test_code1, Dict{String, Any}("x" => 50, "y" => 30))
println("结果1: ", result1.success ? "✅ 成功" : "❌ 失败")
if !result1.success
    println("错误: ", result1.error_message)
end

# 测试2: 向量语法错误修复
println("\n📝 测试2: 向量语法错误修复")
test_code2 = """
@input x @slider(0, 100, 1, 50)
@input y @slider(0, 100, 1, 30)
const sum = x + y
const product = x * y
const average = (sum + product) / 2
const ratio = product / sum
@output average
@output ratio
const result = {average, ratio}
@output result
"""

result2 = safe_evaluate(test_code2, Dict{String, Any}("x" => 50, "y" => 30))
println("结果2: ", result2.success ? "✅ 成功" : "❌ 失败")
if !result2.success
    println("错误: ", result2.error_message)
end

# 测试3: 混合语法错误修复
println("\n📝 测试3: 混合语法错误修复")
test_code3 = """
@input name @text("Julia")
@input value @slider(1, 100, 1, 42)
const greeting = "Hello, " + name + "!"
const info = "Value: " + string(value)
const data = {greeting, info, value}
@output greeting
@output info
@output data
"""

result3 = safe_evaluate(test_code3, Dict{String, Any}("name" => "World", "value" => 42))
println("结果3: ", result3.success ? "✅ 成功" : "❌ 失败")
if !result3.success
    println("错误: ", result3.error_message)
end

println("\n🎯 测试总结:")
total_tests = 3
passed_tests = sum([result1.success, result2.success, result3.success])
println("通过: $passed_tests/$total_tests")

if passed_tests == total_tests
    println("🎉 所有语法修复测试通过！")
else
    println("⚠️  有测试失败，需要进一步调试")
end 