export type ActionPriority = 'high' | 'normal' | 'low';

export interface ActionInfo {
  name: string;
  group: string;
  priority: ActionPriority;
  weight: number; // 0-100, probability weight
  loop?: boolean;
  duration?: number; // in milliseconds
  speed?: number; // playback speed multiplier
  noResetExpression?: boolean; // don't reset expression after action completes
}

export interface QueuedAction {
  name: string;
  group: string;
  priority: ActionPriority;
  loop?: boolean;
  speed?: number;
}

export interface ActionResult {
  success: boolean;
  message?: string;
  actionName?: string;
}

export interface ActionManagerCallbacks {
  onActionStart?: (actionName: string) => void;
  onActionComplete?: (actionName: string) => void;
  onActionStop?: (actionName: string) => void;
  onQueueEmpty?: () => void;
}

export class ActionManager {
  private availableActionGroups: Map<string, ActionInfo[]> = new Map();
  private availableExpressions: Set<string> = new Set();
  private actionQueue: QueuedAction[] = [];
  private isPlaying: boolean = false;
  private currentAction?: {
    name: string;
    group: string;
    startTime: number;
    timerId?: ReturnType<typeof setTimeout>;
    loop: boolean;
  };
  private currentExpression?: string;
  private callbacks: ActionManagerCallbacks = {};
  private pausedForAction: boolean = false;

  constructor(
    private readonly motionController: any,
    private readonly expressionController?: any
  ) {
    this.motionController = motionController;
  }

