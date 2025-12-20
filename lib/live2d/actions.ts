// Live2D 动作配置文件
// 定义可用动作列表、分组和权重

export interface ActionConfig {
  name: string;
  weight: number; // 权重值，数值越大越容易触发
  group?: string; // 动作所属分组
  duration?: number; // 动作持续时间（毫秒）
  description?: string; // 动作描述
}

export interface ActionGroup {
  name: string;
  description?: string;
  actions: string[]; // 动作名称列表
}

// 预定义动作配置
export const ACTION_CONFIGS: Record<string, ActionConfig> = {
  // 基础动作
  'Idle': {
    name: 'Idle',
    weight: 5,
    group: 'Idle',
    duration: 3000,
    description: '空闲待机动作'
  },
  'Idle_2': {
    name: 'Idle_2',
    weight: 3,
    group: 'Idle',
    duration: 4000,
    description: '第二种空闲动作'
  },
  'Idle_3': {
    name: 'Idle_3',
    weight: 2,
    group: 'Idle',
    duration: 5000,
    description: '第三种空闲动作'
  },
  
  // 点击交互动作
  'TapBody': {
    name: 'TapBody',
    weight: 8,
    group: 'Tap',
    duration: 2000,
    description: '点击身体时触发的动作'
  },
  'TapHead': {
    name: 'TapHead',
    weight: 6,
    group: 'Tap',
    duration: 1500,
    description: '点击头部时触发的动作'
  },
  'TapArm': {
    name: 'TapArm',
    weight: 4,
    group: 'Tap',
    duration: 1800,
    description: '点击手臂时触发的动作'
  },
  
  // 情绪动作
  'Happy': {
    name: 'Happy',
    weight: 3,
    group: 'Emotion',
    duration: 3000,
    description: '开心动作'
  },
  'Angry': {
    name: 'Angry',
    weight: 2,
    group: 'Emotion',
    duration: 2500,
    description: '生气动作'
  },
  'Sad': {
    name: 'Sad',
    weight: 1,
    group: 'Emotion',
    duration: 4000,
    description: '伤心动作'
  },
  
  // 特殊动作
  'Breath': {
    name: 'Breath',
    weight: 4,
    group: 'Breathing',
    duration: 2000,
    description: '呼吸动作'
  },
  'Wink': {
    name: 'Wink',
    weight: 3,
    group: 'Expression',
    duration: 1000,
    description: '眨眼动作'
  },
  'Shrug': {
    name: 'Shrug',
    weight: 2,
    group: 'Expression',
    duration: 2200,
    description: '耸肩动作'
  },
  
  // 语音相关动作
  'MouthOpen': {
    name: 'MouthOpen',
    weight: 1,
    group: 'Speaking',
    duration: 500,
    description: '说话时嘴巴张开'
  }
};

// 动作分组定义
export const ACTION_GROUPS: ActionGroup[] = [
  {
    name: 'Idle',
    description: '待机动作 - 模型空闲时自动播放',
    actions: ['Idle', 'Idle_2', 'Idle_3']
  },
  {
    name: 'Tap',
    description: '点击交互动作 - 响应用户点击',
    actions: ['TapBody', 'TapHead', 'TapArm']
  },
  {
    name: 'Emotion',
    description: '情绪动作 - 表达不同情绪',
    actions: ['Happy', 'Angry', 'Sad']
  },
  {
    name: 'Expression',
    description: '表情动作 - 各种面部表情',
    actions: ['Wink', 'Shrug', 'Breath']
  },
  {
    name: 'Speaking',
    description: '语音相关动作 - 与语音播放关联',
    actions: ['MouthOpen']
  }
];

// 获取所有可用动作名称
export function getAllActionNames(): string[] {
  return Object.keys(ACTION_CONFIGS);
}

// 根据分组获取动作
export function getActionsByGroup(groupName: string): string[] {
  const group = ACTION_GROUPS.find(g => g.name === groupName);
  return group ? group.actions : [];
}

// 根据权重随机选择动作
export function getRandomActionByWeight(actions?: string[]): string {
  const availableActions = actions || getAllActionNames();
  
  if (availableActions.length === 0) {
    return 'Idle'; // 默认动作
  }
  
  // 计算总权重
  const totalWeight = availableActions.reduce((sum, actionName) => {
    const config = ACTION_CONFIGS[actionName];
    return sum + (config?.weight || 1);
  }, 0);
  
  // 按权重随机选择
  let random = Math.random() * totalWeight;
  
  for (const actionName of availableActions) {
    const config = ACTION_CONFIGS[actionName];
    const weight = config?.weight || 1;
    
    if (random < weight) {
      return actionName;
    }
    random -= weight;
  }
  
  return availableActions[0]; // 兜底选择
}

// 获取动作配置
export function getActionConfig(actionName: string): ActionConfig | null {
  return ACTION_CONFIGS[actionName] || null;
}

// 检查动作是否存在
export function hasAction(actionName: string): boolean {
  return actionName in ACTION_CONFIGS;
}

// 获取默认的空闲动作
export function getDefaultIdleAction(): string {
  return 'Idle';
}