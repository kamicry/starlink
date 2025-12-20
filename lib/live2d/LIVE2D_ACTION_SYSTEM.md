# Live2D Action System Documentation

## Overview

The Live2D Action System provides comprehensive management and control of Live2D model motions, expressions, and interactions. It includes an action queue system, random action selection with weights, mouse tracking, and click detection.

## Features

### Core Features
- **Action Queue Management**: FIFO-based queue with priority support
- **Random Action Selection**: Weighted probability system for natural behavior
- **Hit Testing**: Precise click detection on model parts (head, body, face)
- **Mouse Tracking**: Model head and eyes follow cursor movement
- **Priority System**: High/normal/low priority levels for action conflicts
- **Statistics Tracking**: Real-time monitoring of action states
- **Callback System**: Lifecycle hooks for action start, complete, and stop
- **Expression Management**: Automatic expression control during actions

## Installation

```bash
npm install pixi.js pixi-live2d-display
```

## Usage

### Basic Setup

```tsx
import { Live2DViewer } from './components/Live2DViewer';
import { defaultActionConfig } from './lib/live2d/actions';

function MyComponent() {
  return (
    <Live2DViewer
      modelPath="/models/my-model.model3.json"
      enableMouseTracking={true}
      trackHeadMovement={true}
      trackEyeMovement={true}
      actionConfig={defaultActionConfig}
    />
  );
}
```

### Advanced Usage with Reference

```tsx
import { useRef, useEffect } from 'react';
import { Live2DViewer, Live2DViewerHandle } from './components/Live2DViewer';

function MyComponent() {
  const viewerRef = useRef<Live2DViewerHandle>(null);

  useEffect(() => {
    // Play a random action after 2 seconds
    setTimeout(() => {
      viewerRef.current?.playRandomAction();
    }, 2000);
  }, []);

  const handleButtonClick = () => {
    // Queue multiple actions
    viewerRef.current?.queueAction('TapBody_01', 'TapBody');
    viewerRef.current?.queueAction('TapHead_01', 'TapHead');
  };

  return (
    <>
      <Live2DViewer
        ref={viewerRef}
        modelPath="/models/my-model.model3.json"
        onAction={(actionName) => console.log('Action:', actionName)}
      />
      <button onClick={handleButtonClick}>Queue Actions</button>
    </>
  );
}
```

## API Reference

### Live2DViewer Component Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `modelPath` | `string` | **required** | Path to Live2D model JSON file |
| `actionConfig` | `ActionConfig` | `defaultActionConfig` | Action configuration object |
| `enableMouseTracking` | `boolean` | `false` | Enable mouse position tracking |
| `trackHeadMovement` | `boolean` | `true` | Make head follow mouse cursor |
| `trackEyeMovement` | `boolean` | `true` | Make eyes follow mouse cursor |
| `onAction` | `(actionName: string) => void` | - | Callback when an action starts |
| `onLoadComplete` | `(path: string) => void` | - | Model load completion callback |
| `className` | `string` | - | Custom CSS class names |
| `style` | `CSSProperties` | - | Custom inline styles |

### Live2DViewerHandle Methods

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `loadModel` | `path: string` | `Promise<void>` | Load a Live2D model |
| `playAction` | `actionName: string` | `void` | Play a specific action |
| `playRandomAction` | `groupName?: string` | `void` | Play random action from group or all |
| `playRandomActionFromGroup` | `groupName: string` | `void` | Play random action from specific group |
| `queueAction` | `actionName: string, groupName?: string` | `void` | Add action to queue |
| `stopAction` | - | `void` | Stop current action |
| `getActionStats` | - | `ActionStats` | Get current action statistics |
| `dispose` | - | `void` | Dispose the viewer |

### ActionStats Interface

```typescript
interface ActionStats {
  isPlaying: boolean;
  currentAction?: {
    name: string;
    group: string;
  };
  queueLength: number;
  availableGroups: string[];
  totalActions: number;
}
```

## Action Configuration

### Structure

