import { Live2DModelConfig } from './model-parser';

export interface MotionGroup {
  name: string;
  motions: string[]; // 文件路径列表
}

export interface MotionPlaybackOptions {
  fadeIn?: number;
  fadeOut?: number;
  weight?: number;
  loop?: boolean;
}

export interface MotionManagerConfig {
  preventOverlap?: boolean;
  enableQueue?: boolean;
  defaultFadeTime?: number;
  randomWeights?: Record<string, number>;
}

export class MotionManager {
  private model: any;
  private config: Live2DModelConfig;
  private currentMotion: string | null = null;
  private isPlaying = false;
  private motionQueue: Array<{ motionPath: string; options?: MotionPlaybackOptions }> = [];
  private motionCompleteCallbacks: Array<(motionPath: string) => void> = [];
  private autoExpressionEnabled = true;
  private readonly motionConfig: Required<MotionManagerConfig>;

  constructor(model: any, config: Live2DModelConfig, options: MotionManagerConfig = {}) {
    this.model = model;
    this.config = config;
    
    this.motionConfig = {
      preventOverlap: true,
      enableQueue: true,
      defaultFadeTime: 500,
      randomWeights: {},
      ...options
    };
  }

  /**
   * 播放指定动作
   */
  async playMotion(motionPath: string, options?: MotionPlaybackOptions): Promise<void> {
    // 如果正在播放且防止重叠，则跳过
    if (this.motionConfig.preventOverlap && this.isPlaying) {
      console.log('Motion already playing, skipping new motion');
      return;
    }

    // 如果启用了队列，将动作加入队列
    if (this.motionConfig.enableQueue && this.isPlaying) {
      this.motionQueue.push({ motionPath, options });
      console.log('Motion queued:', motionPath);
      return;
    }

    try {
      this.isPlaying = true;
      this.currentMotion = motionPath;
      
      console.log('🎬 Playing motion:', motionPath);
      
      // 使用 Live2D 模型的 motion 方法播放动作
      await this.executeMotion(motionPath, options);
      
      // 动作完成后处理
      this.isPlaying = false;
      this.currentMotion = null;
      
      // 触发回调
      this.motionCompleteCallbacks.forEach(callback => callback(motionPath));
      
      // 处理队列中的下一个动作
      if (this.motionQueue.length > 0) {
        const nextMotion = this.motionQueue.shift()!;
        console.log('▶️ Playing next motion from queue:', nextMotion.motionPath);
        await this.playMotion(nextMotion.motionPath, nextMotion.options);
      }
      
    } catch (error) {
      console.error('Failed to play motion:', motionPath, error);
      this.isPlaying = false;
      this.currentMotion = null;
      throw error;
    }
  }

  /**
   * 播放指定组的随机动作
   */
  async playRandomMotionFromGroup(groupName: string, options?: MotionPlaybackOptions): Promise<void> {
    const motionPaths = this.getMotionPathsFromGroup(groupName);
    
    if (motionPaths.length === 0) {
      console.warn(`No motions found for group: ${groupName}`);
      return;
    }
    
    // 根据权重随机选择动作
    const weightedMotions = this.applyRandomWeights(motionPaths);
    const randomMotion = this.selectWeightedRandom(weightedMotions);
    
    console.log(`🎲 Random motion from group [${groupName}]: ${randomMotion}`);
    await this.playMotion(randomMotion, options);
  }

  /**
   * 播放任意随机动作
   */
  async playRandomMotion(options?: MotionPlaybackOptions): Promise<void> {
    const allGroups = this.getMotionGroups();
    
    if (allGroups.length === 0) {
      console.warn('No motion groups available');
      return;
    }
    
    // 随机选择一个动作组
    const randomGroup = allGroups[Math.floor(Math.random() * allGroups.length)];
    await this.playRandomMotionFromGroup(randomGroup, options);
  }

  /**
   * 停止当前动作
   */
  stopMotion(): void {
    if (this.isPlaying) {
      console.log('⏹️ Stopping current motion');
      this.isPlaying = false;
      this.currentMotion = null;
      this.motionQueue = [];
      
      // 停止模型中的动作
      if (this.model.internalModel?.motionManager) {
        this.model.internalModel.motionManager.stopAllMotions();
      }
    }
  }

  /**
   * 获取所有动作组
   */
  getMotionGroups(): string[] {
    return Object.keys(this.config.motions);
  }

  /**
   * 获取指定动作组下的所有动作路径
   */
  getMotionPathsFromGroup(groupName: string): string[] {
    return this.config.motions[groupName] || [];
  }

  /**
   * 获取当前正在播放的动作
   */
  getCurrentMotion(): string | null {
    return this.currentMotion;
  }

  /**
   * 检查是否正在播放动作
   */
  isMotionPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * 设置随机权重
   */
  setRandomWeights(weights: Record<string, number>): void {
    this.motionConfig.randomWeights = { ...weights };
  }

