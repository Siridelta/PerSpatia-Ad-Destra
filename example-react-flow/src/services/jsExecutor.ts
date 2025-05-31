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
  error?: string;
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
  private outputs: Record<string, any> = {};
  private controls: ControlInfo[] = [];
  private inputValues: Record<string, any> = {};
  private originalConsoleLog: any;

  // 重写console.log来捕获日志
  private setupConsole() {
    this.originalConsoleLog = console.log;
    console.log = (...args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      this.logs.push(message);
      // 可选：保持原有的控制台输出
      // this.originalConsoleLog(...args);
    };
  }

  // 恢复console.log
  private restoreConsole() {
    if (this.originalConsoleLog) {
      console.log = this.originalConsoleLog;
    }
  }

  // node_input函数实现
  private node_input = (control: Slider | InputBox | Switch, name?: string): any => {
    const actualName = name || `input_${this.controls.length}`;
    
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

  // node_output函数实现
  private node_output = (value: any, name?: string): void => {
    const actualName = name || `output_${Object.keys(this.outputs).length}`;
    this.outputs[actualName] = value;
  };

  // 执行JS代码 - 简化版本，无沙箱限制
  public async executeCode(code: string, inputValues: Record<string, any> = {}): Promise<ExecutionResult> {
    // 重置状态
    this.logs = [];
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
        logs: this.logs
      };

    } catch (error) {
      return {
        success: false,
        outputs: {},
        controls: [],
        logs: this.logs,
        error: error instanceof Error ? error.message : String(error)
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