```typescript
interface ActionConfig {
  groups: Record<string, ActionInfo[]>;
  autoRandomActions: {
    enabled: boolean;
    intervalMin: number;
    intervalMax: number;
    allowedGroups: string[];
    idleOnly: boolean;
  };
}

interface ActionInfo {
  name: string;              // Action name (e.g., "TapBody_01")
  group: string;             // Action group (e.g., "TapBody")
  priority: ActionPriority;  // 'high' | 'normal' | 'low'
  weight: number;            // 0-100 weight for random selection
  loop?: boolean;            // Whether to loop the animation
  duration?: number;         // Auto-stop duration in ms
  speed?: number;            // Playback speed multiplier
  noResetExpression?: boolean; // Don't reset expression after
}
```

### Example Configuration

```typescript
import { ActionConfig } from './lib/live2d/ActionManager';

const myActionConfig: ActionConfig = {
  groups: {
    Idle: [
      {
        name: 'Idle_01',
        group: 'Idle',
        priority: 'low',
        weight: 80,
        loop: true,
        duration: 3000,
      },
      {
        name: 'Idle_02',
        group: 'Idle',
        priority: 'low',
        weight: 20,
        loop: true,
        duration: 3500,
      },
    ],
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
  },
  autoRandomActions: {
    enabled: true,
    intervalMin: 8,
    intervalMax: 20,
    allowedGroups: ['Idle'],
    idleOnly: true,
  },
};
```

### Preset Configurations

```typescript
import { 
  defaultActionConfig, 
  minimalModelPreset, 
  detailedModelPreset 
} from './lib/live2d/actions';

// Standard models
<Live2DViewer actionConfig={defaultActionConfig} />

// Simple models with minimal motions
<Live2DViewer actionConfig={minimalModelPreset} />

// Complex models with many motions
<Live2DViewer actionConfig={detailedModelPreset} />
```

## Click Interaction

### Hit Testing

The system automatically detects clicks on different model areas:

```typescript
// Head click
defaultActionConfig.groups.TapHead

// Body click
defaultActionConfig.groups.TapBody

// Default fallback
defaultActionConfig.groups.Idle
```

### Custom Click Handling

```tsx
<Live2DViewer
  onAction={(actionName) => {
    // Add visual feedback
    showParticles();
    playSound();
  }}
/>
```

## Mouse Tracking

### Automatic Head & Eye Following

When enabled, the model automatically follows the mouse cursor:

```tsx
<Live2DViewer
  enableMouseTracking={true}
  trackHeadMovement={true}
  trackEyeMovement={true}
/>
```

### Custom Tracking Parameters

```typescript
// In lib/live2d/ActionManager.ts
const HEAD_TRACKING_MULTIPLIER = 0.3; // Adjust head movement sensitivity
const EYE_TRACKING_MULTIPLIER = 2.0;  // Adjust eye movement sensitivity
const MOUSE_TRACKING_INTERVAL_MS = 50; // Update frequency
```

## Action Queue System

### Queue Management

```typescript
// Queue multiple actions
viewerRef.current.queueAction('TapBody_01', 'TapBody');
viewerRef.current.queueAction('TapHead_01', 'TapHead');
viewerRef.current.queueAction('Idle_01', 'Idle');

// Queue processes automatically when current action finishes
```

### Priority Handling

```typescript
// High priority actions interrupt current actions (default)
actionManager.playAction('Special_01', 'Special', { priority: 'high' });

// Normal priority actions wait for current action to finish
actionManager.playAction('TapBody_01', 'TapBody', { priority: 'normal' });

// Low priority actions only play when model is idle
actionManager.playAction('Idle_01', 'Idle', { priority: 'low' });
```

## Statistics and Monitoring

### Real-time Stats

```typescript
const stats = viewerRef.current.getActionStats();

console.log({
  isPlaying: stats.isPlaying,                // Currently playing action
  currentAction: stats.currentAction,        // { name, group }
  queueLength: stats.queueLength,            // Pending actions
  availableGroups: stats.availableGroups,    // Available motion groups
  totalActions: stats.totalActions,          // Total available actions
});
```

## Advanced Features

### Action Completion Callbacks

