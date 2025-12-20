import React, { useRef, useState, useEffect } from 'react';
import { Live2DViewer, Live2DViewerHandle } from './Live2DViewer';
import { defaultActionConfig } from '../lib/live2d/actions';

/**
 * Live2D Action System Test Component
 * 
 * Demonstrates the enhanced Live2D action manager functionality including:
 * - Click interaction and hit testing
 * - Mouse tracking with head/eye following
 * - Action queue management
 * - Random action selection with weights
 * - Statistics tracking
 */

export default function Live2DActionTest() {
  const viewerRef = useRef<Live2DViewerHandle>(null);
  
  const [modelPath, setModelPath] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [actionStats, setActionStats] = useState({
    isPlaying: false,
    currentAction: null as { name: string; group: string } | null,
    queueLength: 0,
    availableGroups: [] as string[],
    totalActions: 0,
  });
  const [lastAction, setLastAction] = useState('');
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [enableMouseTracking, setEnableMouseTracking] = useState(true);
  const [enableHeadTracking, setEnableHeadTracking] = useState(true);
  const [enableEyeTracking, setEnableEyeTracking] = useState(true);

  // Default model path for testing
  const defaultModelPath = '/models/default.model3.json';

  // Update stats periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (viewerRef.current) {
        const stats = viewerRef.current.getActionStats();
        setActionStats(stats);
      }
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // Load default model on mount
  useEffect(() => {
    setModelPath(defaultModelPath);
  }, []);

  const handleLoadComplete = () => {
    setIsLoaded(true);
    console.log('Model loaded successfully');
    
    // Auto-play an idle animation after load
    setTimeout(() => {
      if (viewerRef.current) {
        viewerRef.current.playRandomActionFromGroup('Idle');
      }
    }, 1000);
  };

  const handleActionPlay = (actionName: string) => {
    setLastAction(actionName);
    console.log('Action played:', actionName);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setMousePosition({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  const playRandomAction = () => {
    if (viewerRef.current) {
      viewerRef.current.playRandomAction();
    }
  };

  const playRandomActionFromGroup = (groupName: string) => {
    if (viewerRef.current) {
      viewerRef.current.playRandomActionFromGroup(groupName);
    }
  };

  const queueAction = (actionName: string, groupName?: string) => {
    if (viewerRef.current) {
      viewerRef.current.queueAction(actionName, groupName);
    }
  };

  const stopAction = () => {
    if (viewerRef.current) {
      viewerRef.current.stopAction();
    }
  };

  const queueMultipleActions = () => {
    if (viewerRef.current) {
      // Queue a sequence of actions
      viewerRef.current.queueAction('TapBody_01', 'TapBody');
      viewerRef.current.queueAction('TapHead_01', 'TapHead');
      setTimeout(() => {
        viewerRef.current?.queueAction('Idle_01', 'Idle');
      }, 500);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-6">Live2D Action System Test</h1>
        
        {/* Control Panel */}
        <div className="bg-gray-800 rounded-lg p-4 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Model Controls */}
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-white">Model</h3>
              <input
                type="text"
                value={modelPath}
                onChange={(e) => setModelPath(e.target.value)}
                placeholder="Enter model path"
                className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600"
              />
              <div className="text-sm text-gray-400">
                Status: {isLoaded ? '✅ Loaded' : '⏳ Not loaded'}
              </div>
            </div>

            {/* Action Controls */}
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-white">Actions</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={playRandomAction}
                  className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                >
                  Random Action
                </button>
                <button
                  onClick={stopAction}
                  className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                >
                  Stop
                </button>
                <button
                  onClick={queueMultipleActions}
                  className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                >
                  Queue Sequence
                </button>
              </div>
            </div>

            {/* Mouse Tracking Controls */}
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-white">Mouse Tracking</h3>
              <div className="space-y-1">
                <label className="flex items-center text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={enableMouseTracking}
                    onChange={(e) => setEnableMouseTracking(e.target.checked)}
                    className="mr-2"
                  />
                  Enable Tracking
                </label>
                <label className="flex items-center text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={enableHeadTracking}
                    onChange={(e) => setEnableHeadTracking(e.target.checked)}
                    className="mr-2"
                  />
                  Head Movement
                </label>
                <label className="flex items-center text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={enableEyeTracking}
                    onChange={(e) => setEnableEyeTracking(e.target.checked)}
                    className="mr-2"
                  />
                  Eye Movement
                </label>
              </div>
              <div className="text-xs text-gray-400">
                Cursor: {mousePosition.x.toFixed(1)}%, {mousePosition.y.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>

        {/* Action Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* Available Actions */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-white mb-3">Available Action Groups</h3>
            <div className="space-y-2">
              {actionStats.availableGroups.length > 0 ? (
                actionStats.availableGroups.map((group) => (
                  <div key={group} className="flex items-center justify-between">
                    <span className="text-gray-300">{group}</span>
                    <button
                      onClick={() => playRandomActionFromGroup(group)}
                      className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs"
                    >
                      Play
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-gray-400 text-sm">No action groups loaded</p>
              )}
            </div>
          </div>

          {/* Statistics */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-white mb-3">Statistics</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-300">
                <span>Status:</span>
                <span>{actionStats.isPlaying ? '🔴 Playing' : '🟢 Idle'}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Current Action:</span>
                <span>{actionStats.currentAction?.name || 'None'}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Queue Length:</span>
                <span>{actionStats.queueLength}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Available Groups:</span>
                <span>{actionStats.availableGroups.length}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Total Actions:</span>
                <span>{actionStats.totalActions}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Last Action:</span>
                <span>{lastAction || 'None'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Preview Info */}
        <div className="bg-blue-900 bg-opacity-20 border border-blue-700 rounded-lg p-4 mb-4">
          <h3 className="text-lg font-semibold text-blue-300 mb-2">How to Test</h3>
          <ul className="list-disc list-inside text-sm text-blue-200 space-y-1">
            <li>Click on the Live2D model to trigger random actions</li>
            <li>Click different areas (head vs body) for different actions</li>
            <li>Move your mouse over the model to see head/eye tracking</li>
            <li>Use the action buttons to test specific functionality</li>
            <li>Check the statistics panel for real-time updates</li>
          </ul>
        </div>

        {/* Live2D Viewer with Actions */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-white mb-3">Live2D Viewer</h3>
          <div className="text-sm text-gray-400 mb-3">
            Click on the model to trigger actions. Move mouse over model area for tracking.
          </div>
          {modelPath ? (
            <div 
              className="w-full h-96 bg-gray-900 rounded border border-gray-700 overflow-hidden"
              onMouseMove={handleMouseMove}
            >
              <Live2DViewer
                ref={viewerRef}
                modelPath={modelPath}
                onAction={handleActionPlay}
                onLoadComplete={handleLoadComplete}
                actionConfig={defaultActionConfig}
                enableMouseTracking={enableMouseTracking}
                trackHeadMovement={enableHeadTracking}
                trackEyeMovement={enableEyeTracking}
              />
            </div>
          ) : (
            <div className="w-full h-96 bg-gray-700 rounded border border-gray-600 flex items-center justify-center">
              <p className="text-gray-400">Enter a model path to load Live2D model</p>
            </div>
          )}
        </div>

        {/* Action Queue Demo */}
        <div className="bg-gray-800 rounded-lg p-4 mt-4">
          <h3 className="text-lg font-semibold text-white mb-3">Queue Demo</h3>
          <p className="text-sm text-gray-400 mb-3">
            Queue multiple actions to be played in sequence:
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.keys(defaultActionConfig.groups).map((group) => (
              <button
                key={group}
                onClick={() => {
                  const actions = defaultActionConfig.groups[group];
                  if (actions && actions.length > 0) {
                    const randomAction = actions[Math.floor(Math.random() * actions.length)];
                    queueAction(randomAction.name, group);
                  }
                }}
                className="px-3 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 text-sm"
              >
                Queue {group}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}