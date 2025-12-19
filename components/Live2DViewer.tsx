import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';

export type Live2DViewerHandle = {
  loadModel: (path: string) => Promise<void>;
  playAction: (actionName: string) => void;
  playRandomAction: () => void;
  dispose: () => void;
};

export type Live2DViewerProps = {
  modelPath: string;
  onAction?: (actionName: string) => void;
  className?: string;
  style?: React.CSSProperties;
};

type PixiApp = any;
type Live2DModelInstance = any;

const CLICK_FLASH_MS = 120;

export const Live2DViewer = forwardRef<Live2DViewerHandle, Live2DViewerProps>(
  function Live2DViewer({ modelPath, onAction, className, style }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);

    const appRef = useRef<PixiApp | null>(null);
    const pixiRef = useRef<any>(null);
    const modelRef = useRef<Live2DModelInstance | null>(null);
    const tickerFnRef = useRef<((delta: number) => void) | null>(null);

    const initPromiseRef = useRef<Promise<void> | null>(null);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    const loadTokenRef = useRef(0);
    const disposedRef = useRef(false);

    const [isClickFlashing, setIsClickFlashing] = useState(false);

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

      const bounds = model.getLocalBounds?.() ?? { x: 0, y: 0, width: model.width, height: model.height };
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

    const loadModel = useCallback(
      async (path: string) => {
        if (!path) return;

        disposedRef.current = false;
        const token = ++loadTokenRef.current;

        await ensurePixiApp();
        if (disposedRef.current || token !== loadTokenRef.current) return;

        const app = appRef.current;
        if (!app) return;

        destroyCurrentModel();

        const PIXI = pixiRef.current ?? (await import('pixi.js'));
        pixiRef.current = PIXI;

        if (typeof window !== 'undefined') {
          (window as any).PIXI = PIXI;
        }

        await ensureCubismCore();
        if (typeof window !== 'undefined' && !(window as any).Live2DCubismCore) {
          throw new Error('Cubism Core is not available on window.Live2DCubismCore');
        }

        const live2d = await import('pixi-live2d-display/cubism4');
        const Live2DModel = (live2d as any).Live2DModel ?? (live2d as any).default?.Live2DModel;
        if (!Live2DModel) {
          throw new Error('pixi-live2d-display: Live2DModel export not found');
        }

        const model = (await Live2DModel.from(path, {
          autoInteract: false,
          autoUpdate: false,
        })) as Live2DModelInstance;

        if (disposedRef.current || token !== loadTokenRef.current) {
          model.destroy?.({ children: true, texture: true, baseTexture: true });
          return;
        }

        modelRef.current = model;
        app.stage.addChild(model);

        model.interactive = true;
        model.buttonMode = true;
        model.cursor = 'pointer';

        model.on?.('pointertap', () => {
          flashClick();
          playRandomAction();
        });

        tickerFnRef.current = () => {
          model.update?.(app.ticker.deltaMS);
        };
        app.ticker.add(tickerFnRef.current);

        fitModelToView();
      },
      [destroyCurrentModel, ensurePixiApp, ensureCubismCore, fitModelToView, flashClick, playRandomAction]
    );

    const dispose = useCallback(() => {
      disposedRef.current = true;

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
        dispose,
      }),
      [dispose, loadModel, playAction, playRandomAction]
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
