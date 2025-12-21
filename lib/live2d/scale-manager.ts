/**
 * Live2D Model Scale Manager
 * 
 * Manages model scaling with smooth animations and configurable constraints
 */

export interface ScaleConfig {
  minScale: number;        // 最小缩放比例，默认 0.5
  maxScale: number;        // 最大缩放比例，默认 2.5
  initialScale: number;    // 初始缩放比例，默认 1.0
  scaleStep: number;       // 每次缩放增量，默认 0.1
  smoothing: boolean;      // 是否平滑缩放，默认 true
  smoothDuration: number;  // 平滑时间（ms），默认 200
}

export interface ScalePoint {
  x: number;
  y: number;
}

const DEFAULT_CONFIG: ScaleConfig = {
  minScale: 0.5,
  maxScale: 2.5,
  initialScale: 1.0,
  scaleStep: 0.1,
  smoothing: true,
  smoothDuration: 200,
};

/**
 * ScaleManager manages the scaling behavior of a Live2D model
 */
export class ScaleManager {
  private config: ScaleConfig;
  private currentScale: number;
  private targetScale: number;
  private animationFrameId: number | null = null;
  private animationStartTime: number = 0;
  private animationStartScale: number = 0;
  
  // Callbacks for external updates
  private onScaleChange?: (scale: number) => void;
  private onScaleAnimationStart?: () => void;
  private onScaleAnimationEnd?: () => void;

  constructor(
    config: Partial<ScaleConfig> = {},
    callbacks?: {
      onScaleChange?: (scale: number) => void;
      onScaleAnimationStart?: () => void;
      onScaleAnimationEnd?: () => void;
    }
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentScale = this.config.initialScale;
    this.targetScale = this.config.initialScale;
    
    if (callbacks) {
      this.onScaleChange = callbacks.onScaleChange;
      this.onScaleAnimationStart = callbacks.onScaleAnimationStart;
      this.onScaleAnimationEnd = callbacks.onScaleAnimationEnd;
    }
  }

  /**
   * Increase scale by one step
   */
  public zoomIn(): void {
    const newScale = this.targetScale + this.config.scaleStep;
    this.setScale(newScale);
  }

  /**
   * Decrease scale by one step
   */
  public zoomOut(): void {
    const newScale = this.targetScale - this.config.scaleStep;
    this.setScale(newScale);
  }

  /**
   * Set absolute scale value
   */
  public setScale(scale: number): void {
    // Clamp to min/max
    const clampedScale = Math.max(
      this.config.minScale,
      Math.min(this.config.maxScale, scale)
    );

    this.targetScale = clampedScale;

    if (this.config.smoothing) {
      this.startSmoothScale();
    } else {
      this.currentScale = clampedScale;
      this.notifyScaleChange();
    }
  }

  /**
   * Reset to initial scale
   */
  public reset(): void {
    this.setScale(this.config.initialScale);
  }

  /**
   * Get current scale value
   */
  public getScale(): number {
    return this.currentScale;
  }

  /**
   * Get target scale (may differ from current during animation)
   */
  public getTargetScale(): number {
    return this.targetScale;
  }

  /**
   * Get configuration
   */
  public getConfig(): ScaleConfig {
    return { ...this.config };
  }

  /**
   * Check if animation is in progress
   */
  public isAnimating(): boolean {
    return this.animationFrameId !== null;
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<ScaleConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Stop any ongoing animation
   */
  public stopAnimation(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
      this.onScaleAnimationEnd?.();
    }
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    this.stopAnimation();
    this.onScaleChange = undefined;
    this.onScaleAnimationStart = undefined;
    this.onScaleAnimationEnd = undefined;
  }

  /**
   * Start smooth scale animation
   */
  private startSmoothScale(): void {
    // Stop any existing animation
    this.stopAnimation();

    // If already at target, no need to animate
    if (Math.abs(this.currentScale - this.targetScale) < 0.001) {
      return;
    }

    this.animationStartTime = Date.now();
    this.animationStartScale = this.currentScale;
    this.onScaleAnimationStart?.();

    this.animateScale();
  }

  /**
   * Animation loop for smooth scaling
   */
  private animateScale = (): void => {
    const elapsed = Date.now() - this.animationStartTime;
    const progress = Math.min(elapsed / this.config.smoothDuration, 1);

    // Use easeOutCubic for smooth deceleration
    const easedProgress = this.easeOutCubic(progress);

    // Calculate current scale
    this.currentScale = 
      this.animationStartScale + 
      (this.targetScale - this.animationStartScale) * easedProgress;

    this.notifyScaleChange();

    if (progress < 1) {
      // Continue animation
      this.animationFrameId = requestAnimationFrame(this.animateScale);
    } else {
      // Animation complete
      this.currentScale = this.targetScale;
      this.animationFrameId = null;
      this.notifyScaleChange();
      this.onScaleAnimationEnd?.();
    }
  };

  /**
   * Easing function for smooth animation
   */
  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  /**
   * Notify scale change to external listeners
   */
  private notifyScaleChange(): void {
    this.onScaleChange?.(this.currentScale);
  }

  /**
   * Calculate scale factor relative to a point
   * Returns the position offset needed to scale around a specific point
   */
  public static calculateScaleOffset(
    centerPoint: ScalePoint,
    containerSize: { width: number; height: number },
    oldScale: number,
    newScale: number
  ): ScalePoint {
    // Calculate the relative position of the center point (0-1)
    const relativeX = centerPoint.x / containerSize.width;
    const relativeY = centerPoint.y / containerSize.height;

    // Calculate offset to maintain the center point position
    const scaleDiff = newScale - oldScale;
    const offsetX = -relativeX * scaleDiff * containerSize.width;
    const offsetY = -relativeY * scaleDiff * containerSize.height;

    return { x: offsetX, y: offsetY };
  }
}

/**
 * Helper function to create a ScaleManager with default settings
 */
export function createScaleManager(
  config?: Partial<ScaleConfig>,
  callbacks?: {
    onScaleChange?: (scale: number) => void;
    onScaleAnimationStart?: () => void;
    onScaleAnimationEnd?: () => void;
  }
): ScaleManager {
  return new ScaleManager(config, callbacks);
}
