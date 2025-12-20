/**
 * Live2D 情绪映射系统
 * 负责将聊天对话的情绪状态映射到 Live2D 模型的表情和动作
 */

import { Live2DModelConfig, parseModelConfig } from './model-parser';

export interface EmotionMapping {
  motions: Record<string, string[]>;      // 动作分组
  expressions: Record<string, string>;    // 表情映射
  emotionToExpression: Record<string, string>; // 情绪到表情的映射
  emotionToMotion: Record<string, string>;     // 情绪到动作的映射
  defaultExpression: string;                    // 默认表情
  defaultMotion: string;                        // 默认动作
}

/**
 * 默认情绪映射配置
 */
const DEFAULT_EMOTION_MAPPING: Record<string, { expression: string; motion: string }> = {
  // 积极情绪
  'happy': { expression: 'Smile', motion: 'Happy' },
  'joy': { expression: 'Joy', motion: 'Happy' },
  'excited': { expression: 'Excited', motion: 'Happy' },
  'cheerful': { expression: 'Smile', motion: 'Happy' },
  'delighted': { expression: 'Happy', motion: 'Happy' },
  
  // 消极情绪
  'sad': { expression: 'Sad', motion: 'Idle' },
  'angry': { expression: 'Angry', motion: 'Angry' },
  'frustrated': { expression: 'Angry', motion: 'TapHead' },
  'annoyed': { expression: 'Annoyed', motion: 'TapHead' },
  'disappointed': { expression: 'Sad', motion: 'Idle' },
  
  // 中性情绪
  'neutral': { expression: 'Neutral', motion: 'Idle' },
  'calm': { expression: 'Calm', motion: 'Idle' },
  'peaceful': { expression: 'Calm', motion: 'Idle' },
  'relaxed': { expression: 'Relaxed', motion: 'Idle' },
  
  // 惊讶情绪
  'surprised': { expression: 'Surprised', motion: 'TapHead' },
  'shocked': { expression: 'Surprised', motion: 'TapHead' },
  'amazed': { expression: 'Surprised', motion: 'TapHead' },
  'astonished': { expression: 'Surprised', motion: 'TapHead' },
  
  // 疑问情绪
  'confused': { expression: 'Confused', motion: 'TapHead' },
  'puzzled': { expression: 'Confused', motion: 'TapHead' },
  'questioning': { expression: 'Confused', motion: 'TapHead' },
  
  // 紧张情绪
  'nervous': { expression: 'Nervous', motion: 'TapBody' },
  'anxious': { expression: 'Worried', motion: 'Idle' },
  'worried': { expression: 'Worried', motion: 'Idle' },
  'stressed': { expression: 'Stressed', motion: 'TapHead' }
};

/**
 * 加载情绪映射配置
 * @param modelPath 模型路径
 * @returns 完整的情绪映射配置
 */
export async function loadEmotionMapping(modelPath: string): Promise<EmotionMapping> {
  try {
    console.log('🔄 开始加载 Live2D 情绪映射配置...');
    
    // 解析模型配置
    const modelConfig = await parseModelConfig(modelPath);
    
    // 基于模型的实际配置创建情绪映射
    const emotionMapping = createEmotionMapping(modelConfig);
    
    console.log('✅ Live2D 情绪映射配置加载完成:', {
      availableExpressions: Object.keys(emotionMapping.expressions),
      availableMotions: Object.keys(emotionMapping.motions),
      emotionMappings: Object.keys(emotionMapping.emotionToExpression).length
    });
    
    return emotionMapping;
    
  } catch (error) {
    console.error('❌ 加载 Live2D 情绪映射配置失败:', error);
    
    // 返回基础配置
    return createBasicEmotionMapping();
  }
}

/**
 * 创建情绪映射配置
 */
function createEmotionMapping(modelConfig: Live2DModelConfig): EmotionMapping {
  const availableExpressions = Object.keys(modelConfig.expressions);
  const availableMotions = Object.keys(modelConfig.motions);
  
  // 创建情绪到表情的映射
  const emotionToExpression: Record<string, string> = {};
  const emotionToMotion: Record<string, string> = {};
  
  // 为每种情绪找到最合适的表达式和动作
  Object.entries(DEFAULT_EMOTION_MAPPING).forEach(([emotion, mapping]) => {
    // 查找匹配的表情
    const matchedExpression = findBestMatch(mapping.expression, availableExpressions);
    emotionToExpression[emotion] = matchedExpression;
    
    // 查找匹配的动作
    const matchedMotion = findBestMatch(mapping.motion, availableMotions);
    emotionToMotion[emotion] = matchedMotion;
  });
  
  // 创建基础映射结构
  return {
    motions: modelConfig.motions,
    expressions: modelConfig.expressions,
    emotionToExpression,
    emotionToMotion,
    defaultExpression: availableExpressions[0] || 'Neutral',
    defaultMotion: availableMotions.includes('Idle') ? 'Idle' : availableMotions[0] || ''
  };
}

/**
 * 查找最佳匹配的项目
 */
