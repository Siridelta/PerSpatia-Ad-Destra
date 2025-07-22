// JS代码执行引擎和IO库

export interface ControlInfo {
  name: string;
  type: 'slider' | 'input' | 'switch';
  defaultValue: any;
  value?: any;
  min?: number;
  max?: number;
  step?: number;
}

export interface ExecutionResult {
  success: boolean;
  outputs: Record<string, any>;
  controls: ControlInfo[];
  logs: string[];
  errors?: Array<{
    message: string;
    line?: number;
    column?: number;
    stack?: string;
  }>;
  warnings?: Array<{
    message: string;
    line?: number;
    column?: number;
    stack?: string;
  }>;
}

// 滑动条控件类
export class Slider {
  public name: string;
  public defaultValue: number;
  public min: number;
  public max: number;
  public step: number;

  constructor(defaultValue: number = 0, min: number = 0, max: number = 100, step: number = 1) {
    this.name = '';
    this.defaultValue = defaultValue;
    this.min = min;
    this.max = max;
    this.step = step;
  }
}

// 输入框控件类
export class InputBox {
  public name: string;
  public defaultValue: string;

  constructor(defaultValue: string = '') {
    this.name = '';
    this.defaultValue = defaultValue;
  }
}

// 开关控件类
export class Switch {
  public name: string;
  public defaultValue: boolean;

  constructor(defaultValue: boolean = false) {
    this.name = '';
    this.defaultValue = defaultValue;
  }
}

// JS代码执行器
export class JSExecutor {
  private logs: string[] = [];
  private warnings: Array<{
    message: string;
    line?: number;
    column?: number;
    stack?: string;
  }> = [];
  private outputs: Record<string, any> = {};
  private controls: ControlInfo[] = [];
  private inputValues: Record<string, any> = {};
  private originalConsoleLog: any;
  private originalConsoleWarn: any;

  // 重写console.log和console.warn来捕获日志和警告
  private setupConsole() {
    this.originalConsoleLog = console.log;
    this.originalConsoleWarn = console.warn;
    
    console.log = (...args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      this.logs.push(message);
      // 可选：保持原有的控制台输出
      // this.originalConsoleLog(...args);
    };
    
    console.warn = (...args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      
      // 创建警告信息
      const warning = {
        message,
        stack: (new Error()).stack // 获取调用栈来提取行号
      };
      
      this.warnings.push(warning);
      // 可选：保持原有的控制台输出
      // this.originalConsoleWarn(...args);
    };
  }

  // 恢复console.log和console.warn
  private restoreConsole() {
    if (this.originalConsoleLog) {
      console.log = this.originalConsoleLog;
    }
    if (this.originalConsoleWarn) {
      console.warn = this.originalConsoleWarn;
    }
  }

  // node_input函数实现 - 支持两种模式
  private node_input = (control: Slider | InputBox | Switch | string, nameOrValue?: string | any): any => {
    // 新格式：node_input(变量名, 默认值) - 从连接节点获取数据
    if (typeof control === 'string') {
      const varName = control;
      const defaultValue = nameOrValue;
      
      // 首先尝试从连接的节点获取数据
      if (this.inputValues[varName] !== undefined) {
        return this.inputValues[varName];
      }
      
      // 如果没有连接数据，返回默认值
      return defaultValue;
    }
    
    // 旧格式：node_input(控件, 变量名?) - 创建控件
    const actualName = nameOrValue || `input_${this.controls.length}`;
    
    let controlInfo: ControlInfo;
    
    if (control instanceof Slider) {
      controlInfo = {
        name: actualName,
        type: 'slider',
        defaultValue: control.defaultValue,
        min: control.min,
        max: control.max,
        step: control.step
      };
    } else if (control instanceof InputBox) {
      controlInfo = {
        name: actualName,
        type: 'input',
        defaultValue: control.defaultValue
      };
    } else if (control instanceof Switch) {
      controlInfo = {
        name: actualName,
        type: 'switch',
        defaultValue: control.defaultValue
      };
    } else {
      throw new Error('Invalid control type');
    }

    this.controls.push(controlInfo);
    
    // 返回当前输入值或默认值
    return this.inputValues[actualName] ?? controlInfo.defaultValue;
  };

