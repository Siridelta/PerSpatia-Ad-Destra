# Tauri + Julia 后端集成详细方案

## 架构设计

```
┌─────────────────────────┐
│   Tauri 桌面应用        │
├─────────────────────────┤
│  React Flow 前端        │  ← 现有前端代码
├─────────────────────────┤
│   Rust 中间层           │  ← 新增：管理Julia进程
├─────────────────────────┤
│  编译后的Julia程序       │  ← 现有Julia后端编译版
└─────────────────────────┘
```

**关键技术点**：
- Julia代码通过`PackageCompiler.jl`完全编译，**无需Julia运行时**
- Tauri使用sidecar机制管理编译后的Julia可执行文件
- 用户最终得到单一的桌面应用安装包

## 实现步骤

### 1. 初始化Tauri项目

```bash
cd Para-proto-graph
pnpm create tauri-app --name julia-canvas --template vanilla-ts
cd julia-canvas
```

### 2. 配置Tauri以包含Julia后端

在 `src-tauri/tauri.conf.json` 中：

```json
{
  "bundle": {
    "externalBin": [
      "bin/julia-backend"
    ]
  },
  "app": {
    "windows": [
      {
        "title": "Julia Canvas",
        "width": 1200,
        "height": 800,
        "resizable": true
      }
    ]
  }
}
```

### 3. 创建Julia后端管理器

在 `src-tauri/src/julia_backend.rs`：

```rust
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::net::TcpStream;
use tokio::time::{sleep, Duration};

pub struct JuliaBackend {
    process: Arc<Mutex<Option<Child>>>,
    port: u16,
}

impl JuliaBackend {
    pub async fn start(app_handle: &AppHandle) -> Result<Self, String> {
        // 获取编译后的Julia可执行文件路径
        let resource_path = app_handle
            .path_resolver()
            .resolve_resource("bin/julia-backend")
            .ok_or("Failed to resolve julia backend path")?;

        // 启动编译后的Julia进程（无需Julia运行时）
        let mut child = Command::new(resource_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn julia backend: {}", e))?;

        // 从stdout读取端口号
        let stdout = child.stdout.take().unwrap();
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        
        // 等待Julia后端输出端口号
        let port = loop {
            line.clear();
            reader.read_line(&mut line).await
                .map_err(|e| format!("Failed to read from julia backend: {}", e))?;
            
            if line.starts_with("SERVER_PORT:") {
                let port_str = line.strip_prefix("SERVER_PORT:").unwrap().trim();
                break port_str.parse::<u16>()
                    .map_err(|e| format!("Invalid port: {}", e))?;
            }
        };

        // 等待后端启动完成
        for _ in 0..30 {
            if Self::check_health(port).await {
                break;
            }
            sleep(Duration::from_millis(100)).await;
        }

        Ok(JuliaBackend {
            process: Arc::new(Mutex::new(Some(child))),
            port,
        })
    }

    async fn check_health(port: u16) -> bool {
        TcpStream::connect(format!("127.0.0.1:{}", port)).await.is_ok()
    }

    pub fn get_port(&self) -> u16 {
        self.port
    }

    pub fn stop(&self) {
        if let Ok(mut process) = self.process.lock() {
            if let Some(mut child) = process.take() {
                let _ = child.kill();
            }
        }
    }
}

impl Drop for JuliaBackend {
    fn drop(&mut self) {
        self.stop();
    }
}
```

### 4. 主Tauri应用设置

在 `src-tauri/src/main.rs`：

```rust
mod julia_backend;

use tauri::{Manager, State};
use julia_backend::JuliaBackend;

struct AppState {
    julia_backend: JuliaBackend,
}

#[tauri::command]
async fn get_backend_port(state: State<'_, AppState>) -> Result<u16, String> {
    Ok(state.julia_backend.get_port())
}

#[tauri::command]
async fn proxy_request(
    state: State<'_, AppState>,
    endpoint: String,
    method: String,
    body: Option<String>,
) -> Result<String, String> {
    let port = state.julia_backend.get_port();
    let url = format!("http://127.0.0.1:{}{}", port, endpoint);
    
    let client = reqwest::Client::new();
    let request = match method.as_str() {
        "GET" => client.get(&url),
        "POST" => {
            let req = client.post(&url);
            if let Some(body) = body {
                req.header("Content-Type", "application/json").body(body)
            } else {
                req
            }
        }
        _ => return Err("Unsupported method".to_string()),
    };

    let response = request.send().await
        .map_err(|e| format!("Request failed: {}", e))?;
    
    let text = response.text().await
        .map_err(|e| format!("Failed to read response: {}", e))?;
    
    Ok(text)
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.handle();
            
            tauri::async_runtime::spawn(async move {
                match JuliaBackend::start(&app_handle).await {
                    Ok(backend) => {
                        app_handle.manage(AppState { julia_backend: backend });
                        println!("Julia backend started successfully");
                    }
                    Err(e) => {
                        eprintln!("Failed to start Julia backend: {}", e);
                        std::process::exit(1);
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_backend_port, proxy_request])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 5. 前端API适配

创建 `src/api/backend.ts`：

```typescript
import { invoke } from '@tauri-apps/api/tauri';

