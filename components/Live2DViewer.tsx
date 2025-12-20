import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import { parseModelConfig, Live2DModelConfig } from '../lib/live2d/model-parser';
import { loadEmotionMapping, EmotionMapping, getExpressionForEmotion, getMotionForEmotion } from '../lib/live2d/emotion-mapping';
import { MouseTracker } from '../lib/live2d/mouse-tracker';
import { MotionManager } from '../lib/live2d/motion-manager';

export type Live2DLoadStage =
  | 'starting'
  | 'pixi'
  | 'cubismCore'
  | 'runtime'
  | 'settings'
  | 'moc'
  | 'pose'
  | 'physics'
  | 'textures'
  | 'ready';

export type Live2DLoadProgress = {
  path: string;
  progress: number; // 0-100
  stage: Live2DLoadStage;
};

export type Live2DViewerHandle = {
  loadModel: (path: string) => Promise<void>;
  playAction: (actionName: string) => void;
  playRandomAction: () => void;
  playExpression: (expressionName: string) => void;
  setEmotion: (emotion: string) => void;
  getModelConfig: () => Live2DModelConfig | null;
  getEmotionMapping: () => EmotionMapping | null;
  dispose: () => void;
  startMouseTracking: () => void;
  stopMouseTracking: () => void;
};

export type Live2DViewerProps = {
  modelPath: string;
  onAction?: (actionName: string) => void;
  onLoadStart?: (path: string) => void;
  onLoadProgress?: (progress: Live2DLoadProgress) => void;
  onLoadComplete?: (path: string) => void;
  onLoadError?: (path: string, error: Error) => void;
  className?: string;
  style?: React.CSSProperties;
};

type PixiApp = any;
type Live2DModelInstance = any;

const CLICK_FLASH_MS = 120;

function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(typeof err === 'string' ? err : 'Unknown error');
}

