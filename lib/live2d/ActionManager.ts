import {
  ACTION_CONFIGS,
  ACTION_GROUPS,
  getAllActionNames,
  getActionsByGroup,
  getRandomActionByWeight,
  getActionConfig,
  hasAction,
  getDefaultIdleAction,
  type ActionConfig
} from './actions';

export interface ActionQueueItem {
  id: string;
  actionName: string;
  priority: number; // 优先级，数值越大优先级越高
  timestamp: number;
  callback?: (completed: boolean) => void;
}

export interface ActionManagerOptions {
  autoPlayIdle?: boolean; // 是否自动播放空闲动作
  idleInterval?: number; // 空闲动作间隔（毫秒）
  maxQueueSize?: number; // 最大队列大小
  actionTimeout?: number; // 动作超时时间（毫秒）
}

export interface ActionState {
  isPlaying: boolean;
  currentAction: string | null;
  currentActionStartTime: number | null;
  queueSize: number;
  lastActionTime: number | null;
}

export type ActionCallback = (actionName: string, state: ActionState) => void;

export class ActionManager {
  private options: Required<ActionManagerOptions>;
  private actionQueue: ActionQueueItem[] = [];
  private isPlaying = false;
  private currentAction: string | null = null;
  private currentActionStartTime: number | null = null;
  private lastActionTime: number | null = null;
  private model: any = null;
  private availableActions: Set<string> = new Set();
  private idleTimer: NodeJS.Timeout | null = null;
  private timeoutTimer: NodeJS.Timeout | null = null;
  
  // 事件回调
  private onActionStart?: ActionCallback;
  private onActionComplete?: ActionCallback;
  private onQueueChange?: (queueSize: number) => void;
  private onError?: (error: string) => void;

  constructor(options: ActionManagerOptions = {}) {
    this.options = {
      autoPlayIdle: options.autoPlayIdle ?? true,
      idleInterval: options.idleInterval ?? 8000,
      maxQueueSize: options.maxQueueSize ?? 10,
      actionTimeout: options.actionTimeout ?? 10000,
    };
  }

  // 设置模型引用
  setModel(model: any) {
    this.model = model;
    this.updateAvailableActions();
  }

  // 更新可用动作列表
  private updateAvailableActions() {
    if (!this.model) return;
    
    this.availableActions.clear();
    
    try {
      console.log('=== 更新可用动作列表 ===');
      
      // 从模型内部获取可用动作
      const fromSettings = this.model.internalModel?.settings?.motions;
      if (fromSettings && typeof fromSettings === 'object') {
        const keys = Object.keys(fromSettings);
        console.log('从settings.motions找到动作:', keys);
        keys.forEach(actionName => {
          this.availableActions.add(actionName);
        });
      }

      // 从动作管理器获取
      const fromMotionManager = this.model.internalModel?.motionManager?.motionGroups;
      if (fromMotionManager && typeof fromMotionManager === 'object') {
        const keys = Object.keys(fromMotionManager);
        console.log('从motionManager.motionGroups找到动作:', keys);
        keys.forEach(actionName => {
          this.availableActions.add(actionName);
        });
      }

      // 检查是否有表达式文件
      const expressions = this.model.internalModel?.settings?.expressions;
      if (expressions && typeof expressions === 'object') {
        const keys = Object.keys(expressions);
        console.log('找到表达式:', keys);
        // 添加表达式作为可用动作
        keys.forEach(expressionName => {
          this.availableActions.add(`Expression_${expressionName}`);
        });
      }

      // 如果没有获取到任何动作，添加参数控制动作
      if (this.availableActions.size === 0) {
        console.log('没有找到预定义动作，使用参数控制动作');
        this.availableActions.add('Idle');
        this.availableActions.add('TapBody');
        this.availableActions.add('TapHead');
        this.availableActions.add('Happy');
        this.availableActions.add('Angry');
        this.availableActions.add('Sad');
        this.availableActions.add('Wink');
      }

      console.log('最终可用动作列表:', Array.from(this.availableActions));
    } catch (error) {
      console.warn('Failed to update available actions:', error);
      // 添加默认动作作为兜底
      this.availableActions.add('Idle');
      this.availableActions.add('TapBody');
    }
  }

  // 获取可用动作列表
  getAvailableActions(): string[] {
    return Array.from(this.availableActions);
  }

  // 检查动作是否可用
  isActionAvailable(actionName: string): boolean {
    return this.availableActions.has(actionName) && hasAction(actionName);
  }

  // 播放指定动作
  async playAction(actionName: string, priority: number = 0): Promise<boolean> {
    if (!this.model) {
      this.onError?.('Model not available');
      return false;
    }

    if (!this.isActionAvailable(actionName)) {
      this.onError?.(`Action '${actionName}' is not available`);
      return false;
    }

    const now = Date.now();
    const queueItem: ActionQueueItem = {
      id: `action_${now}_${Math.random().toString(36).substr(2, 9)}`,
      actionName,
      priority,
      timestamp: now,
    };

    // 如果队列已满，移除优先级最低的项
    if (this.actionQueue.length >= this.options.maxQueueSize) {
      this.actionQueue.sort((a, b) => a.priority - b.priority);
      this.actionQueue.shift(); // 移除第一个（优先级最低的）
    }

    this.actionQueue.push(queueItem);
    this.onQueueChange?.(this.actionQueue.length);

    // 立即播放高优先级动作
    if (priority > 0 && !this.isPlaying) {
      await this.processQueue();
    } else if (!this.isPlaying) {
      // 延迟处理，避免频繁触发
      setTimeout(() => this.processQueue(), 50);
    }

    return true;
  }