class BackendAPI {
  private port: number | null = null;

  async initialize() {
    this.port = await invoke<number>('get_backend_port');
  }

  async request(endpoint: string, method: string = 'GET', body?: any) {
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const response = await invoke<string>('proxy_request', {
      endpoint,
      method,
      body: bodyStr,
    });
    return JSON.parse(response);
  }

  // 现有API方法的适配
  async parseCode(code: string) {
    return this.request('/api/parse', 'POST', { code });
  }

  async evaluateCode(nodeId: string, code: string, inputs: any) {
    return this.request('/api/evaluate', 'POST', { 
      node_id: nodeId, 
      code, 
      inputs 
    });
  }

  async healthCheck() {
    return this.request('/api/health');
  }
}

export const backendAPI = new BackendAPI();
```

### 6. Julia编译配置

**重要**：需要将Julia代码编译成独立可执行文件（见 `compile.jl`）

在 `src-tauri/build.rs` 中自动化这个过程：

```rust
use std::process::Command;

fn main() {
    // 构建Julia后端可执行文件
    println!("cargo:rerun-if-changed=../../julia-backend");
    
    let output = Command::new("julia")
        .args(&["--project=../../julia-backend", "../../julia-backend/compile.jl"])
        .output()
        .expect("Failed to compile Julia backend");

    if !output.status.success() {
        panic!("Julia compilation failed: {}", String::from_utf8_lossy(&output.stderr));
    }

    // 复制编译后的可执行文件到正确的位置
    let target = if cfg!(windows) { "julia-backend.exe" } else { "julia-backend" };
    std::fs::copy(
        format!("../../julia-backend/dist/bin/{}", target), 
        format!("bin/{}", target)
    ).expect("Failed to copy julia backend binary");
    
    tauri_build::build()
}
```

### 7. 修改Julia后端输出端口

修改 `julia-backend/start_server.jl`：

```julia
# 在启动成功后输出端口号，供Tauri读取
println("SERVER_PORT:$(port)")
flush(stdout)
```

## 部署方式

### 开发环境
```bash
cd julia-canvas
pnpm tauri dev
```

### 生产构建
```bash
# 构建所有平台
pnpm tauri build

# 构建特定平台
pnpm tauri build --target x86_64-pc-windows-msvc
pnpm tauri build --target x86_64-apple-darwin
pnpm tauri build --target x86_64-unknown-linux-gnu
```

## 分发方式

1. **直接分发**: 生成的可执行文件直接分发给用户
2. **应用商店**: 可以发布到各平台应用商店
3. **自动更新**: 集成Tauri的updater插件实现自动更新

## 核心优势

1. **真正独立**：编译后的Julia程序完全自包含
2. **一键安装**：用户下载即可运行，无需配置环境
3. **跨平台**：一套代码，多平台部署
4. **体积小**：相比Electron节省90%体积
5. **性能好**：原生渲染，接近桌面应用性能
6. **维护性**：保持现有前后端分离架构

## 技术细节说明

### PackageCompiler.jl 的作用
- **编译时间**：将Julia代码完全编译成机器码
- **依赖打包**：将所有依赖库打包进可执行文件
- **运行时无关**：生成的程序不依赖Julia运行时环境
- **启动速度**：消除了Julia的启动延迟

### Sidecar模式优势
- **进程隔离**：前后端在不同进程中，互不影响
- **资源管理**：Tauri自动管理Julia进程的生命周期
- **通信灵活**：通过TCP/HTTP进行进程间通信
- **可扩展性**：可以轻松添加更多后端服务 