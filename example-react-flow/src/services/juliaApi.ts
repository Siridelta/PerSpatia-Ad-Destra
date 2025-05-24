// Julia后端API客户端

export interface JuliaVariableInfo {
  name: string;
  type: 'number' | 'string' | 'boolean' | 'range' | 'unknown';
  value: any;
  default_value: any;
  constraints?: {
    min?: number;
    max?: number;
    step?: number;
    options?: string[];
  };
  is_user_defined: boolean;
}

export interface JuliaEvaluationResult {
  success: boolean;
  outputs: Record<string, any>;
  constants: Record<string, any>;
  variables: JuliaVariableInfo[];
  output_names: string[];
  error_message: string | null;
  error_details: string | null;  // 详细错误信息包括栈追踪
  logs: string[];
}

export interface JuliaParseResult {
  variables: JuliaVariableInfo[];
  output_names: string[];
  constants: Record<string, any>;
}

const JULIA_API_BASE = 'http://127.0.0.1:8081';

/**
 * Julia后端API客户端类
 */
export class JuliaApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = JULIA_API_BASE) {
    this.baseUrl = baseUrl;
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/health`);
      return response.ok;
    } catch (error) {
      console.error('健康检查失败:', error);
      return false;
    }
  }

  /**
   * 执行Julia代码
   */
  async evaluateCode(code: string, inputValues: Record<string, any> = {}): Promise<JuliaEvaluationResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          input_values: inputValues,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('代码执行失败:', error);
      return {
        success: false,
        outputs: {},
        constants: {},
        variables: [],
        output_names: [],
        error_message: error instanceof Error ? error.message : '未知错误',
        error_details: null,
        logs: [],
      };
    }
  }

  /**
   * 解析Julia代码结构（不执行）
   */
  async parseCode(code: string): Promise<JuliaParseResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/parse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('代码解析失败:', error);
      return {
        variables: [],
        output_names: [],
        constants: {},
      };
    }
  }
}

// 全局API客户端实例
export const juliaApi = new JuliaApiClient(); 