```typescript
actionManager.setCallbacks({
  onActionStart: (actionName) => {
    console.log('Action started:', actionName);
    // Add visual feedback, sound effects, etc.
  },
  
  onActionComplete: (actionName) => {
    console.log('Action completed:', actionName);
    // Resume idle animations, update UI
    
    // Auto-resume idle if queue is empty
    const stats = actionManager.getStats();
    if (stats.queueLength === 0 && !stats.isPlaying) {
      actionManager.playRandomAction('Idle');
    }
  },
  
  onActionStop: (actionName) => {
    console.log('Action stopped:', actionName);
    // Cleanup, reset states
  },
  
  onQueueEmpty: () => {
    console.log('Action queue empty');
    // Return to idle state
    actionManager.playRandomAction('Idle');
  },
});
```

### Expression Management

```typescript
// Set expression during action
actionManager.setExpression('smile');

// Reset expression
actionManager.resetExpression();

// No reset for specific actions
const action = {
  name: 'Special_01',
  group: 'Special',
  noResetExpression: true, // Don't reset after completion
};
```

### Loop Controls

```typescript
// Loop action continuously
const idleAction = {
  name: 'Idle_01',
  group: 'Idle',
  loop: true, // Continuous loop
};

// Single play action
const tapAction = {
  name: 'TapBody_01',
  group: 'TapBody',
  loop: false, // Play once and stop
};
```

## Performance Considerations

### Optimizations
- **Action Queue Limit**: Maximum 50 queued actions to prevent memory issues
- **Auto-cleanup**: Timers and intervals automatically cleared on dispose
- **Frame Rate**: Mouse tracking limited to 50ms intervals (20 FPS)
- **Memory Management**: Proper disposal of Live2D models and textures

### Best Practices
```typescript
// 1. Always dispose when component unmounts
useEffect(() => {
  return () => {
    viewerRef.current?.dispose();
  };
}, []);

// 2. Clear queue when switching models
viewerRef.current?.stopAction();
await viewerRef.current?.loadModel(newPath);

// 3. Use appropriate priorities
// High: User interactions
// Normal: Click responses  
// Low: Background animations

// 4. Limit queue size
if (viewerRef.current.getActionStats().queueLength > 10) {
  // Clear and start fresh
  viewerRef.current.stopAction();
}
```

## Troubleshooting

### Common Issues

#### Actions Not Playing
- Check model path and file existence
- Verify action names match model settings
- Check browser console for errors
- Ensure motion files are properly loaded

#### Mouse Tracking Not Working
- Verify `enableMouseTracking` prop is true
- Check that model supports head/eye parameters
- Verify `trackHeadMovement` and `trackEyeMovement` props
- Inspect model's parameter IDs (ParamAngleX, ParamEyeBallX, etc.)

#### Click Detection Issues
- Verify model has hit area definitions
- Check hit area names (Head, Body, Face)
- Ensure model is interactive and clickable
- Test with different model files

#### Performance Issues
- Reduce mouse tracking frequency (increase MOUSE_TRACKING_INTERVAL_MS)
- Limit concurrent actions
- Optimize model textures and size
- Disable auto-random actions if unnecessary

### Debug Mode

```typescript
// Enable detailed logging
console.log('Available groups:', viewerRef.current.getActionStats().availableGroups);

// Test direct motion playing
const model = viewerRef.current;
model.motion('Idle_01');

// Check model structure
console.log('Model internal:', model.internalModel);
console.log('Motion manager:', model.internalModel?.motionManager);
```

## Examples

### Full Demo Component

See `Live2DActionTest.tsx` for a complete demonstration of all features including:

- Action groups browser
- Queue management UI
- Real-time statistics display
- Mouse position tracking
- Interactive controls

### Integration with Chat System

```typescript
// When receiving chat response
useEffect(() => {
  if (message.type === 'assistant') {
    // Choose appropriate action based on emotion
    if (message.emotion === 'happy') {
      viewerRef.current?.playRandomActionFromGroup('Special');
    } else {
      viewerRef.current?.queueAction('Idle_01', 'Idle');
    }
  }
}, [message]);
```

## Version History

- v1.5.0: Initial Action Manager implementation
  - Action queue management
  - Weighted random selection
  - Mouse tracking and hit testing
  - Priority-based action system
  - Statistics tracking

## License

This Live2D Action System is part of the Starlink project and follows the same licensing terms.