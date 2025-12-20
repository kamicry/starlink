import type { ActionInfo, ActionPriority } from './ActionManager';

/**
 * Live2D Action Configuration
 * 
 * This file defines the available motion groups, actions, and their properties.
 * You can customize which actions are available for your Live2D model here.
 */

/**
 * Common motion group names that Live2D models typically use:
 * - Idle: Default idle motions
 * - TapBody: Body tap/touch motions
 * - TapHead: Head tap/touch motions  
 * - FlickHead: Head flick motions
 * - PinchIn: Pinch in/zoom in gestures
 * - PinchOut: Pinch out/zoom out gestures
 * - Shake: Shake motions
 */

export interface ActionConfig {
  groups: Record<string, ActionInfo[]>;
  autoRandomActions: {
    enabled: boolean;
    intervalMin: number; // minimum seconds between random actions
    intervalMax: number; // maximum seconds between random actions
    allowedGroups: string[]; // which groups can be triggered randomly
    idleOnly: boolean; // only trigger when model is idle
  };
}

// Default action configuration
export const defaultActionConfig: ActionConfig = {
  groups: {
    // Idle motions - looped animations for when the model is idle
    Idle: [
      {
        name: 'Idle_01',
        group: 'Idle',
        priority: 'low',
        weight: 80, // 80% probability for this one
        loop: true,
        duration: 3000,
      },
      {
        name: 'Idle_02', 
        group: 'Idle',
        priority: 'low',
        weight: 20, // 20% probability
        loop: true,
        duration: 3500,
      },
      {
        name: 'Idle_03',
        group: 'Idle', 
        priority: 'low',
        weight: 15,
        loop: true,
        duration: 4000,
      },
    ],
    
    // Tap body motions - when user taps/clicks on body
    TapBody: [
      {
        name: 'TapBody_01',
        group: 'TapBody',
        priority: 'normal',
        weight: 60,
        loop: false,
        duration: 2000,
      },
      {
        name: 'TapBody_02',
        group: 'TapBody',
        priority: 'normal', 
        weight: 40,
        loop: false,
        duration: 1800,
      },
    ],

    // Tap head motions - when user taps/clicks on head  
    TapHead: [
      {
        name: 'TapHead_01',
        group: 'TapHead',
        priority: 'normal',
        weight: 50,
        loop: false,
        duration: 1500,
      },
      {
        name: 'TapHead_02',
        group: 'TapHead',
        priority: 'normal',
        weight: 50,
        loop: false,
        duration: 1600,
      },
    ],

    // Flick head motions - for head flick gestures
    FlickHead: [
      {
        name: 'FlickHead_01',
        group: 'FlickHead',
        priority: 'normal',
        weight: 100,
        loop: false,
        duration: 1200,
      },
    ],

    // Pinch in motions - zoom in gestures
    PinchIn: [
      {
        name: 'PinchIn_01',
        group: 'PinchIn',
        priority: 'normal',
        weight: 100,
        loop: false,
        duration: 1000,
      },
    ],

    // Pinch out motions - zoom out gestures  
    PinchOut: [
      {
        name: 'PinchOut_01',
        group: 'PinchOut',
        priority: 'normal',
        weight: 100,
        loop: false,
        duration: 1000,
      },
    ],

    // Shake motions - for shake interactions
    Shake: [
      {
        name: 'Shake_01',
        group: 'Shake',
        priority: 'normal',
        weight: 100,
        loop: false,
        duration: 1500,
      },
    ],

    // Special motions
    Special: [
      {
        name: 'Special_01',
        group: 'Special',
        priority: 'high',
        weight: 100,
        loop: false,
        duration: 3000,
        noResetExpression: true,
      },
    ],
  },

  // Auto random action configuration
  autoRandomActions: {
    enabled: true,
    intervalMin: 8, // 8 seconds minimum
    intervalMax: 20, // 20 seconds maximum
    allowedGroups: ['Idle'], // Only trigger idle animations randomly
    idleOnly: true, // Only trigger when model is idle
  },
};

/**
 * Action configuration presets for different model types
 */