  setCallbacks(callbacks: ActionManagerCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  addActionGroup(groupName: string, actions: ActionInfo[]): void {
    if (actions.length === 0) return;
    
    const normalizedGroupName = this.normalizeGroupName(groupName);
    this.availableActionGroups.set(normalizedGroupName, actions);
  }

  addExpression(expressionName: string): void {
    this.availableExpressions.add(expressionName);
  }

  private normalizeGroupName(groupName: string): string {
    // Normalize common group names
    const groupNameMap: Record<string, string> = {
      'idle': 'Idle',
      'tap': 'Tap',
      'tap_body': 'TapBody',
      'tap_head': 'TapHead',
      'flick_head': 'FlickHead',
      'pinch_in': 'PinchIn',
      'pinch_out': 'PinchOut',
      'shake': 'Shake',
    };

    return groupNameMap[groupName.toLowerCase()] || groupName;
  }

  getAvailableActionGroups(): string[] {
    return Array.from(this.availableActionGroups.keys());
  }

  getActionsForGroup(groupName: string): ActionInfo[] {
    const normalized = this.normalizeGroupName(groupName);
    return this.availableActionGroups.get(normalized) || [];
  }

  getAvailableExpressions(): string[] {
    return Array.from(this.availableExpressions);
  }

  getAllActions(): ActionInfo[] {
    const allActions: ActionInfo[] = [];
    for (const actions of this.availableActionGroups.values()) {
      allActions.push(...actions);
    }
    return allActions;
  }

  private selectWeightedRandomAction(groupName?: string): ActionInfo | null {
    const actions = groupName ? 
      this.getActionsForGroup(groupName) : 
      this.getAllActions();

    if (actions.length === 0) return null;

    const totalWeight = actions.reduce((sum, action) => sum + action.weight, 0);
    
    if (totalWeight <= 0) {
      // Fallback to equal probability
      return actions[Math.floor(Math.random() * actions.length)];
    }

    let random = Math.random() * totalWeight;
    for (const action of actions) {
      random -= action.weight;
      if (random <= 0) {
        return action;
      }
    }

    // Fallback
    return actions[actions.length - 1];
  }

  playRandomAction(groupName?: string): ActionResult {
    const action = this.selectWeightedRandomAction(groupName);
    
    if (!action) {
      return {
        success: false,
        message: 'No actions available',
      };
    }

    return this.playAction(action.name, action.group, {
      priority: action.priority,
      loop: action.loop,
      speed: action.speed,
    });
  }

  playAction(
    actionName: string,
    groupName: string,
    options: {
      priority?: ActionPriority;
      loop?: boolean;
      speed?: number;
    } = {}
  ): ActionResult {
    console.log(`ActionManager: Playing action ${actionName} from group ${groupName}`);
    
    try {
      // Stop current action if playing
      if (this.isPlaying) {
        this.stopCurrentAction(false);
      }

      this.isPlaying = true;
      const loop = options.loop || false;

      this.currentAction = {
        name: actionName,
        group: groupName,
        startTime: Date.now(),
        loop,
      };

      // Play the motion
      if (this.motionController.startMotion) {
        const priority = this.getMotionPriority(options.priority || 'normal');
        this.motionController.startMotion(groupName, 0, priority);
      } else if (this.motionController.motion) {
        this.motionController.motion(actionName);
      }

      // Set up auto-stop timer if duration is specified
      const actions = this.getActionsForGroup(groupName);
      const actionInfo = actions.find(a => a.name === actionName);
      
      if (actionInfo?.duration && !actionInfo.loop) {
        this.currentAction.timerId = setTimeout(() => {
          if (this.currentAction?.name === actionName) {
            this.stopCurrentAction(true);
          }
        }, actionInfo.duration);
      }

      // Trigger callback
      this.callbacks.onActionStart?.(actionName);

      return {
        success: true,
        actionName,
      };

    } catch (error: any) {
      console.error('Error playing action:', error);
      this.isPlaying = false;
      return {
        success: false,
        message: error.message || 'Failed to play motion',
      };
    }
  }

  private getMotionPriority(priority: ActionPriority): number {
    const priorityMap: Record<ActionPriority, number> = {
      low: 1,
      normal: 2,
      high: 3,
    };
    return priorityMap[priority] || 2;
  }

  stopCurrentAction(triggerCallback: boolean = true): void {
    if (!this.isPlaying || !this.currentAction) return;

    console.log(`ActionManager: Stopping current action ${this.currentAction.name}`);

    // Clear any timers
    if (this.currentAction.timerId) {
      clearTimeout(this.currentAction.timerId);
      this.currentAction.timerId = undefined;
    }

    const actionName = this.currentAction.name;
    this.isPlaying = false;
    this.currentAction = undefined;

    // Stop motion
    try {
      if (this.motionController.stopAllMotions) {
        this.motionController.stopAllMotions();
      }
    } catch (error) {
      console.error('Error stopping motions:', error);
    }

    if (triggerCallback && this.callbacks.onActionStop) {
      this.callbacks.onActionStop(actionName);
    }
  }

  onActionComplete(): void {
    if (!this.currentAction) return;

    const actionName = this.currentAction.name;
    
    // Clear timer if action completed normally
    if (this.currentAction.timerId) {
      clearTimeout(this.currentAction.timerId);
      this.currentAction.timerId = undefined;
    }

    // Check if this was a looped action
    if (this.currentAction.loop) {
      // For looped actions, don't mark as complete, keep playing
      return;
    }

    this.isPlaying = false;
    const completedAction = this.currentAction;
    this.currentAction = undefined;

    console.log(`ActionManager: Action completed ${actionName}`);
    
    this.callbacks.onActionComplete?.(actionName);

    // Resume idle expression if expression controller is available
    if (!this.pausedForAction && this.expressionController && this.currentExpression) {
      try {
        this.expressionController.setExpression?.(this.currentExpression);
      } catch (error) {
        console.error('Error resuming expression:', error);
      }
    }

    // Process next action in queue
    this.processQueue();
  }

  queueAction(actionName: string, groupName?: string, priority: ActionPriority = 'normal'): ActionResult {
    console.log(`ActionManager: Queueing action ${actionName} from group ${groupName || 'default'}`);

    const queueEntry: QueuedAction = {
      name: actionName,
      group: groupName || this.inferGroupName(actionName),
      priority,
    };

    this.actionQueue.push(queueEntry);
    
    // If not currently playing, start processing
    if (!this.isPlaying) {
      this.processQueue();
    }

    return {
      success: true,
      actionName,
    };
  }

  private inferGroupName(actionName: string): string {
    // Try to find the action in available groups
    for (const [groupName, actions] of this.availableActionGroups) {
      if (actions.some(a => a.name === actionName)) {
        return groupName;
      }
    }

    // Fallback to common group names
    const lowerName = actionName.toLowerCase();
    if (lowerName.includes('idle')) return 'Idle';
    if (lowerName.includes('tap')) return 'TapBody';
    return 'Idle';
  }

  private processQueue(): void {
    if (this.isPlaying || this.actionQueue.length === 0) {
      return;
    }

    const nextAction = this.actionQueue.shift();
    if (!nextAction) {
      this.callbacks.onQueueEmpty?.();
      return;
    }

    this.playAction(nextAction.name, nextAction.group, {
      priority: nextAction.priority,
    });
  }

  clearQueue(): void {
    this.actionQueue = [];
  }

  getQueueLength(): number {
    return this.actionQueue.length;
  }

  isActionPlaying(): boolean {
    return this.isPlaying;
  }

  getCurrentAction(): { name: string; group: string } | undefined {
    if (!this.currentAction) return undefined;
    
    return {
      name: this.currentAction.name,
      group: this.currentAction.group,
    };
  }

  // Expression management
  setExpression(expressionName: string): ActionResult {
    if (!this.expressionController) {
      return {
        success: false,
        message: 'Expression controller not available',
      };
    }

    try {
      this.expressionController.setExpression?.(expressionName);
      this.currentExpression = expressionName;
      
      return {
        success: true,
        actionName: expressionName,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to set expression',
      };
    }
  }

  resetExpression(): void {
    if (this.expressionController) {
      try {
        this.expressionController.setExpression?.('');
        this.currentExpression = undefined;
      } catch (error) {
        console.error('Error resetting expression:', error);
      }
    }
  }

export interface ActionStats {
  isPlaying: boolean;
  currentAction?: { name: string; group: string };
  queueLength: number;
  availableGroups: string[];
  totalActions: number;
}

  // Statistics
  getStats(): ActionStats {
    return {
      isPlaying: this.isPlaying,
      currentAction: this.getCurrentAction(),
      queueLength: this.getQueueLength(),
      availableGroups: this.getAvailableActionGroups(),
      totalActions: this.getAllActions().length || 0,
    };
  }

  destroy(): void {
    this.stopCurrentAction(false);
    this.clearQueue();
    this.availableActionGroups.clear();
    this.availableExpressions.clear();
    this.callbacks = {};
  }
}