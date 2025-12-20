import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import clsx from 'clsx';
import { AlertCircle, Loader2, RefreshCw, Play, Pause, Square, ChevronDown, ChevronRight, Shuffle } from 'lucide-react';
import Live2DViewer, { Live2DLoadProgress, Live2DViewerHandle } from './Live2DViewer';
import { ActionState } from '../lib/live2d/ActionManager';
import { ACTION_GROUPS, ACTION_CONFIGS, getAllActionNames, hasAction } from '../lib/live2d/actions';

export type Live2DModelPanelProps = {
  defaultModelPath?: string;
  className?: string;
};

const FALLBACK_MODEL_PATH = '/live2d/chara/chara.model3.json';

export default function Live2DModelPanel({ defaultModelPath, className }: Live2DModelPanelProps) {
  const viewerRef = useRef<Live2DViewerHandle | null>(null);

  const initialPath = useMemo(() => {
    return (
      defaultModelPath ||
      process.env.NEXT_PUBLIC_LIVE2D_MODEL_PATH ||
      process.env.NEXT_PUBLIC_LIVE2D_DEFAULT_MODEL_PATH ||
      FALLBACK_MODEL_PATH
    );
  }, [defaultModelPath]);

  const [inputPath, setInputPath] = useState(initialPath);
  const [activePath, setActivePath] = useState(initialPath);

  const [loadStatus, setLoadStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadStage, setLoadStage] = useState<string>('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);

  // 动作列表相关状态
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [actionState, setActionState] = useState<ActionState | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['Idle', 'Tap']));
  const [showActionPanel, setShowActionPanel] = useState(true);

  const triggerLoad = useCallback(async () => {
    const path = inputPath.trim();
    if (!path) return;

    if (path !== activePath) {
      setActivePath(path);
      return;
    }

    try {
      await viewerRef.current?.loadModel(path);
    } catch {
      // error state will be updated via onLoadError
    }
  }, [activePath, inputPath]);

  const handleLoadProgress = useCallback((p: Live2DLoadProgress) => {
    setLoadProgress(p.progress);
    setLoadStage(p.stage);
  }, []);

  const handleLoadStart = useCallback(() => {
    setLoadStatus('loading');
    setLoadProgress(0);
    setLoadStage('starting');
    setLoadError(null);
  }, []);

  const handleLoadComplete = useCallback(() => {
    setLoadStatus('loaded');
    setLoadProgress(100);
    setLoadStage('ready');
    setLoadError(null);
  }, []);

  const handleLoadError = useCallback((_path: string, error: Error) => {
    setLoadStatus('error');
    setLoadError(error.message || '模型加载失败');
  }, []);

  const handleAction = useCallback((actionName: string) => {
    setLastAction(actionName);
    window.setTimeout(() => setLastAction(null), 1500);
  }, []);

  // 更新动作状态
  useEffect(() => {
    if (viewerRef.current) {
      const updateActionState = () => {
        const state = viewerRef.current?.getActionState();
        setActionState(state || null);
      };

      // 定期更新动作状态
      const interval = setInterval(updateActionState, 500);
      return () => clearInterval(interval);
    }
  }, []);

  // 初始化可用动作列表
  useEffect(() => {
    const actions = getAllActionNames().filter(actionName => hasAction(actionName));
    setAvailableActions(actions);
  }, []);

  // 执行指定动作
  const executeAction = useCallback((actionName: string) => {
    if (viewerRef.current) {
      viewerRef.current.playAction(actionName);
    }
  }, []);

  // 播放随机动作
  const playRandomAction = useCallback(() => {
    if (viewerRef.current) {
      viewerRef.current.playRandomAction();
    }
  }, []);

  // 从分组播放随机动作
  const playRandomFromGroup = useCallback((groupName: string) => {
    if (viewerRef.current) {
      viewerRef.current.playRandomActionFromGroup(groupName);
    }
  }, []);

  // 停止当前动作
  const stopAction = useCallback(() => {
    if (viewerRef.current) {
      viewerRef.current.stopAction();
    }
  }, []);

  // 切换分组展开状态
  const toggleGroupExpansion = useCallback((groupName: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupName)) {
      newExpanded.delete(groupName);
    } else {
      newExpanded.add(groupName);
    }
    setExpandedGroups(newExpanded);
  }, [expandedGroups]);

  return (
    <div
      className={clsx(
        'relative h-full w-full overflow-hidden rounded-xl border border-gray-200 bg-gradient-to-b from-gray-100 to-gray-50',
        className
      )}
    >
      <Live2DViewer
        ref={viewerRef}
        modelPath={activePath}
        onLoadStart={handleLoadStart}
        onLoadProgress={handleLoadProgress}
        onLoadComplete={handleLoadComplete}
        onLoadError={handleLoadError}
        onAction={handleAction}
      />

      <div className="absolute left-3 right-3 top-3 flex flex-col gap-2 md:flex-row md:items-center">
        <input
          value={inputPath}
          onChange={(e) => setInputPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') triggerLoad();
          }}
          className="w-full flex-1 rounded-lg border border-gray-300 bg-white/90 px-3 py-2 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="/live2d/.../model3.json"
        />
        <button
          onClick={triggerLoad}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
        >
          <RefreshCw size={16} />
          重新加载
        </button>
      </div>

      {(loadStatus === 'loading' || loadStatus === 'error') && (
        <div className="absolute inset-x-3 bottom-[200px] rounded-lg border border-gray-200 bg-white/90 p-3 shadow-sm">
          {loadStatus === 'loading' && (
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Loader2 size={16} className="animate-spin" />
              <span className="flex-1">
                加载中 {loadProgress}%
                {loadStage ? ` · ${loadStage}` : ''}
              </span>
            </div>
          )}

          {loadStatus === 'error' && (
            <div className="flex items-start gap-2 text-sm text-red-600">
              <AlertCircle size={16} className="mt-0.5" />
              <div className="flex-1">
                <div className="font-medium">加载失败</div>
                <div className="break-all text-xs text-red-600/90">{loadError}</div>
              </div>
            </div>
          )}

          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className={clsx('h-full transition-all', loadStatus === 'error' ? 'bg-red-500' : 'bg-blue-600')}
              style={{ width: `${loadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* 动作控制面板 */}
      <div className="absolute bottom-3 left-3 right-3">
        <div className="bg-white/95 backdrop-blur-sm rounded-xl border border-gray-200 shadow-lg p-3">
          {/* 控制按钮区域 */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={playRandomAction}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 transition-colors"
              >
                <Shuffle size={12} />
                随机动作
              </button>
              <button
                onClick={stopAction}
                disabled={!actionState?.isPlaying}
                className={clsx(
                  "inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
                  actionState?.isPlaying 
                    ? "bg-red-600 text-white hover:bg-red-700" 
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                )}
              >
                <Square size={12} />
                停止
              </button>
            </div>
            
            <button
              onClick={() => setShowActionPanel(!showActionPanel)}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
            >
              动作列表
              {showActionPanel ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          </div>

          {/* 动作状态显示 */}
          {actionState && (
            <div className="flex items-center gap-4 mb-3 text-xs text-gray-600">
              <span>
                状态: {actionState.isPlaying ? '播放中' : '待机'}
              </span>
              {actionState.currentAction && (
                <span>
                  当前: {actionState.currentAction}
                </span>
              )}
              <span>
                队列: {actionState.queueSize}
              </span>
            </div>
          )}

          {/* 动作列表 */}
          {showActionPanel && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {ACTION_GROUPS.map((group) => {
                const isExpanded = expandedGroups.has(group.name);
                const groupActions = group.actions.filter(action => availableActions.includes(action));
                
                if (groupActions.length === 0) return null;

                return (
                  <div key={group.name} className="border border-gray-100 rounded-lg">
                    <button
                      onClick={() => toggleGroupExpansion(group.name)}
                      className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 rounded-lg transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span className="text-sm font-medium text-gray-700">{group.name}</span>
                        <span className="text-xs text-gray-500">({groupActions.length})</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          playRandomFromGroup(group.name);
                        }}
                        className="text-xs px-2 py-1 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 transition-colors"
                      >
                        随机
                      </button>
                    </button>
                    
                    {isExpanded && (
                      <div className="px-3 pb-3">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {groupActions.map((actionName) => {
                            const config = ACTION_CONFIGS[actionName];
                            const isCurrentAction = actionState?.currentAction === actionName;
                            
                            return (
                              <button
                                key={actionName}
                                onClick={() => executeAction(actionName)}
                                disabled={actionState?.isPlaying && isCurrentAction}
                                className={clsx(
                                  "text-xs px-2 py-1.5 rounded border text-left transition-colors",
                                  isCurrentAction
                                    ? "bg-green-100 border-green-300 text-green-700"
                                    : "bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300"
                                )}
                                title={config?.description || actionName}
                              >
                                <div className="font-medium">{actionName}</div>
                                {config?.description && (
                                  <div className="text-xs text-gray-500 truncate">
                                    {config.description}
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 状态指示器 */}
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/50 px-2 py-1 text-xs text-white">
        点击模型触发动作{lastAction ? ` · ${lastAction}` : ''}
      </div>
    </div>
  );
}
