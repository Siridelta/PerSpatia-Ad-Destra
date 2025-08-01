export interface Edge {
  id: string;
  source: string;
  target: string;
  type?: string;
  animated?: boolean;
  selected?: boolean; // 添加选中状态支持
  data?: {
    label?: string;
    [key: string]: any;
  };
}