# Live2D Utilities

This directory contains utilities and managers for Live2D model functionality.

## ScaleManager

The `ScaleManager` class provides smooth, configurable scaling for Live2D models.

### Features

- ✅ **Smooth animations** - Configurable duration and easing
- ✅ **Zoom limits** - Min/max scale constraints
- ✅ **Step-based zoom** - Consistent increment/decrement
- ✅ **Mouse wheel support** - Scroll to zoom
- ✅ **Keyboard support** - Easy keyboard shortcuts
- ✅ **Animation control** - Start, stop, and track animations
- ✅ **Event callbacks** - React to scale changes
- ✅ **Center point calculation** - Scale around specific points

### Configuration

```typescript
interface ScaleConfig {
  minScale: number;        // Default: 0.5
  maxScale: number;        // Default: 2.5
  initialScale: number;    // Default: 1.0
  scaleStep: number;       // Default: 0.1
  smoothing: boolean;      // Default: true
  smoothDuration: number;  // Default: 200ms
}
```

### Basic Usage

```typescript
import { createScaleManager } from '@/lib/live2d';

const scaleManager = createScaleManager(
  {
    minScale: 0.5,
    maxScale: 2.5,
    initialScale: 1.0,
    scaleStep: 0.1,
    smoothing: true,
    smoothDuration: 200,
  },
  {
    onScaleChange: (scale) => {
      console.log('New scale:', scale);
      // Update your model here
    },
    onScaleAnimationStart: () => {
      console.log('Animation started');
    },
    onScaleAnimationEnd: () => {
      console.log('Animation ended');
    },
  }
);

// Zoom in/out
scaleManager.zoomIn();
scaleManager.zoomOut();

// Set absolute scale
scaleManager.setScale(1.5);

// Reset to initial
scaleManager.reset();

// Get current scale
const currentScale = scaleManager.getScale();

// Clean up
scaleManager.dispose();
```

### Integration with Live2DViewer

The `Live2DViewer` component automatically uses `ScaleManager` internally:

```typescript
import Live2DViewer from '@/components/Live2DViewer';

function MyComponent() {
  const viewerRef = useRef<Live2DViewerHandle>(null);

  return (
    <div>
      <Live2DViewer
        ref={viewerRef}
        modelPath="/live2d/model.model3.json"
      />
      
      {/* Control buttons */}
      <button onClick={() => viewerRef.current?.zoomIn()}>
        Zoom In
      </button>
      <button onClick={() => viewerRef.current?.zoomOut()}>
        Zoom Out
      </button>
      <button onClick={() => viewerRef.current?.resetZoom()}>
        Reset
      </button>
    </div>
  );
}
```

### Mouse Wheel Support

Mouse wheel zoom is automatically enabled in `Live2DViewer`:
- Scroll up = Zoom in
- Scroll down = Zoom out

### Animation Details

The `ScaleManager` uses `requestAnimationFrame` for smooth 60fps animations with cubic ease-out easing:

```typescript
easeOutCubic(t) = 1 - (1 - t)³
```

This provides a natural deceleration effect at the end of the animation.

### Advanced: Center Point Scaling

For scaling around a specific point (e.g., mouse cursor):

```typescript
import { ScaleManager } from '@/lib/live2d';

const offset = ScaleManager.calculateScaleOffset(
  { x: mouseX, y: mouseY },
  { width: containerWidth, height: containerHeight },
  oldScale,
  newScale
);

// Apply offset to maintain the center point
modelPosition.x += offset.x;
modelPosition.y += offset.y;
```

## Testing

Visit `/live2d-scale-test` to see a live demo with:
- Visual scale controls
- Mouse wheel support demonstration
- Test scenarios for all features
- Real-time feedback

## API Reference

### ScaleManager Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `zoomIn()` | Increase scale by step | `void` |
| `zoomOut()` | Decrease scale by step | `void` |
| `setScale(scale)` | Set absolute scale value | `void` |
| `reset()` | Reset to initial scale | `void` |
| `getScale()` | Get current scale | `number` |
| `getTargetScale()` | Get target scale (during animation) | `number` |
| `getConfig()` | Get current configuration | `ScaleConfig` |
| `updateConfig(config)` | Update configuration | `void` |
| `isAnimating()` | Check if animating | `boolean` |
| `stopAnimation()` | Stop current animation | `void` |
| `dispose()` | Clean up resources | `void` |

### Static Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `calculateScaleOffset(center, container, oldScale, newScale)` | Calculate position offset for center-point scaling | `ScalePoint` |

## Performance

- **Animation**: 60fps via `requestAnimationFrame`
- **Memory**: Minimal overhead (~1KB instance)
- **CPU**: Efficient easing calculations
- **Garbage**: No allocations during animation

## Browser Compatibility

Works in all modern browsers that support:
- `requestAnimationFrame`
- ES6 classes
- Arrow functions

## License

Part of the Live2D integration system.
