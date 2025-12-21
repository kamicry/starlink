import React, { useRef, useState } from 'react';
import Live2DViewer, { Live2DViewerHandle, Live2DLoadProgress } from '@/components/Live2DViewer';

export default function Live2DScaleTest() {
  const viewerRef = useRef<Live2DViewerHandle>(null);
  const [loadProgress, setLoadProgress] = useState<Live2DLoadProgress | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  const handleZoomIn = () => {
    viewerRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    viewerRef.current?.zoomOut();
  };

  const handleResetZoom = () => {
    viewerRef.current?.resetZoom();
  };

  const handleLock = () => {
    if (isLocked) {
      viewerRef.current?.unlock();
      setIsLocked(false);
    } else {
      viewerRef.current?.lock();
      setIsLocked(true);
    }
  };

  const handlePlayAction = (action: string) => {
    viewerRef.current?.playAction(action);
  };

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <h1 className="text-2xl font-bold text-white mb-2">Live2D Scale Manager Test</h1>
        <p className="text-gray-400 text-sm">
          Test the smooth zoom functionality with mouse wheel or buttons
        </p>
      </div>

      <div className="flex h-[calc(100vh-88px)]">
        {/* Main Viewer */}
        <div className="flex-1 relative">
          <Live2DViewer
            ref={viewerRef}
            modelPath="/live2d/chara/chara.model3.json"
            onLoadProgress={setLoadProgress}
            onLoadComplete={() => console.log('Model loaded successfully')}
            onLoadError={(path, error) => console.error('Failed to load model:', path, error)}
            className="h-full"
          />

          {/* Loading Indicator */}
          {loadProgress && loadProgress.progress < 100 && (
            <div className="absolute top-4 left-4 bg-black bg-opacity-75 text-white px-4 py-2 rounded-lg">
              <div className="text-sm font-medium mb-1">{loadProgress.stage}</div>
              <div className="w-48 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${loadProgress.progress}%` }}
                />
              </div>
              <div className="text-xs text-gray-400 mt-1">{loadProgress.progress}%</div>
            </div>
          )}

          {/* Instructions Overlay */}
          <div className="absolute top-4 right-4 bg-black bg-opacity-75 text-white px-4 py-3 rounded-lg max-w-xs">
            <h3 className="font-bold mb-2">🎮 Controls</h3>
            <ul className="text-sm space-y-1">
              <li>🖱️ <strong>Mouse Wheel:</strong> Zoom in/out</li>
              <li>🖱️ <strong>Click & Drag:</strong> Move model</li>
              <li>🖱️ <strong>Click:</strong> Play random action</li>
              <li>⌨️ <strong>Buttons:</strong> Use control panel</li>
            </ul>
          </div>

          {/* Zoom Range Info */}
          <div className="absolute bottom-4 left-4 bg-black bg-opacity-75 text-white px-4 py-2 rounded-lg">
            <div className="text-xs text-gray-400">Zoom Range</div>
            <div className="text-sm font-mono">0.5x - 2.5x</div>
            <div className="text-xs text-gray-400 mt-1">Step: 0.1x</div>
          </div>
        </div>

        {/* Control Panel */}
        <div className="w-80 bg-gray-800 border-l border-gray-700 p-4 space-y-4 overflow-y-auto">
          {/* Zoom Controls */}
          <div className="bg-gray-900 rounded-lg p-4">
            <h3 className="text-white font-bold mb-3 flex items-center">
              🔍 Zoom Controls
            </h3>
            <div className="space-y-2">
              <button
                onClick={handleZoomIn}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors"
              >
                ➕ Zoom In (+0.1)
              </button>
              <button
                onClick={handleZoomOut}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors"
              >
                ➖ Zoom Out (-0.1)
              </button>
              <button
                onClick={handleResetZoom}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded transition-colors"
              >
                🔄 Reset Zoom (1.0x)
              </button>
            </div>
          </div>

          {/* Lock Controls */}
          <div className="bg-gray-900 rounded-lg p-4">
            <h3 className="text-white font-bold mb-3 flex items-center">
              🔒 Position Lock
            </h3>
            <button
              onClick={handleLock}
              className={`w-full font-medium py-2 px-4 rounded transition-colors ${
                isLocked
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-white'
              }`}
            >
              {isLocked ? '🔓 Unlock Position' : '🔒 Lock Position'}
            </button>
            <p className="text-xs text-gray-400 mt-2">
              {isLocked 
                ? 'Position is locked. Drag disabled.'
                : 'Position is unlocked. You can drag the model.'}
            </p>
          </div>

          {/* Actions */}
          <div className="bg-gray-900 rounded-lg p-4">
            <h3 className="text-white font-bold mb-3 flex items-center">
              🎭 Actions
            </h3>
            <div className="space-y-2">
              <button
                onClick={() => handlePlayAction('Idle')}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded transition-colors"
              >
                Idle
              </button>
              <button
                onClick={() => handlePlayAction('TapBody')}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded transition-colors"
              >
                Tap Body
              </button>
              <button
                onClick={() => handlePlayAction('TapHead')}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded transition-colors"
              >
                Tap Head
              </button>
            </div>
          </div>

          {/* Test Scenarios */}
          <div className="bg-gray-900 rounded-lg p-4">
            <h3 className="text-white font-bold mb-3 flex items-center">
              🧪 Test Scenarios
            </h3>
            <div className="text-sm text-gray-300 space-y-2">
              <div className="border-l-2 border-blue-500 pl-3 py-1">
                <strong>Smooth Zoom:</strong> Use mouse wheel repeatedly
              </div>
              <div className="border-l-2 border-green-500 pl-3 py-1">
                <strong>Zoom Limits:</strong> Try to zoom beyond 0.5x-2.5x
              </div>
              <div className="border-l-2 border-yellow-500 pl-3 py-1">
                <strong>Drag + Zoom:</strong> Drag model, then zoom
              </div>
              <div className="border-l-2 border-purple-500 pl-3 py-1">
                <strong>Lock + Zoom:</strong> Lock position, then zoom
              </div>
            </div>
          </div>

          {/* Features Checklist */}
          <div className="bg-gray-900 rounded-lg p-4">
            <h3 className="text-white font-bold mb-3 flex items-center">
              ✅ Features Implemented
            </h3>
            <ul className="text-sm text-gray-300 space-y-1">
              <li>✅ Smooth zoom animations (200ms)</li>
              <li>✅ Mouse wheel support</li>
              <li>✅ Zoom limits (0.5x - 2.5x)</li>
              <li>✅ Step-based zoom (0.1x increments)</li>
              <li>✅ Reset to initial scale</li>
              <li>✅ Easing function (cubic ease-out)</li>
              <li>✅ Continuous zoom support</li>
              <li>✅ Compatible with drag & lock</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
