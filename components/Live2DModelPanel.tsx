import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import clsx from 'clsx';
import { AlertCircle, Loader2, RefreshCw, Heart, Smile, Angry, Frown, Zap } from 'lucide-react';
import Live2DViewer, { Live2DLoadProgress, Live2DViewerHandle } from './Live2DViewer';
import { Live2DModelConfig } from '../lib/live2d/model-parser';
import { EmotionMapping } from '../lib/live2d/emotion-mapping';

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
  const [modelConfig, setModelConfig] = useState<Live2DModelConfig | null>(null);
  const [emotionMapping, setEmotionMapping] = useState<EmotionMapping | null>(null);
  const [currentEmotion, setCurrentEmotion] = useState<string>('neutral');
  const [showDebugInfo, setShowDebugInfo] = useState(false);

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
    
    // 获取模型配置和情绪映射
    if (viewerRef.current) {
      const config = viewerRef.current.getModelConfig();
      const mapping = viewerRef.current.getEmotionMapping();
      
      setModelConfig(config);
      setEmotionMapping(mapping);
    }
  }, []);

  const handleLoadError = useCallback((_path: string, error: Error) => {
    setLoadStatus('error');
    setLoadError(error.message || '模型加载失败');
  }, []);

  const handleAction = useCallback((actionName: string) => {
    setLastAction(actionName);
    window.setTimeout(() => setLastAction(null), 1500);
  }, []);

  // 情绪控制功能
  const handleSetEmotion = useCallback((emotion: string) => {
    if (viewerRef.current) {
      viewerRef.current.setEmotion(emotion);
      setCurrentEmotion(emotion);
      console.log(`🎭 设置情绪: ${emotion}`);
    }
  }, []);

  const handlePlayExpression = useCallback((expression: string) => {
    if (viewerRef.current) {
      viewerRef.current.playExpression(expression);
      console.log(`🎭 播放表情: ${expression}`);
    }
  }, []);

  // 获取情绪图标
  const getEmotionIcon = (emotion: string) => {
    switch (emotion.toLowerCase()) {
      case 'happy':
      case 'joy':
        return <Smile size={16} className="text-yellow-500" />;
      case 'sad':
      case 'sorrow':
        return <Frown size={16} className="text-blue-500" />;
      case 'angry':
      case 'mad':
        return <Angry size={16} className="text-red-500" />;
      case 'excited':
      case 'excited':
        return <Zap size={16} className="text-purple-500" />;
      default:
        return <Heart size={16} className="text-gray-500" />;
    }
  };

  // 获取可用的情绪列表
  const availableEmotions = useMemo(() => {
    if (!emotionMapping) return [];
    return Object.keys(emotionMapping.emotionToExpression);
  }, [emotionMapping]);

  // 获取可用的表情列表
  const availableExpressions = useMemo(() => {
    if (!modelConfig) return [];
    return Object.keys(modelConfig.expressions);
  }, [modelConfig]);

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

      {/* 顶部控制栏 */}
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
        <div className="flex gap-2">
          <button
            onClick={() => setShowDebugInfo(!showDebugInfo)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-700"
          >
            调试
          </button>
          <button
            onClick={triggerLoad}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            <RefreshCw size={16} />
            重新加载
          </button>
        </div>
      </div>

      {/* 情绪控制面板 */}
      {loadStatus === 'loaded' && emotionMapping && (
        <div className="absolute right-3 top-20 bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-lg border border-gray-200 max-w-xs">
          <div className="text-sm font-medium text-gray-800 mb-2">🎭 情绪控制</div>
          
          {/* 快速情绪按钮 */}
          <div className="grid grid-cols-2 gap-1 mb-3">
            {['happy', 'sad', 'angry', 'neutral'].map((emotion) => (
              <button
                key={emotion}
                onClick={() => handleSetEmotion(emotion)}
                className={clsx(
                  'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                  currentEmotion === emotion 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                )}
              >
                {getEmotionIcon(emotion)}
                {emotion}
              </button>
            ))}
          </div>

          {/* 情绪滑块 */}
          <div className="space-y-2">
            <div className="text-xs text-gray-600">当前情绪: {currentEmotion}</div>
            <input
              type="range"
              min="0"
              max="100"
              value={currentEmotion === 'neutral' ? 50 : currentEmotion === 'happy' ? 75 : currentEmotion === 'sad' ? 25 : 90}
              onChange={(e) => {
                const value = parseInt(e.target.value);
                let emotion = 'neutral';
                if (value > 70) emotion = 'happy';
                else if (value < 30) emotion = 'sad';
                else if (value > 90) emotion = 'excited';
                handleSetEmotion(emotion);
              }}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
            />
          </div>
        </div>
      )}

      {(loadStatus === 'loading' || loadStatus === 'error') && (
        <div className="absolute inset-x-3 bottom-3 rounded-lg border border-gray-200 bg-white/90 p-3 shadow-sm">
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

      {/* 调试信息面板 */}
      {showDebugInfo && (
        <div className="absolute left-3 bottom-20 bg-black/80 text-white p-3 rounded-lg text-xs font-mono max-w-sm">
          <div className="flex justify-between items-center mb-2">
            <span className="font-semibold">🔧 调试信息</span>
            <button
              onClick={() => setShowDebugInfo(false)}
              className="text-gray-400 hover:text-white"
            >
              ×
            </button>
          </div>
          
          {modelConfig && (
            <div className="space-y-1 mb-3">
              <div className="text-green-400 font-semibold">✅ 模型配置</div>
              <div>动作组: {Object.keys(modelConfig.motions).join(', ') || '无'}</div>
              <div>表情: {Object.keys(modelConfig.expressions).join(', ') || '无'}</div>
              <div>物理参数: {modelConfig.hasPhysics ? '有' : '无'}</div>
              <div>交互区域: {modelConfig.hitAreas.join(', ') || '无'}</div>
              <div>MOC3: {modelConfig.moc3Path}</div>
              <div>版本: {modelConfig.version}</div>
            </div>
          )}
          
          {emotionMapping && (
            <div className="space-y-1">
              <div className="text-blue-400 font-semibold">🎭 情绪映射</div>
              <div>当前: {currentEmotion}</div>
              <div>映射数: {Object.keys(emotionMapping.emotionToExpression).length}</div>
              <div>默认表情: {emotionMapping.defaultExpression}</div>
              <div>默认动作: {emotionMapping.defaultMotion}</div>
            </div>
          )}
          
          <div className="mt-2 pt-2 border-t border-gray-600">
            <div className="text-yellow-400">状态: {loadStatus}</div>
            <div>进度: {loadProgress}%</div>
            {lastAction && <div>最后动作: {lastAction}</div>}
          </div>
        </div>
      )}

      {/* 底部状态栏 */}
      <div className="absolute bottom-3 left-3 right-3 flex justify-between items-center">
        <div className="pointer-events-none rounded-full bg-black/50 px-3 py-1 text-xs text-white">
          {loadStatus === 'loaded' ? (
            <>
              ✅ 模型已加载
              {lastAction && ` · 动作: ${lastAction}`}
            </>
          ) : loadStatus === 'loading' ? (
            <>🔄 加载中... {loadProgress}%</>
          ) : loadStatus === 'error' ? (
            <>❌ 加载失败</>
          ) : (
            <>⏳ 等待加载</>
          )}
        </div>
        
        {/* 快速动作按钮 */}
        {loadStatus === 'loaded' && modelConfig && (
          <div className="flex gap-1">
            {Object.keys(modelConfig.motions).slice(0, 3).map((motionGroup) => (
              <button
                key={motionGroup}
                onClick={() => {
                  if (viewerRef.current) {
                    viewerRef.current.playAction(motionGroup);
                  }
                }}
                className="px-2 py-1 bg-white/80 hover:bg-white rounded text-xs transition-colors"
                title={`播放动作: ${motionGroup}`}
              >
                {motionGroup}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