  // node_output函数实现 - 新格式：node_output(变量名, 值)
  private node_output = (nameOrValue: string | any, value?: any): void => {
    if (typeof nameOrValue === 'string' && value !== undefined) {
      // 新格式：node_output(变量名, 值)
      this.outputs[nameOrValue] = value;
    } else {
      // 兼容旧格式：node_output(值, 变量名?)
      const actualName = (typeof value === 'string') ? value : `output_${Object.keys(this.outputs).length}`;
      this.outputs[actualName] = nameOrValue;
    }
  };

  // 解析错误信息，提取行号和列号
  private parseError(error: Error, code: string): {
    message: string;
    line?: number;
    column?: number;
    stack?: string;
  } {
    const stack = error.stack || '';
    const message = error.message || '未知错误';
    
    // 尝试从栈信息中提取行号和列号
    let line: number | undefined;
    let column: number | undefined;
    
    // 对于语法错误，尝试从错误消息中提取行号
    if (error instanceof SyntaxError) {
      // JavaScript语法错误通常在消息中包含行号信息
      const syntaxLineMatch = message.match(/line (\d+)/i) || message.match(/(\d+):(\d+)/);
      if (syntaxLineMatch) {
        line = parseInt(syntaxLineMatch[1], 10);
        if (syntaxLineMatch[2]) {
          column = parseInt(syntaxLineMatch[2], 10);
        }
      }
    } else {
      // 对于运行时错误，从堆栈中提取行号
      // 匹配 eval 调用的行号和列号，特别是 <anonymous>:line:column 格式
      const evalMatch = stack.match(/<anonymous>:(\d+):(\d+)/) || stack.match(/eval.*?:(\d+):(\d+)/);
      if (evalMatch) {
        line = parseInt(evalMatch[1], 10);
        column = parseInt(evalMatch[2], 10);
        
        // 对于eval中的代码，行号就是用户代码中的行号
        // 不需要额外调整，因为eval的代码就是用户的原始代码
      } else {
        // 尝试其他格式的行号匹配
        const lineMatch = stack.match(/(\d+):(\d+)/);
        if (lineMatch) {
          line = parseInt(lineMatch[1], 10);
          column = parseInt(lineMatch[2], 10);
        }
      }
    }
    
    // 如果提取到了行号，确保它在有效范围内
    if (line !== undefined) {
      const codeLines = code.split('\n').length;
      if (line > codeLines) {
        // 如果行号超出代码范围，可能是因为执行环境的额外代码，重置为undefined
        line = undefined;
        column = undefined;
      }
    }
    
    return {
      message,
      line,
      column,
      stack: stack
    };
  }

  // 执行JS代码 - 简化版本，无沙箱限制
  public async executeCode(code: string, inputValues: Record<string, any> = {}): Promise<ExecutionResult> {
    // 重置状态
    this.logs = [];
    this.warnings = [];
    this.outputs = {};
    this.controls = [];
    this.inputValues = inputValues;

    try {
      // 设置控制台拦截
      this.setupConsole();

      // 创建全局变量供代码使用
      (window as any).node_input = this.node_input;
      (window as any).node_output = this.node_output;
      (window as any).Slider = Slider;
      (window as any).InputBox = InputBox;
      (window as any).Switch = Switch;

      // 直接执行代码
      eval(code);

      return {
        success: true,
        outputs: this.outputs,
        controls: this.controls,
        logs: this.logs,
        warnings: this.warnings
      };

    } catch (error) {
      const errorInfo = this.parseError(error as Error, code);
      
      return {
        success: false,
        outputs: {},
        controls: [],
        logs: this.logs,
        errors: [errorInfo],
        warnings: this.warnings
      };
    } finally {
      // 恢复控制台
      this.restoreConsole();
      
      // 清理全局变量
      delete (window as any).node_input;
      delete (window as any).node_output;
      delete (window as any).Slider;
      delete (window as any).InputBox;
      delete (window as any).Switch;
    }
  }
}

// 单例执行器
export const jsExecutor = new JSExecutor(); 