export const Live2DViewer = forwardRef<Live2DViewerHandle, Live2DViewerProps>(
  function Live2DViewer(
    {
      modelPath,
      onAction,
      onLoadStart,
      onLoadProgress,
      onLoadComplete,
      onLoadError,
      className,
      style,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const appRef = useRef<PixiApp | null>(null);
    const pixiRef = useRef<any>(null);
    const modelRef = useRef<Live2DModelInstance | null>(null);
    const tickerFnRef = useRef<((delta: number) => void) | null>(null);
    const mouseTrackerRef = useRef<MouseTracker | null>(null);
    const motionManagerRef = useRef<MotionManager | null>(null);

    const initPromiseRef = useRef<Promise<void> | null>(null);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    const loadTokenRef = useRef(0);
    const disposedRef = useRef(false);

    const [isClickFlashing, setIsClickFlashing] = useState(false);
    const [modelConfig, setModelConfig] = useState<Live2DModelConfig | null>(null);
    const [emotionMapping, setEmotionMapping] = useState<EmotionMapping | null>(null);
    const [configError, setConfigError] = useState<string | null>(null);
    const [clickCounter, setClickCounter] = useState(0);

    const fitModelToView = useCallback(() => {
      const container = containerRef.current;
      const app = appRef.current;
      const model = modelRef.current;
      if (!container || !app || !model) return;

      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);

      if (app.renderer?.width !== width || app.renderer?.height !== height) {
        app.renderer.resize(width, height);
      }

      const padding = 24;

      const bounds =
        model.getLocalBounds?.() ?? { x: 0, y: 0, width: model.width, height: model.height };
      const contentWidth = Math.max(1, bounds.width);
      const contentHeight = Math.max(1, bounds.height);

      const scale = Math.min(
        (width - padding * 2) / contentWidth,
        (height - padding * 2) / contentHeight
      );

      if (Number.isFinite(scale) && scale > 0) {
        model.scale?.set?.(scale, scale);
      }

      model.pivot?.set?.(bounds.x + bounds.width / 2, bounds.y + bounds.height);
      model.position?.set?.(width / 2, height - padding);
    }, []);

    const destroyCurrentModel = useCallback(() => {
      const app = appRef.current;
      const model = modelRef.current;
      if (!app || !model) return;

      try {
        if (tickerFnRef.current) {
          app.ticker.remove(tickerFnRef.current);
          tickerFnRef.current = null;
        }

        model.removeAllListeners?.();
        app.stage.removeChild(model);
        model.destroy?.({ children: true, texture: true, baseTexture: true });
      } catch {
        // ignore
      } finally {
        modelRef.current = null;
        if (motionManagerRef.current) {
          motionManagerRef.current.dispose();
          motionManagerRef.current = null;
        }
      }
    }, []);

    const ensurePixiApp = useCallback(async () => {
      if (disposedRef.current) return;
      if (appRef.current) return;
      if (!containerRef.current) return;

      if (initPromiseRef.current) {
        await initPromiseRef.current;
        return;
      }

      initPromiseRef.current = (async () => {
        const PIXI = await import('pixi.js');
        pixiRef.current = PIXI;

        const container = containerRef.current;
        if (!container) return;

        const app = new PIXI.Application({
          width: Math.max(1, container.clientWidth),
          height: Math.max(1, container.clientHeight),
          autoDensity: true,
          antialias: true,
          backgroundAlpha: 0,
          resolution: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
        });

        appRef.current = app;

        const view: HTMLCanvasElement = app.view;
        view.style.width = '100%';
        view.style.height = '100%';
        view.style.display = 'block';

        container.appendChild(view);

        resizeObserverRef.current = new ResizeObserver(() => {
          fitModelToView();
        });
        resizeObserverRef.current.observe(container);
      })();

      await initPromiseRef.current;
    }, [fitModelToView]);

    const ensureCubismCore = useCallback(async () => {
      if (typeof window === 'undefined') return;
      if ((window as any).Live2DCubismCore) return;

      const w = window as any;
      if (w.__live2dCubismCoreLoadingPromise) {
        await w.__live2dCubismCoreLoadingPromise;
        return;
      }

      const src =
        process.env.NEXT_PUBLIC_LIVE2D_CUBISM_CORE_URL ||
        'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js';

      w.__live2dCubismCoreLoadingPromise = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.dataset.live2dCubismCore = 'true';

        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load Cubism Core: ${src}`));

        document.head.appendChild(script);
      });

      await w.__live2dCubismCoreLoadingPromise;
    }, []);

    // 启动鼠标跟踪
    const startMouseTracking = useCallback(() => {
      const model = modelRef.current;
      const app = appRef.current;
      
      if (!model || !app) {
        console.warn('Cannot start mouse tracking: model or app not available');
        return;
      }

      const canvas = app.view as HTMLCanvasElement;
      if (!canvas) {
        console.warn('Cannot start mouse tracking: canvas not available');
        return;
      }

      // 停止现有的跟踪器
      if (mouseTrackerRef.current) {
        mouseTrackerRef.current.stopTracking();
        mouseTrackerRef.current = null;
      }

      try {
        // 创建新的跟踪器
        const tracker = new MouseTracker({
          canvasElement: canvas,
          model: model,
          smoothness: 0.08,
          eyeTrackingScale: 0.8,
          headTrackingScale: 0.4,
        });

        mouseTrackerRef.current = tracker;
        tracker.startTracking();
        console.log('🖱️ Mouse tracking started');
      } catch (error) {
        console.error('Failed to start mouse tracking:', error);
      }
    }, []);

    // 停止鼠标跟踪
    const stopMouseTracking = useCallback(() => {
      if (mouseTrackerRef.current) {
        mouseTrackerRef.current.stopTracking();
        mouseTrackerRef.current = null;
        console.log('🛑 Mouse tracking stopped');
      }
    }, []);

    const playAction = useCallback(
      (actionName: string) => {
        const model = modelRef.current;
        if (!model) return;

        try {
          onAction?.(actionName);

          if (typeof model.motion === 'function') {
            model.motion(actionName);
            return;
          }

          const internal = model.internalModel;
          const motionManager = internal?.motionManager;
          if (motionManager?.startMotion) {
            motionManager.startMotion(actionName, 0);
          }
        } catch (error) {
          console.error('Failed to play Live2D action:', actionName, error);
        }
      },
      [onAction]
    );

    // 播放表情
    const playExpression = useCallback(
      (expressionName: string) => {
        const model = modelRef.current;
        if (!model || !emotionMapping) return;

        try {
          // 检查表情是否存在
          if (!emotionMapping.expressions[expressionName]) {
            console.warn(`Expression not found: ${expressionName}`);
            return;
          }

          // 使用 Live2D 模型的表情功能
          if (typeof model.setExpression === 'function') {
            model.setExpression(expressionName);
          } else if (model.internalModel?.expressionManager?.setExpression) {
            model.internalModel.expressionManager.setExpression(expressionName);
          } else {
            console.warn('Expression functionality not available in this model');
          }

          console.log(`🎭 Playing expression: ${expressionName}`);
        } catch (error) {
          console.error('Failed to play Live2D expression:', expressionName, error);
        }
      },
      [emotionMapping]
    );

    // 设置情绪（自动映射到表情和动作）
    const setEmotion = useCallback(
      (emotion: string) => {
        if (!emotionMapping) return;

        const normalizedEmotion = emotion.toLowerCase().trim();

        // 获取对应的表情和动作
        const expression = getExpressionForEmotion(emotionMapping, normalizedEmotion);
        const motion = getMotionForEmotion(emotionMapping, normalizedEmotion);

        // 播放表情
        if (expression && emotionMapping.expressions[expression]) {
          playExpression(expression);
        }

        // 播放动作（如果有对应的动作）
        if (motion && emotionMapping.motions[motion] !== undefined) {
          playAction(motion);
        }

        console.log(`😊 Emotion set: ${normalizedEmotion} -> expression: ${expression}, motion: ${motion}`);
      },
      [emotionMapping, playExpression, playAction]
    );

    const getAvailableMotionGroups = useCallback((): string[] => {
      const model = motionManagerRef.current;
      if (model) {
        return motionManagerRef.current!.getMotionGroups();
      }
      
      const modelFallback = modelRef.current;
      if (!modelFallback) return [];

      const fromSettings = modelFallback.internalModel?.settings?.motions;
      if (fromSettings && typeof fromSettings === 'object') {
        const keys = Object.keys(fromSettings);
        if (keys.length > 0) return keys;
      }

      const fromMotionManager = modelFallback.internalModel?.motionManager?.motionGroups;
      if (fromMotionManager && typeof fromMotionManager === 'object') {
        const keys = Object.keys(fromMotionManager);
        if (keys.length > 0) return keys;
      }

      return ['Idle', 'TapBody', 'TapHead'];
    }, []);

    const flashClick = useCallback(() => {
      setIsClickFlashing(true);
      window.setTimeout(() => setIsClickFlashing(false), CLICK_FLASH_MS);
    }, []);

    const playRandomAction = useCallback(async () => {
      // 使用 MotionManager 播放随机动作
      if (motionManagerRef.current) {
        await motionManagerRef.current.playRandomMotion();
      } else {
        // 回退到简单逻辑
        const groups = getAvailableMotionGroups();
        if (groups.length === 0) return;
        
        const actionName = groups[Math.floor(Math.random() * groups.length)];
        playAction(actionName);
      }
    }, [getAvailableMotionGroups, playAction]);

    const loadModelConfig = useCallback(async (modelPath: string) => {
      try {
        console.log('🔄 Loading Live2D model configuration...');
        setConfigError(null);
        
        // 解析模型配置
        const config = await parseModelConfig(modelPath);
        setModelConfig(config);
        
        // 加载情绪映射
        const mapping = await loadEmotionMapping(modelPath);
        setEmotionMapping(mapping);
        
        console.log('✅ Model configuration and emotion mapping loaded successfully');
        return true;
      } catch (error) {
        console.error('❌ Failed to load model configuration:', error);
        setConfigError(error instanceof Error ? error.message : 'Unknown error');
        return false;
      }
    }, []);

    const loadModel = useCallback(
      async (path: string) => {
        if (!path) return;

        disposedRef.current = false;
        const token = ++loadTokenRef.current;

        const notifyProgress = (progress: number, stage: Live2DLoadStage) => {
          onLoadProgress?.({
            path,
            progress: Math.max(0, Math.min(100, Math.round(progress))),
            stage,
          });
        };

        try {
          onLoadStart?.(path);
          notifyProgress(0, 'starting');

          // 首先加载模型配置
          const configLoaded = await loadModelConfig(path);
          if (!configLoaded || disposedRef.current || token !== loadTokenRef.current) {
            return;
          }

          await ensurePixiApp();
          if (disposedRef.current || token !== loadTokenRef.current) return;
          notifyProgress(5, 'pixi');

          const app = appRef.current;
          if (!app) return;

          destroyCurrentModel();

          const PIXI = pixiRef.current ?? (await import('pixi.js'));
          pixiRef.current = PIXI;

          if (typeof window !== 'undefined') {
            (window as any).PIXI = PIXI;
          }

          await ensureCubismCore();
          if (disposedRef.current || token !== loadTokenRef.current) return;
          notifyProgress(10, 'cubismCore');

          if (typeof window !== 'undefined' && !(window as any).Live2DCubismCore) {
            throw new Error('Cubism Core is not available on window.Live2DCubismCore');
          }

          const live2d = await import('pixi-live2d-display/cubism4');
          notifyProgress(15, 'runtime');

          const Live2DModel = (live2d as any).Live2DModel ?? (live2d as any).default?.Live2DModel;
          if (!Live2DModel) {
            throw new Error('pixi-live2d-display: Live2DModel export not found');
          }

          let resolveLoaded: (() => void) | null = null;
          let rejectLoaded: ((e: any) => void) | null = null;

          const loadedPromise = new Promise<void>((resolve, reject) => {
            resolveLoaded = resolve;
            rejectLoaded = reject;
          });

          const model = Live2DModel.fromSync(path, {
            autoInteract: false,
            autoUpdate: false,
            onLoad: () => resolveLoaded?.(),
            onError: (e: any) => rejectLoaded?.(e),
          }) as Live2DModelInstance;

          model.once?.('settingsJSONLoaded', () => notifyProgress(25, 'settings'));
          model.once?.('modelLoaded', () => notifyProgress(55, 'moc'));
          model.once?.('poseLoaded', () => notifyProgress(65, 'pose'));
          model.once?.('physicsLoaded', () => notifyProgress(70, 'physics'));
          model.once?.('textureLoaded', () => notifyProgress(95, 'textures'));

          await loadedPromise;

          if (disposedRef.current || token !== loadTokenRef.current) {
            model.destroy?.({ children: true, texture: true, baseTexture: true });
            return;
          }

          modelRef.current = model;
          
          // 创建 MotionManager 实例
          if (modelConfig) {
            motionManagerRef.current = new MotionManager(model, modelConfig);
            console.log('🎬 MotionManager created for model');
          }
          
          // 添加点击事件处理 - 全局点击触发随机动作
          const clickHandler = (event: MouseEvent) => {
            const canvas = app.view as HTMLCanvasElement;
            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            // 更新点击计数器（用于调试）
            setClickCounter(prev => prev + 1);
            
            // 闪光灯效果
            flashClick();
            
            // 触发随机动作
            if (motionManagerRef.current) {
              console.log(`🖱️ Click at (${Math.round(x)}, ${Math.round(y)}) - Playing random motion...`);
              motionManagerRef.current.playRandomMotion().catch(error => {
                console.error('Failed to play motion:', error);
              });
            }
          };
          
          const canvas = app.view as HTMLCanvasElement;
          canvas.addEventListener('click', clickHandler);
          
          // 保存事件监听器引用以便清理
          (canvas as any)._clickHandler = clickHandler;

          app.stage.addChild(model);

          tickerFnRef.current = () => {
            model.update?.(app.ticker.deltaMS);
          };
          app.ticker.add(tickerFnRef.current);

          fitModelToView();

          // 启动鼠标跟踪
          startMouseTracking();

          notifyProgress(100, 'ready');
          onLoadComplete?.(path);
        } catch (err) {
          const error = toError(err);
          onLoadError?.(path, error);
          throw error;
        }
      },
      [
        destroyCurrentModel,
        ensureCubismCore,
        ensurePixiApp,
        fitModelToView,
        flashClick,
        loadModelConfig,
        modelConfig,
        onLoadComplete,
        onLoadError,
        onLoadProgress,
        onLoadStart,
        startMouseTracking,
      ]
    );

    const dispose = useCallback(() => {
      disposedRef.current = true;

      // 停止鼠标跟踪
      stopMouseTracking();
      
      // 清理 MotionManager
      if (motionManagerRef.current) {
        motionManagerRef.current.dispose();
        motionManagerRef.current = null;
      }

      const app = appRef.current;
      if (app) {
        try {
          // 清理点击事件监听器
          const canvas = app.view as HTMLCanvasElement;
          if ((canvas as any)._clickHandler) {
            canvas.removeEventListener('click', (canvas as any)._clickHandler);
            delete (canvas as any)._clickHandler;
          }
          
          destroyCurrentModel();
          resizeObserverRef.current?.disconnect();
          resizeObserverRef.current = null;

          app.destroy(true, { children: true, texture: true, baseTexture: true });
        } catch {
          // ignore
        }
      }

      appRef.current = null;
      pixiRef.current = null;
      initPromiseRef.current = null;
      
      const container = containerRef.current;
      if (container) {
        container.innerHTML = '';
      }
    }, [destroyCurrentModel, stopMouseTracking]);

    useImperativeHandle(
      ref,
      () => ({
        loadModel,
        playAction,
        playRandomAction,
        playExpression,
        setEmotion,
        getModelConfig: () => modelConfig,
        getEmotionMapping: () => emotionMapping,
        dispose,
        startMouseTracking,
        stopMouseTracking,
      }),
      [dispose, loadModel, playAction, playRandomAction, playExpression, setEmotion, modelConfig, emotionMapping, startMouseTracking, stopMouseTracking]
    );

    useEffect(() => {
      disposedRef.current = false;
      return () => {
        dispose();
      };
    }, [dispose]);

    useEffect(() => {
      if (!modelPath) return;

      loadModel(modelPath).catch((error) => {
        console.error('Failed to load Live2D model:', error);
      });
    }, [loadModel, modelPath]);

    // 点击计数器调试信息显示
    useEffect(() => {
      if (clickCounter > 0) {
        console.log(`📊 Click counter: ${clickCounter} clicks detected`);
      }
    }, [clickCounter]);

    return (
      <div
        className={clsx(
          'relative h-full w-full overflow-hidden',
          isClickFlashing && 'ring-2 ring-blue-500 ring-offset-2 ring-offset-transparent',
          className
        )}
        style={style}
      >
        <div ref={containerRef} className="absolute inset-0" />
        
        {/* 调试信息面板 */}
        {process.env.NODE_ENV === 'development' && (
          <div className="absolute top-2 left-2 bg-black/70 text-white p-2 rounded text-xs font-mono z-10 max-w-xs space-y-1">
            {configError && (
              <div className="text-red-400">
                ❌ Error: {configError}
              </div>
            )}
            
            {modelConfig && (
              <>
                <div className="text-green-400 font-semibold">✅ Config</div>
                <div>Motions: {Object.keys(modelConfig.motions).join(', ') || 'None'}</div>
                <div>Expressions: {Object.keys(modelConfig.expressions).join(', ') || 'None'}</div>
                <div>Physics: {modelConfig.hasPhysics ? 'Yes' : 'No'}</div>
              </>
            )}
            
            {motionManagerRef.current && (
              <div className="text-blue-400 font-semibold">🎬 Motion Manager</div>
            )}
            
            <div className="text-yellow-400 font-semibold">🖱️ Click Status</div>
            <div>Clicks: {clickCounter}</div>
            <div>Random Motion: Enabled</div>
          </div>
        )}
      </div>
    );
  }
);

export default Live2DViewer;