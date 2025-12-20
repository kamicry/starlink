import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import { ActionManager } from '../lib/live2d/ActionManager';
import { ActionState } from '../lib/live2d/ActionManager';

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
  playRandomActionFromGroup: (groupName: string) => void;
  queueAction: (actionName: string) => void;
  stopAction: () => void;
  getActionState: () => ActionState | null;
  dispose: () => void;
};

export type Live2DViewerProps = {
  modelPath: string;
  onAction?: (actionName: string) => void;
  onLoadStart?: (path: string) => void;
  onLoadProgress?: (progress: Live2DLoadProgress) => void;
  onLoadComplete?: (path: string) => void;
  onLoadError?: (path: string, error: Error) => void;
  onMouseMove?: (mouseX: number, mouseY: number) => void;
  onMouseClick?: (mouseX: number, mouseY: number, hitTest: boolean) => void;
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
      onMouseMove,
      onMouseClick,
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

    const initPromiseRef = useRef<Promise<void> | null>(null);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    const loadTokenRef = useRef(0);
    const disposedRef = useRef(false);

    // 动作管理器
    const actionManagerRef = useRef<ActionManager | null>(null);
    const mousePositionRef = useRef({ x: 0, y: 0 });
    const lastMouseMoveTimeRef = useRef(0);
    const lookAtTargetRef = useRef({ x: 0, y: 0 });

    const [isClickFlashing, setIsClickFlashing] = useState(false);
    const [isLookingAtMouse, setIsLookingAtMouse] = useState(true);

    // 初始化动作管理器
    useEffect(() => {
      actionManagerRef.current = new ActionManager({
        autoPlayIdle: true,
        idleInterval: 8000,
        maxQueueSize: 5,
        actionTimeout: 8000,
      });

      actionManagerRef.current.setCallbacks({
        onActionStart: (actionName, state) => {
          console.log('Action started:', actionName, state);
        },
        onActionComplete: (actionName, state) => {
          console.log('Action completed:', actionName, state);
        },
        onError: (error) => {
          console.error('Action manager error:', error);
        }
      });

      return () => {
        actionManagerRef.current?.dispose();
      };
    }, []);

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

    // 鼠标移动跟踪和注视功能
    const updateMouseLookAt = useCallback((mouseX: number, mouseY: number) => {
      const model = modelRef.current;
      if (!model || !isLookingAtMouse) return;

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // 计算相对鼠标位置 (-1 到 1)
      const relativeX = (mouseX - centerX) / (rect.width / 2);
      const relativeY = (mouseY - centerY) / (rect.height / 2);

      // 限制范围
      const clampedX = Math.max(-1, Math.min(1, relativeX));
      const clampedY = Math.max(-1, Math.min(1, relativeY));

      // 设置注视目标
      lookAtTargetRef.current = { x: clampedX, y: clampedY };

      try {
        // Live2D 模型的眼睛和头部注视
        if (model.lookAt) {
          model.lookAt(clampedX * 0.5, clampedY * 0.3); // 减弱强度
        }
      } catch (error) {
        console.warn('Failed to update mouse look at:', error);
      }
    }, [isLookingAtMouse]);

    // 鼠标事件处理
    const handleMouseMove = useCallback((event: MouseEvent) => {
      const now = Date.now();
      
      // 限制更新频率，避免过于频繁
      if (now - lastMouseMoveTimeRef.current < 50) return;
      
      lastMouseMoveTimeRef.current = now;
      
      mousePositionRef.current = { x: event.clientX, y: event.clientY };
      updateMouseLookAt(event.clientX, event.clientY);
      onMouseMove?.(event.clientX, event.clientY);
    }, [updateMouseLookAt, onMouseMove]);

    // 点击检测和动作触发
    const handleMouseClick = useCallback((event: MouseEvent) => {
      const model = modelRef.current;
      const app = appRef.current;
      if (!model || !app) return;

      const view = app.view as HTMLCanvasElement;
      const rect = view.getBoundingClientRect();
      
      // 计算点击位置是否在模型边界内
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;
      
      let hitTest = false;
      
      try {
        // 检查是否点击在模型上
        if (model.hitTest) {
          hitTest = model.hitTest(clickX, clickY);
        } else {
          // 备用方法：简单的边界检查
          const modelBounds = model.getBounds();
          hitTest = clickX >= modelBounds.x && 
                   clickX <= modelBounds.x + modelBounds.width &&
                   clickY >= modelBounds.y && 
                   clickY <= modelBounds.y + modelBounds.height;
        }
      } catch (error) {
        console.warn('Hit test failed:', error);
        hitTest = true; // 如果检测失败，默认触发动作
      }

      // 触发点击反馈
      if (hitTest) {
        flashClick();
        
        // 使用动作管理器播放随机动作
        actionManagerRef.current?.playRandomAction();
      }

      onMouseClick?.(event.clientX, event.clientY, hitTest);
    }, [onMouseClick]);

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

    const getAvailableMotionGroups = useCallback((): string[] => {
      const model = modelRef.current;
      if (!model) return [];

      const fromSettings = model.internalModel?.settings?.motions;
      if (fromSettings && typeof fromSettings === 'object') {
        const keys = Object.keys(fromSettings);
        if (keys.length > 0) return keys;
      }

      const fromMotionManager = model.internalModel?.motionManager?.motionGroups;
      if (fromMotionManager && typeof fromMotionManager === 'object') {
        const keys = Object.keys(fromMotionManager);
        if (keys.length > 0) return keys;
      }

      return ['Idle', 'TapBody', 'TapHead'];
    }, []);

    const playRandomAction = useCallback(() => {
      const groups = getAvailableMotionGroups();
      if (groups.length === 0) return;

      const actionName = groups[Math.floor(Math.random() * groups.length)];
      playAction(actionName);
    }, [getAvailableMotionGroups, playAction]);

    const flashClick = useCallback(() => {
      setIsClickFlashing(true);
      window.setTimeout(() => setIsClickFlashing(false), CLICK_FLASH_MS);
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
          app.stage.addChild(model);

          model.interactive = true;
          model.buttonMode = true;
          model.cursor = 'pointer';

          // 设置模型引用到动作管理器
          actionManagerRef.current?.setModel(model);

          tickerFnRef.current = () => {
            model.update?.(app.ticker.deltaMS);
          };
          app.ticker.add(tickerFnRef.current);

          fitModelToView();

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
        onLoadComplete,
        onLoadError,
        onLoadProgress,
        onLoadStart,
        playRandomAction,
      ]
    );

    const dispose = useCallback(() => {
      disposedRef.current = true;

      // 移除鼠标事件监听
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('click', handleMouseClick);

      const app = appRef.current;
      if (app) {
        try {
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

      // 清理动作管理器
      actionManagerRef.current?.dispose();
    }, [destroyCurrentModel, handleMouseMove, handleMouseClick]);

    // 设置事件监听
    useEffect(() => {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('click', handleMouseClick);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('click', handleMouseClick);
      };
    }, [handleMouseMove, handleMouseClick]);

    useImperativeHandle(
      ref,
      () => ({
        loadModel,
        playAction,
        playRandomAction,
        playRandomActionFromGroup: (groupName: string) => {
          actionManagerRef.current?.playRandomActionFromGroup(groupName);
        },
        queueAction: (actionName: string) => {
          actionManagerRef.current?.playAction(actionName);
        },
        stopAction: () => {
          actionManagerRef.current?.stopAction();
        },
        getActionState: () => {
          return actionManagerRef.current?.getState() || null;
        },
        dispose,
      }),
      [dispose, loadModel, playAction, playRandomAction, handleMouseMove, handleMouseClick]
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
        
        {/* 鼠标跟踪状态指示器 */}
        {isLookingAtMouse && (
          <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
            👁️ 注视中
          </div>
        )}
      </div>
    );
  }
);

export default Live2DViewer;