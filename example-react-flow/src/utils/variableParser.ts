import { VariableInfo } from '../components/TextNode';

/**
 * 解析代码中的变量信息
 * 支持 @input 和 @output 标记
 */
export function parseVariables(code: string): VariableInfo[] {
  const variables: VariableInfo[] = [];
  
  // 解析 @input 变量
  // 格式: @input myVariable 或 @input myVariable @slider(min, max, step)
  const inputVarRegex = /@input\s+(\w+)(?:\s+@(\w+)\(([^)]*)\))?/g;
  let match;
  
  while ((match = inputVarRegex.exec(code)) !== null) {
    const [, name, controlType, params] = match;
    const variable = parseInputVariable(name, controlType, params);
    if (variable) {
      variables.push(variable);
    }
  }
  
  return variables;
}

/**
 * 解析输出变量
 * 格式: @output myVariable
 */
export function parseOutputVariables(code: string): string[] {
  const outputs: string[] = [];
  const outputVarRegex = /@output\s+(\w+)/g;
  let match;
  
  while ((match = outputVarRegex.exec(code)) !== null) {
    const [, name] = match;
    outputs.push(name);
  }
  
  return outputs;
}

/**
 * 解析@input标记的变量
 */
function parseInputVariable(name: string, controlType?: string, params?: string): VariableInfo | null {
  console.log('解析输入变量:', name, controlType, params);
  
  // 如果没有指定控件类型，默认为文本输入
  if (!controlType) {
    return {
      name,
      type: 'string',
      value: '',
      defaultValue: '',
      isUserDefined: true,
    };
  }
  
  const trimmedParams = params?.trim() || '';
  
  switch (controlType) {
    case 'slider':
    case 'slidebar': {
      const paramArray = trimmedParams.split(',').map(p => parseFloat(p.trim()));
      const [min, max, step, defaultValue] = paramArray;
      
      const finalMin = min !== undefined && !isNaN(min) ? min : 0;
      const finalMax = max !== undefined && !isNaN(max) ? max : 100;
      const finalStep = step !== undefined && !isNaN(step) ? step : 1;
      const finalDefault = defaultValue !== undefined && !isNaN(defaultValue) ? defaultValue : finalMin;
      
      console.log('滑动条参数:', { finalMin, finalMax, finalStep, finalDefault });
      
      return {
        name,
        type: 'range',
        value: finalDefault,
        defaultValue: finalDefault,
        constraints: {
          min: finalMin,
          max: finalMax,
          step: finalStep,
        },
        isUserDefined: true,
      };
    }
    
    case 'text':
    case 'string': {
      const defaultValue = trimmedParams.replace(/['"]/g, '') || '';
      return {
        name,
        type: 'string',
        value: defaultValue,
        defaultValue,
        isUserDefined: true,
      };
    }
    
    case 'toggle':
    case 'boolean': {
      const defaultValue = trimmedParams.toLowerCase() === 'true';
      return {
        name,
        type: 'boolean',
        value: defaultValue,
        defaultValue,
        isUserDefined: true,
      };
    }
    
    default:
      // 对于未知的控件类型，默认为字符串
      return {
        name,
        type: 'string',
        value: '',
        defaultValue: '',
        isUserDefined: true,
      };
  }
} 