function findBestMatch(target: string, available: string[]): string {
  // 精确匹配
  if (available.includes(target)) {
    return target;
  }
  
  // 不区分大小写匹配
  const caseInsensitive = available.find(item => 
    item.toLowerCase() === target.toLowerCase()
  );
  if (caseInsensitive) {
    return caseInsensitive;
  }
  
  // 部分匹配
  const partial = available.find(item => 
    item.toLowerCase().includes(target.toLowerCase()) ||
    target.toLowerCase().includes(item.toLowerCase())
  );
  if (partial) {
    return partial;
  }
  
  // 模糊匹配（基于关键字）
  const keywords = extractKeywords(target);
  const fuzzy = available.find(item => {
    const itemKeywords = extractKeywords(item);
    return keywords.some(keyword => 
      itemKeywords.some(itemKeyword => 
        keyword === itemKeyword ||
        keyword.includes(itemKeyword) ||
        itemKeyword.includes(keyword)
      )
    );
  });
  
  if (fuzzy) {
    return fuzzy;
  }
  
  // 默认返回第一个可用项目或空字符串
  return available[0] || '';
}

/**
 * 提取关键词
 */
function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s_\-\.]+/)
    .filter(word => word.length > 0);
}

/**
 * 创建基础情绪映射（无模型配置时使用）
 */
function createBasicEmotionMapping(): EmotionMapping {
  return {
    motions: {
      'Idle': [],
      'Happy': [],
      'Angry': [],
      'TapBody': [],
      'TapHead': []
    },
    expressions: {},
    emotionToExpression: {},
    emotionToMotion: {},
    defaultExpression: 'Neutral',
    defaultMotion: 'Idle'
  };
}

/**
 * 根据情绪获取对应的表情
 * @param mapping 情绪映射配置
 * @param emotion 情绪名称
 * @returns 表情名称
 */
export function getExpressionForEmotion(mapping: EmotionMapping, emotion: string): string {
  const normalizedEmotion = normalizeEmotion(emotion);
  return mapping.emotionToExpression[normalizedEmotion] || mapping.defaultExpression;
}

/**
 * 根据情绪获取对应的动作
 * @param mapping 情绪映射配置
 * @param emotion 情绪名称
 * @returns 动作组名称
 */
export function getMotionForEmotion(mapping: EmotionMapping, emotion: string): string {
  const normalizedEmotion = normalizeEmotion(emotion);
  return mapping.emotionToMotion[normalizedEmotion] || mapping.defaultMotion;
}

/**
 * 情绪名称标准化
 */
function normalizeEmotion(emotion: string): string {
  return emotion
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .trim();
}

/**
 * 分析文本情绪
 * 简单的关键词匹配情绪分析器
 * @param text 要分析的文本
 * @returns 识别的情绪数组（按置信度排序）
 */
export function analyzeTextEmotion(text: string): Array<{ emotion: string; confidence: number }> {
  const emotions: Array<{ emotion: string; confidence: number }> = [];
  
  const normalizedText = text.toLowerCase();
  
  // 情绪关键词映射
  const emotionKeywords = {
    'happy': ['开心', '高兴', '快乐', '愉快', '喜悦', '兴奋', '哈哈', '😊', '😄', '😍'],
    'sad': ['伤心', '难过', '沮丧', '失望', '哭泣', '哭', '😭', '😢'],
    'angry': ['生气', '愤怒', '气愤', '恼火', '烦躁', '😠', '😡'],
    'surprised': ['惊讶', '吃惊', '意外', '震惊', '哇', '😮', '😲'],
    'confused': ['困惑', '疑惑', '不明白', '迷茫', '？', '😕'],
    'excited': ['激动', '兴奋', '亢奋', '热血', '🔥'],
    'calm': ['平静', '安静', '冷静', '淡定', '😌'],
    'nervous': ['紧张', '焦虑', '担心', '不安', '😰'],
    'tired': ['累', '疲惫', '困', '疲劳', '😴']
  };
  
  // 统计每个情绪的匹配数量
  Object.entries(emotionKeywords).forEach(([emotion, keywords]) => {
    let matchCount = 0;
    keywords.forEach(keyword => {
      if (normalizedText.includes(keyword)) {
        matchCount++;
      }
    });
    
    if (matchCount > 0) {
      const confidence = Math.min(matchCount / keywords.length, 1);
      emotions.push({ emotion, confidence });
    }
  });
  
  // 按置信度排序
  return emotions.sort((a, b) => b.confidence - a.confidence);
}

/**
 * 获取最可能的情绪
 */
export function getMostLikelyEmotion(text: string): string {
  const emotions = analyzeTextEmotion(text);
  return emotions.length > 0 ? emotions[0].emotion : 'neutral';
}

/**
 * 更新情绪映射的自定义配置
 */
export function updateEmotionMapping(
  mapping: EmotionMapping, 
  emotion: string, 
  expression?: string, 
  motion?: string
): EmotionMapping {
  const updatedMapping = { ...mapping };
  
  if (expression && updatedMapping.expressions[expression]) {
    updatedMapping.emotionToExpression[emotion] = expression;
  }
  
  if (motion && updatedMapping.motions[motion]) {
    updatedMapping.emotionToMotion[emotion] = motion;
  }
  
  return updatedMapping;
}