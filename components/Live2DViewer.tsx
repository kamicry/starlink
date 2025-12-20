import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import { ActionManager, ActionInfo } from '../lib/live2d/ActionManager';
import { defaultActionConfig, applyActionConfig } from '../lib/live2d/actions';

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
  playRandomAction: (groupName?: string) => void;
  playRandomActionFromGroup: (groupName: string) => void;
  queueAction: (actionName: string, groupName?: string) => void;
  stopAction: () => void;
  dispose: () => void;
  getActionStats: () => {
    isPlaying: boolean;
    currentAction?: { name: string; group: string };
    queueLength: number;
    availableGroups: string[];
    totalActions: number;
  };
};

export type Live2DViewerProps = {
  modelPath: string;
  onAction?: (actionName: string) => void;
  onLoadStart?: (path: string) => void;
  onLoadProgress?: (progress: Live2DLoadProgress) => void;
  onLoadComplete?: (path: string) => void;
  onLoadError?: (path: string, error: Error) => void;
  actionConfig?: typeof defaultActionConfig;
  enableMouseTracking?: boolean;
  trackHeadMovement?: boolean;
  trackEyeMovement?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

type PixiApp = any;

type Live2DModelInstance = any;

const CLICK_FLASH_MS = 120;
const MOUSE_TRACKING_INTERVAL_MS = 50;
const HEAD_TRACKING_MULTIPLIER = 0.3;
const EYE_TRACKING_MULTIPLIER = 2.0;

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
      actionConfig = defaultActionConfig,
      enableMouseTracking = false,
      trackHeadMovement = true,
      trackEyeMovement = true,
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
    const actionManagerRef = useRef<ActionManager | null>(null);

    const initPromiseRef = useRef<Promise<void> | null>(null);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    const loadTokenRef = useRef(0);
    const disposedRef = useRef(false);

    const [isClickFlashing, setIsClickFlashing] = useState(false);
    const [cursorPosition, setCursorPosition] = useState({ x: 0.5, y: 0.5 });
    const mouseTrackingIntervalRef = useRef<number | null>(null);

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

    // Mouse tracking functions
    const setupMouseTracking = useCallback(() => {
      if (!enableMouseTracking || !containerRef.current) return;

      const container = containerRef.current;
      
      const updateMousePosition = (e: MouseEvent) => {
        const rect = container.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        setCursorPosition({ x, y });

        // Update model focus point for eye/head tracking
        const model = modelRef.current;
        if (model && model.focus && !model.internalModel?.motionManager?.isFinished) {
          model.focus(x, y);
        }
      };

      const handleMouseEnter = () => {
        if (mouseTrackingIntervalRef.current) {
          window.clearInterval(mouseTrackingIntervalRef.current);
        }
        
        mouseTrackingIntervalRef.current = window.setInterval(() => {
          const model = modelRef.current;
          if (model && model.internalModel) {
            // Apply head tracking if enabled
            if (trackHeadMovement && model.internalModel.motionManager) {
              // Model's head will follow mouse cursor
              model.internalModel.motionManager.setParameterValueById(
                'ParamAngleX',
                (cursorPosition.x - 0.5) * 30 * HEAD_TRACKING_MULTIPLIER
              );
              model.internalModel.motionManager.setParameterValueById(
                'ParamAngleY',
                (cursorPosition.y - 0.5) * 30 * HEAD_TRACKING_MULTIPLIER
              );
            }

            // Apply eye tracking if enabled
            if (trackEyeMovement && model.internalModel.motionManager) {
              const eyeX = (cursorPosition.x - 0.5) * 2 * EYE_TRACKING_MULTIPLIER;
              const eyeY = (cursorPosition.y - 0.5) * 2 * EYE_TRACKING_MULTIPLIER;
              
              model.internalModel.motionManager.setParameterValueById(
                'ParamEyeBallX',
                eyeX
              );
              model.internalModel.motionManager.setParameterValueById(
                'ParamEyeBallY',
                eyeY
              );
            }
          }
        }, MOUSE_TRACKING_INTERVAL_MS);
      };

      const handleMouseLeave = () => {
        if (mouseTrackingIntervalRef.current) {
          window.clearInterval(mouseTrackingIntervalRef.current);
          mouseTrackingIntervalRef.current = null;
        }
        
        // Reset to center position
        setCursorPosition({ x: 0.5, y: 0.5 });
        
        const model = modelRef.current;
        if (model && model.internalModel?.motionManager) {
          // Reset head position
          model.internalModel.motionManager.setParameterValueById('ParamAngleX', 0);
          model.internalModel.motionManager.setParameterValueById('ParamAngleY', 0);
          // Reset eye position
          model.internalModel.motionManager.setParameterValueById('ParamEyeBallX', 0);
          model.internalModel.motionManager.setParameterValueById('ParamEyeBallY', 0);
        }
      };

      container.addEventListener('mousemove', updateMousePosition);
      container.addEventListener('mouseenter', handleMouseEnter);
      container.addEventListener('mouseleave', handleMouseLeave);

      return () => {
        container.removeEventListener('mousemove', updateMousePosition);
        container.removeEventListener('mouseenter', handleMouseEnter);
        container.removeEventListener('mouseleave', handleMouseLeave);
      };
    }, [enableMouseTracking, trackHeadMovement, trackEyesMovement, cursorPosition]);

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

          // Setup Action Manager
          const internalModel = model.internalModel;
          const motionManager = internalModel?.motionManager;
          const expressionManager = internalModel?.expressionManager;

          if (motionManager) {
            actionManagerRef.current = new ActionManager(motionManager, expressionManager);

            // Apply action configuration
            const config = applyActionConfig(actionConfig);
            if (actionManagerRef.current) {
              Object.entries(config.groups).forEach(([group, actions]) => {
                actionManagerRef.current!.addActionGroup(group, actions);
              });
            }

            // Setup action callbacks
            actionManagerRef.current.setCallbacks({
              onActionStart: (actionName) => {
                console.log(`[ActionManager] Action started: ${actionName}`);
                onAction?.(actionName);
              },
              onActionComplete: (actionName) => {
                console.log(`[ActionManager] Action completed: ${actionName}`);
                // Resume idle motion if model is idle
                const stats = actionManagerRef.current?.getStats();
                if (stats && stats.queueLength === 0 && !stats.isPlaying) {
                  actionManagerRef.current?.playRandomAction('Idle');
                }
              },
              onActionStop: (actionName) => {
                console.log(`[ActionManager] Action stopped: ${actionName}`);
              },
            });

            // Load available motions from model settings
            if (internalModel?.settings?.motions) {
              Object.entries(internalModel.settings.motions).forEach(([group, motions]) => {
                if (Array.isArray(motions)) {
                  const actions: ActionInfo[] = motions.map((motion: any, index: number) => ({
                    name: motion?.File || `${group}_${index}`,
                    group: group,
                    priority: 'normal',
                    weight: 100,
                    loop: group === 'Idle',
                    duration: motion?.FadeIn ? motion.FadeIn * 1000 : 3000,
                  }));
                  actionManagerRef.current.addActionGroup(group, actions);
                }
              });
            }

            // Setup model event listeners
            model.on?.('motion', (group: string, index: number, actionName: string) => {
              if (actionManagerRef.current) {
                const motionManager = model.internalModel?.motionManager;
                if (motionManager) {
                  motionManager.isFinished = false;
                }
              }
            });

            model.internalModel?.motionManager?.on?.('motionFinish', () => {
              if (model.internalModel?.motionManager) {
                model.internalModel.motionManager.isFinished = true;
                actionManagerRef.current?.onActionComplete();
              }
            });
          }

          // Setup mouse tracking if enabled
          if (enableMouseTracking) {
            setupMouseTracking();
          }

          // Enhanced click interaction with hit testing
          model.on?.('pointertap', (event: any) => {
            flashClick();
            
            // Hit testing for precise click detection
            const hitAreas: string[] = [];
            if (model.hitTest && model.internalModel?.hitAreaFrames) {
              const point = event?.data?.global;
              if (point) {
                // Test common hit areas
                const areas = ['Head', 'Body', 'Face'];
                for (const area of areas) {
                  if (model.hitTest?.(point.x, point.y, area)) {
                    hitAreas.push(area);
                  }
                }
              }
            }

            // Play appropriate action based on hit area
            const actionManager = actionManagerRef.current;
            if (actionManager) {
              if (hitAreas.includes('Head')) {
                actionManager.playRandomAction('TapHead');
              } else if (hitAreas.includes('Body') || hitAreas.length > 0) {
                actionManager.playRandomAction('TapBody');
              } else {
                // Fallback to random action
                actionManager.playRandomAction();
              }
            } else {
              // Fallback for compatibility
              playRandomAction();
            }
          });

          tickerFnRef.current = () => {
            model.update?.(app.ticker.deltaMS);
          };
          app.ticker.add(tickerFnRef.current);

          fitModelToView();

          // Start with idle animation if available
          if (actionManagerRef.current) {
            actionManagerRef.current.playRandomAction('Idle');
          }

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

    const playRandomActionFromGroup = useCallback((groupName: string) => {
      const actionManager = actionManagerRef.current;
      if (actionManager) {
        actionManager.playRandomAction(groupName);
      } else {
        // Fallback to old method
        console.warn('ActionManager not available, falling back to simple random action');
        playRandomAction();
      }
    }, [playRandomAction]);

    const queueAction = useCallback((actionName: string, groupName?: string) => {
      const actionManager = actionManagerRef.current;
      if (actionManager) {
        actionManager.queueAction(actionName, groupName);
      } else {
        // Fallback to direct action
        const model = modelRef.current;
        if (model && actionName) {
          playAction(actionName);
        }
      }
    }, [playAction]);

    const stopAction = useCallback(() => {
      const actionManager = actionManagerRef.current;
      if (actionManager) {
        actionManager.stopCurrentAction();
      }
    }, []);

    const getActionStats = useCallback(() => {
      const actionManager = actionManagerRef.current;
      if (actionManager) {
        return actionManager.getStats();
      }
      return {
        isPlaying: false,
        currentAction: undefined,
        queueLength: 0,
        availableGroups: [],
        totalActions: 0,
      };
    }, []);

    const dispose = useCallback(() => {
      disposedRef.current = true;

      // Clear mouse tracking interval
      if (mouseTrackingIntervalRef.current) {
        window.clearInterval(mouseTrackingIntervalRef.current);
        mouseTrackingIntervalRef.current = null;
      }

      // Clear timers
      const actionManager = actionManagerRef.current;
      if (actionManager) {
        actionManager.destroy();
        actionManagerRef.current = null;
      }

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
    }, [destroyCurrentModel]);

    useImperativeHandle(
      ref,
      () => ({
        loadModel,
        playAction,
        playRandomAction,
        playRandomActionFromGroup,
        queueAction,
        stopAction,
        dispose,
        getActionStats,
      }),
      [
        dispose,
        getActionStats,
        loadModel,
        playAction,
        playRandomAction,
        playRandomActionFromGroup,
        queueAction,
        stopAction,
      ]
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
      </div>
    );
  }
);

export default Live2DViewer;