  /**
   * 启用/禁用表情自动联动
   */
  setAutoExpression(auto: boolean): void {
    this.autoExpressionEnabled = auto;
  }

  /**
   * 添加动作完成回调
   */
  onMotionComplete(callback: (motionPath: string) => void): void {
    this.motionCompleteCallbacks.push(callback);
  }

  /**
   * 移除动作完成回调
   */
  removeMotionCompleteCallback(callback: (motionPath: string) => void): void {
    const index = this.motionCompleteCallbacks.indexOf(callback);
    if (index !== -1) {
      this.motionCompleteCallbacks.splice(index, 1);
    }
  }

  /**
   * 清除队列
   */
  clearQueue(): void {
    this.motionQueue = [];
    console.log('Motion queue cleared');
  }

  /**
   * 获取队列长度
   */
  getQueueLength(): number {
    return this.motionQueue.length;
  }

  /**
   * 执行动作播放（内部方法）
   */
  private async executeMotion(motionPath: string, options?: MotionPlaybackOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // 如果模型有直接的 motion 方法
        if (typeof this.model.motion === 'function') {
          this.model.motion(motionPath);
          
          // 监听动作完成事件
          const onMotionComplete = () => {
            this.model.off?.('motion:complete', onMotionComplete);
            this.model.off?.('motion:finish', onMotionComplete);
            resolve();
          };
          
          this.model.on?.('motion:complete', onMotionComplete);
          this.model.on?.('motion:finish', onMotionComplete);
          
          // 设置超时以防止卡住
          setTimeout(() => {
            resolve(); // 即使没有触发完成事件也继续
          }, 5000);
          
          return;
        }
        
        // 否则使用 motionManager
        const internalModel = this.model.internalModel;
        const motionManager = internalModel?.motionManager;
        
        if (motionManager?.startMotion) {
          const fadeIn = options?.fadeIn ?? this.motionConfig.defaultFadeTime;
          const fadeOut = options?.fadeOut ?? this.motionConfig.defaultFadeTime;
          const weight = options?.weight ?? 1;
          const loop = options?.loop ?? false;
          
          // 提取动作名称
          const motionName = this.extractMotionName(motionPath);
          const groupName = this.extractGroupName(motionPath);
          
          if (motionName) {
            motionManager.startMotion(groupName, 0, 1, () => {
              if (this.autoExpressionEnabled) {
                triggerAutoExpression();
              }
              resolve();
            });
          } else {
            resolve();
          }
        } else {
          console.warn('Motion manager not available, simulating motion');
          setTimeout(resolve, 1000); // 模拟动作播放
        }
        
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 从文件路径中提取动作名
   */
  private extractMotionName(motionPath: string): string | null {
    // 从路径中提取文件名（不含扩展名）
    const filename = motionPath.split('/').pop();
    if (!filename) return null;
    
    return filename.replace(/\.[^/.]+$/, "");
  }

  /**
   * 从文件路径中提取组名
   */
  private extractGroupName(motionPath: string): string {
    const pathParts = motionPath.split('/');
    if (pathParts.length < 2) return 'Idle';
    
    // 尝试从父目录名获取组名
    const parentDir = pathParts[pathParts.length - 2];
    const groupNames = this.getMotionGroups();
    
    return groupNames.find(name => parentDir.toLowerCase().includes(name.toLowerCase())) || 'Idle';
  }

  /**
   * 应用随机权重
   */
  private applyRandomWeights(motionPaths: string[]): Array<{ path: string; weight: number }> {
    const weights = this.motionConfig.randomWeights;
    
    return motionPaths.map(path => {
      const motionName = this.extractMotionName(path);
      const weight = (motionName && weights[motionName]) || 1;
      return { path, weight };
    });
  }

  /**
   * 根据权重随机选择
   */
  private selectWeightedRandom(weightedItems: Array<{ path: string; weight: number }>): string {
    const totalWeight = weightedItems.reduce((sum, item) => sum + item.weight, 0);
    const random = Math.random() * totalWeight;
    
    let cumulativeWeight = 0;
    for (const item of weightedItems) {
      cumulativeWeight += item.weight;
      if (random <= cumulativeWeight) {
        return item.path;
      }
    }
    
    return weightedItems[0]?.path || '';
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.stopMotion();
    this.motionCompleteCallbacks = [];
    this.motionQueue = [];
  }
}

/**
   * 根据动作触发自动设置表情
   * 这是一个简化的实现，可以根据需要扩展
   */
function triggerAutoExpression(): void {
  // 实际实现可以根据动作类型触发不同的表情
  console.log('🎭 Auto expression triggered');
}

// 基本的MotionManager配置
export const DEFAULT_MOTION_CONFIG: Required<MotionManagerConfig> = {
  preventOverlap: true,
  enableQueue: true,
  defaultFadeTime: 500,
  randomWeights: {}
};