// Preset for standard Live2D models
export const standardModelPreset: ActionConfig = {
  ...defaultActionConfig,
  groups: {
    ...defaultActionConfig.groups,
  },
};

// Preset for models with fewer motions (simplified)
export const minimalModelPreset: ActionConfig = {
  groups: {
    Idle: [
      {
        name: 'Idle',
        group: 'Idle',
        priority: 'low',
        weight: 100,
        loop: true,
        duration: 3000,
      },
    ],
    TapBody: [
      {
        name: 'TapBody',
        group: 'TapBody',
        priority: 'normal',
        weight: 100,
        loop: false,
        duration: 2000,
      },
    ],
  },
  autoRandomActions: {
    ...defaultActionConfig.autoRandomActions,
    intervalMin: 10,
    intervalMax: 25,
  },
};

// Preset for models with many detailed motions
export const detailedModelPreset: ActionConfig = {
  groups: {
    ...defaultActionConfig.groups,
    // Add more detailed groups
    Left: [
      {
        name: 'Left_01',
        group: 'Left',
        priority: 'normal',
        weight: 100,
        loop: false,
        duration: 1500,
      },
    ],
    Right: [
      {
        name: 'Right_01',
        group: 'Right',
        priority: 'normal',
        weight: 100,
        loop: false,
        duration: 1500,
      },
    ],
    Up: [
      {
        name: 'Up_01',
        group: 'Up',
        priority: 'normal',
        weight: 100,
        loop: false,
        duration: 1500,
      },
    ],
    Down: [
      {
        name: 'Down_01',
        group: 'Down',
        priority: 'normal',
        weight: 100,
        loop: false,
        duration: 1500,
      },
    ],
  },
  autoRandomActions: {
    ...defaultActionConfig.autoRandomActions,
    allowedGroups: ['Idle', 'Special'],
  },
};

// Helper function to apply configuration to action manager
export function applyActionConfig(config: ActionConfig): {
  groups: Record<string, ActionInfo[]>;
  autoRandom: typeof config.autoRandomActions;
} {
  return {
    groups: config.groups,
    autoRandom: config.autoRandomActions,
  };
}

// Get action info by name
export function findActionByName(actionName: string, config: ActionConfig = defaultActionConfig): ActionInfo | undefined {
  for (const groupActions of Object.values(config.groups)) {
    const action = groupActions.find(a => a.name === actionName);
    if (action) return action;
  }
  return undefined;
}

// Get all actions in a specific group
export function getActionsInGroup(groupName: string, config: ActionConfig = defaultActionConfig): ActionInfo[] {
  return config.groups[groupName] || [];
}

// Get actions that can be triggered randomly
export function getRandomTriggerableActions(config: ActionConfig = defaultActionConfig): ActionInfo[] {
  const allowedGroups = config.autoRandomActions.allowedGroups;
  const allTriggerable: ActionInfo[] = [];

  for (const [groupName, actions] of Object.entries(config.groups)) {
    if (allowedGroups.includes(groupName)) {
      allTriggerable.push(...actions);
    }
  }

  return allTriggerable;
}

// Validate action configuration
export function validateActionConfig(config: ActionConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const [groupName, actions] of Object.entries(config.groups)) {
    if (!actions || actions.length === 0) {
      errors.push(`Group '${groupName}' has no actions`);
      continue;
    }

    for (const action of actions) {
      if (!action.name) {
        errors.push(`Action in group '${groupName}' is missing a name`);
      }
      if (typeof action.weight !== 'number' || action.weight < 0) {
        errors.push(`Action '${action.name}' has invalid weight`);
      }
      if (typeof action.priority !== 'string') {
        errors.push(`Action '${action.name}' has invalid priority`);
      }
    }
  }

  const { autoRandomActions } = config;
  if (autoRandomActions.enabled) {
    if (autoRandomActions.intervalMin <= 0) {
      errors.push('autoRandomActions.intervalMin must be positive');
    }
    if (autoRandomActions.intervalMax < autoRandomActions.intervalMin) {
      errors.push('autoRandomActions.intervalMax must be >= intervalMin');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Export default config for easy import
export default defaultActionConfig;