#!/usr/bin/env julia

# 安装依赖包脚本

using Pkg

println("🔧 安装 Julia Canvas Backend 依赖包...")

# 激活项目环境
Pkg.activate(".")

# 添加依赖包
println("📦 添加 HTTP 包...")
Pkg.add("HTTP")

println("📦 添加 JSON3 包...")
Pkg.add("JSON3")

println("📦 添加 Logging 包...")
Pkg.add("Logging")

println("📦 添加 Sockets 包...")
Pkg.add("Sockets")

# 实例化环境
println("⚡ 实例化项目环境...")
Pkg.instantiate()

# 检查状态
println("📋 检查包状态...")
Pkg.status()

println("✅ 依赖包安装完成！") 