export interface Edge {
  id: string;
  source: string;
  target: string;
  type?: string;
  animated?: boolean;
  data?: {
    label?: string;
    [key: string]: any;
  };
}