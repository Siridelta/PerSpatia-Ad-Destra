# Julia后端编译脚本
using PackageCompiler

# 创建可执行文件
create_app(
    ".", # 源码目录
    "dist", # 输出目录
    force = true,
    precompile_execution_file = "precompile.jl", # 预编译文件
    include_lazy_artifacts = true
)

println("✅ Julia后端编译完成！")
println("📦 可执行文件位置: ./dist/bin/")
println("🚀 运行方式: ./dist/bin/MyApp") 