  // 播放随机动作
  async playRandomAction(actions?: string[]): Promise<string | null> {
    const availableActions = actions?.filter(action => this.isActionAvailable(action)) 
                           || this.getAvailableActions();
    
    if (availableActions.length === 0) {
      this.onError?.('No available actions for random selection');
      return null;
    }

    // 使用权重随机选择
    const selectedAction = getRandomActionByWeight(availableActions);
    await this.playAction(selectedAction, 0);
    return selectedAction;
  }

  // 从指定组随机播放动作
  async playRandomActionFromGroup(groupName: string): Promise<string | null> {
    const groupActions = getActionsByGroup(groupName)
      .filter(action => this.isActionAvailable(action));
    
    if (groupActions.length === 0) {
      this.onError?.(`No available actions in group '${groupName}'`);
      return null;
    }

    const selectedAction = getRandomActionByWeight(groupActions);
    await this.playAction(selectedAction, 1); // 分组动作优先级稍高
    return selectedAction;
  }

  // 停止当前动作
  stopAction(): boolean {
    if (!this.isPlaying || !this.currentAction) {
      return false;
    }

    try {
      // 停止模型当前动作
      if (this.model && typeof this.model.motion === 'function') {
        // 有些模型可能需要特殊方法停止动作
        this.model.motion('Idle'); // 切换到空闲动作
      }

      this.isPlaying = false;
      this.currentAction = null;
      this.currentActionStartTime = null;
      
      // 清除超时定时器
      if (this.timeoutTimer) {
        clearTimeout(this.timeoutTimer);
        this.timeoutTimer = null;
      }

      return true;
    } catch (error) {
      console.error('Failed to stop action:', error);
      return false;
    }
  }

  // 清空动作队列
  clearQueue(): void {
    this.actionQueue = [];
    this.onQueueChange?.(0);
  }

  // 处理动作队列
  private async processQueue(): Promise<void> {
    if (this.isPlaying || this.actionQueue.length === 0) {
      return;
    }

    // 按优先级和时间排序
    this.actionQueue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority; // 优先级高的在前
      }
      return a.timestamp - b.timestamp; // 时间早的在前
    });

    const nextItem = this.actionQueue.shift()!;
    this.onQueueChange?.(this.actionQueue.length);

    await this.executeAction(nextItem);
  }

  // 执行具体动作
  private async executeAction(queueItem: ActionQueueItem): Promise<void> {
    if (!this.model) return;

    this.isPlaying = true;
    this.currentAction = queueItem.actionName;
    this.currentActionStartTime = Date.now();
    this.lastActionTime = this.currentActionStartTime;

    const actionConfig = getActionConfig(queueItem.actionName);
    const expectedDuration = actionConfig?.duration || 2000;

    this.onActionStart?.(queueItem.actionName, this.getState());

    try {
      // 执行模型动作
      if (typeof this.model.motion === 'function') {
        this.model.motion(queueItem.actionName);
      } else {
        // 备用方案：使用内部API
        const internal = this.model.internalModel;
        const motionManager = internal?.motionManager;
        if (motionManager?.startMotion) {
          motionManager.startMotion(queueItem.actionName, 0);
        }
      }

      // 设置动作超时
      this.timeoutTimer = setTimeout(() => {
        console.warn(`Action '${queueItem.actionName}' timed out`);
        this.completeAction(queueItem, false);
      }, this.options.actionTimeout);

    } catch (error) {
      console.error('Failed to execute action:', queueItem.actionName, error);
      this.completeAction(queueItem, false);
    }
  }

  // 完成动作
  private completeAction(queueItem: ActionQueueItem, completed: boolean): void {
    this.isPlaying = false;
    this.currentAction = null;
    this.currentActionStartTime = null;

    // 清除超时定时器
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }

    this.onActionComplete?.(queueItem.actionName, this.getState());

    // 调用回调
    queueItem.callback?.(completed);

    // 继续处理队列
    setTimeout(() => this.processQueue(), 100);
  }

  // 获取当前状态
  getState(): ActionState {
    return {
      isPlaying: this.isPlaying,
      currentAction: this.currentAction,
      currentActionStartTime: this.currentActionStartTime,
      queueSize: this.actionQueue.length,
      lastActionTime: this.lastActionTime,
    };
  }

  // 启动自动空闲动作
  private startIdleActions(): void {
    if (!this.options.autoPlayIdle || this.idleTimer) return;

    this.idleTimer = setInterval(() => {
      if (!this.isPlaying && this.actionQueue.length === 0) {
        const idleAction = getDefaultIdleAction();
        if (this.isActionAvailable(idleAction)) {
          this.playAction(idleAction, -1); // 低优先级
        }
      }
    }, this.options.idleInterval);
  }

  // 停止自动空闲动作
  private stopIdleActions(): void {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
  }

  // 设置事件回调
  setCallbacks(callbacks: {
    onActionStart?: ActionCallback;
    onActionComplete?: ActionCallback;
    onQueueChange?: (queueSize: number) => void;
    onError?: (error: string) => void;
  }) {
    this.onActionStart = callbacks.onActionStart;
    this.onActionComplete = callbacks.onActionComplete;
    this.onQueueChange = callbacks.onQueueChange;
    this.onError = callbacks.onError;
  }

  // 启用/禁用自动空闲动作
  setAutoPlayIdle(enabled: boolean): void {
    this.options.autoPlayIdle = enabled;
    if (enabled) {
      this.startIdleActions();
    } else {
      this.stopIdleActions();
    }
  }

  // 清理资源
  dispose(): void {
    this.stopIdleActions();
    
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }

    this.clearQueue();
    this.model = null;
    this.availableActions.clear();
  }
}