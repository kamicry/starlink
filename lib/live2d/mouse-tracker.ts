/**
 * Live2D Mouse Tracker
 * 鼠标跟踪系统，使模型的眼睛和头部跟随鼠标光标移动
 */

export interface MouseTrackerConfig {
  canvasElement: HTMLCanvasElement;
  model: any; // Live2DModel instance
  smoothness?: number; // 0.1 比较敏感，0.05 比较平滑
  eyeTrackingScale?: number;  // 眼睛跟踪灵敏度，默认 0.8
  headTrackingScale?: number; // 头部跟踪灵敏度，默认 0.4
}

export interface MousePosition {
  x: number;
  y: number;
}

export class MouseTracker {
  private config: Required<MouseTrackerConfig>;
  private isTracking: boolean = false;
  private currentMousePos: MousePosition = { x: 0, y: 0 };
  private targetMousePos: MousePosition = { x: 0, y: 0 };
  private animationFrameId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  // 平滑插值用的当前值
  private currentEyeX: number = 0;
  private currentEyeY: number = 0;
  private currentHeadX: number = 0;
  private currentHeadY: number = 0;

  constructor(config: MouseTrackerConfig) {
    this.config = {
      smoothness: config.smoothness ?? 0.08,
      eyeTrackingScale: config.eyeTrackingScale ?? 0.8,
      headTrackingScale: config.headTrackingScale ?? 0.4,
      canvasElement: config.canvasElement,
      model: config.model,
    };
  }

  /**
   * 启动鼠标跟踪
   */
  startTracking(): void {
    if (this.isTracking) return;

    this.isTracking = true;
    this.setupEventListeners();
    this.startAnimationLoop();
    this.setupResizeObserver();
  }

  /**
   * 停止鼠标跟踪
   */
  stopTracking(): void {
    if (!this.isTracking) return;

    this.isTracking = false;
    this.removeEventListeners();
    this.stopAnimationLoop();
    this.cleanupResizeObserver();

    // 重置模型参数到初始状态
    this.resetModelParameters();
  }

