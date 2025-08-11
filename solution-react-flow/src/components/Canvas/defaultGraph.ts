import { Node } from '@/models/Node';
import { Edge } from '@/models/Edge';

const defaultNodes: Node[] = [
  { 
	id: '1', 
	position: { x: 700, y: 200 }, 
	data: { 
	  label: 'let speed = node_input(new Slider(50, 0, 100, 1));\nlet name = node_input(new InputBox("测试"));\nlet enabled = node_input(new Switch(true));\n\nlet result = speed * 2;\nnode_output(result);\nconsole.log("速度:", speed, "名称:", name, "启用:", enabled);', 
	  result: '结果计算中...',
	  width: 500
	}, 
	type: 'textNode' 
  },
  { 
	id: '2', 
	position: { x: 100, y: 700 }, 
	data: { 
	  label: 'let result = node_input("result");\nlet doubled = result * 2;\nlet message = `结果的两倍是: ${doubled}`;\nnode_output(doubled);\nconsole.log(message);', 
	  result: 'doubled计算中...',
	  width: 400
	}, 
	type: 'textNode' 
  },
  { 
	id: '3', 
	position: { x: 1300, y: 700 }, 
	data: { 
	  label: 'let message = node_input(new InputBox("Hello World"));\nlet length = message.length;\nnode_output(message);\nconsole.log("消息:", message, "长度:", length);', 
	  result: '消息处理中...',
	  width: 450
	}, 
	type: 'textNode' 
  },
];

const defaultEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', type: 'custom' },
];

export {
	defaultNodes,
	defaultEdges,
};
