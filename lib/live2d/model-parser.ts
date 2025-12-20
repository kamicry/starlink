/**
 * Live2D 模型配置解析器
 * 自动解析 .model3.json 配置文件，提取模型的动作、表情、物理参数和交互区域信息
 */

export interface Live2DModelConfig {
  motions: Record<string, string[]>;      // 动作组 -> 文件列表
  expressions: Record<string, string>;    // 表情名 -> 文件路径
  hasPhysics: boolean;                    // 是否有物理参数
  hitAreas: string[];                     // 可点击区域列表
  moc3Path: string;                       // MOC3 文件路径
  texturePaths: string[];                 // 纹理文件路径
  displayInfoPath?: string;               // 显示信息文件路径
  groups: Array<{                         // 参数组信息
    target: string;
    name: string;
    ids: string[];
  }>;
  version: number;                        // 模型版本
}

/**
 * 从 .model3.json 配置文件加载并解析模型配置
 * @param modelPath 模型文件路径（如：/models/chara/chara.model3.json）
 * @returns 解析后的模型配置对象
 */
export async function parseModelConfig(modelPath: string): Promise<Live2DModelConfig> {
  try {
    // 转换为完整的文件路径
    const configUrl = modelPath.endsWith('.model3.json') 
      ? modelPath 
      : `${modelPath}${modelPath.endsWith('/') ? '' : '/'}${modelPath.split('/').pop()}.model3.json`;
    
    const response = await fetch(configUrl);
    if (!response.ok) {
      throw new Error(`Failed to load model config: ${response.status} ${response.statusText}`);
    }

    const modelConfig = await response.json();
    
    // 基础配置信息
    const config: Live2DModelConfig = {
      motions: {},
      expressions: {},
      hasPhysics: false,
      hitAreas: [],
      moc3Path: '',
      texturePaths: [],
      groups: modelConfig.Groups || [],
      version: modelConfig.Version || 3
    };

    // 解析文件引用
    if (modelConfig.FileReferences) {
      const { Moc, Textures, Physics, DisplayInfo, Motions, Expressions } = modelConfig.FileReferences;
      
      // MOC3 文件路径
      if (Moc) {
        config.moc3Path = getRelativePath(configUrl, Moc);
      }

      // 纹理文件路径
      if (Textures && Array.isArray(Textures)) {
        config.texturePaths = Textures.map((texture: string) => getRelativePath(configUrl, texture));
      }

      // 物理参数检查
      if (Physics) {
        config.hasPhysics = true;
      }

      // 显示信息文件路径
      if (DisplayInfo) {
        config.displayInfoPath = getRelativePath(configUrl, DisplayInfo);
      }

      // 动作配置
      if (Motions && typeof Motions === 'object') {
        config.motions = parseMotions(Motions, configUrl);
      }

      // 表情配置
      if (Expressions && typeof Expressions === 'object') {
        config.expressions = parseExpressions(Expressions, configUrl);
      }
    }

    // 解析交互区域 (HitAreas)
    config.hitAreas = parseHitAreas(modelConfig.Groups || []);
    
    // 如果没有找到动作，添加默认动作组
    if (Object.keys(config.motions).length === 0) {
      config.motions = getDefaultMotionGroups();
    }

    // 如果没有表情，尝试从目录扫描
    if (Object.keys(config.expressions).length === 0) {
      config.expressions = await scanExpressionsFromDirectory(modelPath);
    }

    console.log('✅ Live2D 模型配置解析完成:', {
      modelPath: configUrl,
      motions: Object.keys(config.motions),
      expressions: Object.keys(config.expressions),
      hasPhysics: config.hasPhysics,
      hitAreas: config.hitAreas,
      groups: config.groups.length
    });

    return config;

  } catch (error) {
    console.error('❌ 解析 Live2D 模型配置失败:', error);
    throw new Error(`模型配置解析失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 解析动作配置
 */
function parseMotions(motions: any, configUrl: string): Record<string, string[]> {
  const parsedMotions: Record<string, string[]> = {};

  // 处理不同的动作配置格式
  if (Array.isArray(motions)) {
    // 如果是数组格式，按组名分组
    motions.forEach((motion: any, index: number) => {
      const groupName = motion.Name || `Motion_${index}`;
      if (!parsedMotions[groupName]) {
        parsedMotions[groupName] = [];
      }
      if (motion.File) {
        parsedMotions[groupName].push(getRelativePath(configUrl, motion.File));
      }
    });
  } else if (typeof motions === 'object') {
    // 如果是对象格式，直接解析
    Object.entries(motions).forEach(([groupName, files]) => {
      if (Array.isArray(files)) {
        parsedMotions[groupName] = files.map((file: string) => 
          getRelativePath(configUrl, file)
        );
      } else if (typeof files === 'string') {
        parsedMotions[groupName] = [getRelativePath(configUrl, files)];
      }
    });
  }

  return parsedMotions;
}

/**
 * 解析表情配置
 */
function parseExpressions(expressions: any, configUrl: string): Record<string, string> {
  const parsedExpressions: Record<string, string> = {};

  if (typeof expressions === 'object') {
    Object.entries(expressions).forEach(([expressionName, filePath]) => {
      if (typeof filePath === 'string') {
        parsedExpressions[expressionName] = getRelativePath(configUrl, filePath);
      }
    });
  }

  return parsedExpressions;
}

/**
 * 解析交互区域
 */
function parseHitAreas(groups: any[]): string[] {
  const hitAreas: string[] = [];
  
  groups.forEach(group => {
    if (group.Target === 'Parameter' && group.Name?.startsWith('HitArea_')) {
      const hitAreaName = group.Name.replace('HitArea_', '');
      hitAreas.push(hitAreaName);
    }
  });

  return hitAreas;
}

/**
 * 获取默认动作组
 */
function getDefaultMotionGroups(): Record<string, string[]> {
  return {
    'Idle': [],
    'TapBody': [],
    'TapHead': []
  };
}

/**
 * 从目录扫描表情文件
 */
async function scanExpressionsFromDirectory(modelPath: string): Promise<Record<string, string>> {
  const expressions: Record<string, string> = {};
  
  try {
    // 尝试从常见的表情目录加载
    const possiblePaths = [
      `${modelPath}/expressions`,
      `${modelPath}/exp`,
      `${modelPath}/Expression`
    ];

    for (const expressionsPath of possiblePaths) {
      try {
        const response = await fetch(expressionsPath);
        if (response.ok) {
          // 如果是目录，列出内容（这需要额外的API或约定）
          // 这里暂时返回空对象，在实际使用中可以通过其他方式获取
          break;
        }
      } catch {
        // 忽略错误，继续尝试下一个路径
      }
    }
  } catch (error) {
    console.warn('扫描表情目录失败:', error);
  }

  return expressions;
}

/**
 * 计算相对路径
 */
function getRelativePath(basePath: string, relativePath: string): string {
  if (relativePath.startsWith('http')) {
    return relativePath;
  }

  const baseDir = basePath.substring(0, basePath.lastIndexOf('/'));
  return `${baseDir}/${relativePath}`;
}

/**
 * 获取模型的可用动作组列表
 */
export function getAvailableMotionGroups(config: Live2DModelConfig): string[] {
  return Object.keys(config.motions);
}

/**
 * 获取指定动作组的动作文件列表
 */
export function getMotionFiles(config: Live2DModelConfig, groupName: string): string[] {
  return config.motions[groupName] || [];
}

/**
 * 获取所有可用的表情列表
 */
export function getAvailableExpressions(config: Live2DModelConfig): string[] {
  return Object.keys(config.expressions);
}

/**
 * 获取表情文件路径
 */
export function getExpressionFile(config: Live2DModelConfig, expressionName: string): string | undefined {
  return config.expressions[expressionName];
}

/**
 * 检查模型是否包含指定的参数组
 */
export function hasParameterGroup(config: Live2DModelConfig, groupName: string): boolean {
  return config.groups.some(group => group.name === groupName);
}

/**
 * 获取参数组的参数ID列表
 */
export function getParameterIds(config: Live2DModelConfig, groupName: string): string[] {
  const group = config.groups.find(group => group.name === groupName);
  return group ? group.ids : [];
}