  /**
   * 手动更新跟踪（用于外部调用）
   */
  update(): void {
    if (!this.isTracking) return;
    this.updateModelParameters();
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    const canvas = this.config.canvasElement;
    
    canvas.addEventListener('mousemove', this.handleMouseMove);
    canvas.addEventListener('mouseleave', this.handleMouseLeave);
    canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.handleTouchEnd);
    window.addEventListener('resize', this.handleResize);
  }

  /**
   * 移除事件监听器
   */
  private removeEventListeners(): void {
    const canvas = this.config.canvasElement;
    
    canvas.removeEventListener('mousemove', this.handleMouseMove);
    canvas.removeEventListener('mouseleave', this.handleMouseLeave);
    canvas.removeEventListener('touchmove', this.handleTouchMove);
    canvas.removeEventListener('touchend', this.handleTouchEnd);
    window.removeEventListener('resize', this.handleResize);
  }

  /**
   * 处理鼠标移动
   */
  private handleMouseMove = (event: MouseEvent): void => {
    const rect = this.config.canvasElement.getBoundingClientRect();
    this.targetMousePos = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  /**
   * 处理鼠标离开
   */
  private handleMouseLeave = (): void => {
    // 鼠标离开时回到中心位置
    this.targetMousePos = {
      x: this.config.canvasElement.width / 2,
      y: this.config.canvasElement.height / 2,
    };
  };

  /**
   * 处理触摸移动
   */
  private handleTouchMove = (event: TouchEvent): void => {
    event.preventDefault();
    const touch = event.touches[0];
    if (!touch) return;

    const rect = this.config.canvasElement.getBoundingClientRect();
    this.targetMousePos = {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    };
  };

  /**
   * 处理触摸结束
   */
  private handleTouchEnd = (event: TouchEvent): void => {
    event.preventDefault();
    // 触摸结束时回到中心位置
    this.targetMousePos = {
      x: this.config.canvasElement.width / 2,
      y: this.config.canvasElement.height / 2,
    };
  };

  /**
   * 处理窗口大小变化
   */
  private handleResize = (): void => {
    // 延迟处理以确保尺寸更新完成
    setTimeout(() => {
      this.handleMouseLeave();
    }, 100);
  };

  /**
   * 设置 ResizeObserver
   */
  private setupResizeObserver(): void {
    if (typeof ResizeObserver === 'undefined') return;
    
    this.resizeObserver = new ResizeObserver(() => {
      this.handleResize();
    });
    
    this.resizeObserver.observe(this.config.canvasElement);
  }

  /**
   * 清理 ResizeObserver
   */
  private cleanupResizeObserver(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  /**
   * 启动动画循环
   */
  private startAnimationLoop(): void {
    const animate = () => {
      if (!this.isTracking) return;
      
      this.updateModelParameters();
      this.animationFrameId = requestAnimationFrame(animate);
    };
    
    this.animationFrameId = requestAnimationFrame(animate);
  }

  /**
   * 停止动画循环
   */
  private stopAnimationLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * 更新模型参数
   */
  private updateModelParameters(): void {
    const model = this.config.model;
    if (!model) return;

    // 使用平滑插值更新当前鼠标位置
    this.currentMousePos.x = this.lerp(this.currentMousePos.x, this.targetMousePos.x, this.config.smoothness);
    this.currentMousePos.y = this.lerp(this.currentMousePos.y, this.targetMousePos.y, this.config.smoothness);

    // 将鼠标位置归一化到 [-1, 1] 范围
    const normalizedPos = this.normalizeMousePosition(this.currentMousePos);
    
    // 计算眼睛和头部的目标值
    const targetEyeX = normalizedPos.x * this.config.eyeTrackingScale;
    const targetEyeY = -normalizedPos.y * this.config.eyeTrackingScale; // Y轴翻转
    const targetHeadX = normalizedPos.x * this.config.headTrackingScale;
    const targetHeadY = -normalizedPos.y * this.config.headTrackingScale; // Y轴翻转

    // 平滑插值到目标值
    this.currentEyeX = this.lerp(this.currentEyeX, targetEyeX, this.config.smoothness);
    this.currentEyeY = this.lerp(this.currentEyeY, targetEyeY, this.config.smoothness);
    this.currentHeadX = this.lerp(this.currentHeadX, targetHeadX, this.config.smoothness);
    this.currentHeadY = this.lerp(this.currentHeadY, targetHeadY, this.config.smoothness);

    try {
      // 更新眼睛参数
      model.addParameterValue?.('ParamEyeLeftX', this.currentEyeX);
      model.addParameterValue?.('ParamEyeLeftY', this.currentEyeY);
      model.addParameterValue?.('ParamEyeRightX', this.currentEyeX);
      model.addParameterValue?.('ParamEyeRightY', this.currentEyeY);

      // 更新头部参数
      model.addParameterValue?.('ParamHeadX', this.currentHeadX);
      model.addParameterValue?.('ParamHeadY', this.currentHeadY);

      // 备用参数名（兼容不同的模型）
      model.addParameterValue?.('PARAM_EYE_L_X', this.currentEyeX);
      model.addParameterValue?.('PARAM_EYE_L_Y', this.currentEyeY);
      model.addParameterValue?.('PARAM_EYE_R_X', this.currentEyeX);
      model.addParameterValue?.('PARAM_EYE_R_Y', this.currentEyeY);
      model.addParameterValue?.('PARAM_HEAD_X', this.currentHeadX);
      model.addParameterValue?.('PARAM_HEAD_Y', this.currentHeadY);
    } catch (error) {
      console.warn('Failed to update model parameters:', error);
    }
  }

  /**
   * 重置模型参数到初始状态
   */
  private resetModelParameters(): void {
    const model = this.config.model;
    if (!model) return;

    try {
      // 将所有参数重置为0
      model.addParameterValue?.('ParamEyeLeftX', 0);
      model.addParameterValue?.('ParamEyeLeftY', 0);
      model.addParameterValue?.('ParamEyeRightX', 0);
      model.addParameterValue?.('ParamEyeRightY', 0);
      model.addParameterValue?.('ParamHeadX', 0);
      model.addParameterValue?.('ParamHeadY', 0);

      // 备用参数名
      model.addParameterValue?.('PARAM_EYE_L_X', 0);
      model.addParameterValue?.('PARAM_EYE_L_Y', 0);
      model.addParameterValue?.('PARAM_EYE_R_X', 0);
      model.addParameterValue?.('PARAM_EYE_R_Y', 0);
      model.addParameterValue?.('PARAM_HEAD_X', 0);
      model.addParameterValue?.('PARAM_HEAD_Y', 0);
    } catch (error) {
      console.warn('Failed to reset model parameters:', error);
    }

    // 重置内部状态
    this.currentEyeX = 0;
    this.currentEyeY = 0;
    this.currentHeadX = 0;
    this.currentHeadY = 0;
    this.currentMousePos = { x: 0, y: 0 };
    this.targetMousePos = { x: 0, y: 0 };
  }

  /**
   * 将鼠标位置归一化到 [-1, 1] 范围
   */
  private normalizeMousePosition(mousePos: MousePosition): { x: number; y: number } {
    const canvas = this.config.canvasElement;
    const width = canvas.width;
    const height = canvas.height;

    // 计算相对于中心的位置
    const centerX = width / 2;
    const centerY = height / 2;

    // 归一化到 [-1, 1] 范围
    const normalizedX = ((mousePos.x - centerX) / centerX);
    const normalizedY = ((mousePos.y - centerY) / centerY);

    // 限制最大值/最小值
    const clampedX = Math.max(-1, Math.min(1, normalizedX));
    const clampedY = Math.max(-1, Math.min(1, normalizedY));

    return { x: clampedX, y: clampedY };
  }

  /**
   * 线性插值（Lerp）
   */
  private lerp(start: number, end: number, factor: number): number {
    return start + (end - start) * factor;
  }

  /**
   * 检查是否正在跟踪
   */
  public get isActive(): boolean {
    return this.isTracking;
  }

  /**
   * 动态更新配置
   */
  public updateConfig(updates: Partial<MouseTrackerConfig>): void {
    Object.assign(this.config, updates);
  }
}

/**
 * 创建鼠标跟踪器实例的工厂函数
 */
export function createMouseTracker(config: MouseTrackerConfig): MouseTracker {
  return new MouseTracker(config);
}

export default MouseTracker;