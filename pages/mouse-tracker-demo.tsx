import React, { useRef, useState } from 'react';
import { Live2DViewer, Live2DViewerHandle } from '../components/Live2DViewer';
import Head from "next/head";

export default function MouseTrackerDemo() {
  const viewerRef = useRef<Live2DViewerHandle>(null);
  const [modelPath, setModelPath] = useState('/live2d/chara/chara.model3.json');
  const [trackingEnabled, setTrackingEnabled] = useState(true);
  const [smoothness, setSmoothness] = useState(0.08);
  const [eyeTrackingScale, setEyeTrackingScale] = useState(0.8);
  const [headTrackingScale, setHeadTrackingScale] = useState(0.4);

  const handleLoadModel = () => {
    if (viewerRef.current) {
      viewerRef.current.loadModel(modelPath);
      setTrackingEnabled(true);
    }
  };

  const handleToggleTracking = () => {
    if (!viewerRef.current) return;

    if (trackingEnabled) {
      viewerRef.current.stopMouseTracking();
      setTrackingEnabled(false);
    } else {
      viewerRef.current.startMouseTracking();
      setTrackingEnabled(true);
    }
  };

  const handleUpdateConfig = () => {
    // Note: To update config dynamically, we would need to recreate the tracker
    // For now, this button demonstrates the config parameters
    console.log('Mouse tracking config:', {
      smoothness,
      eyeTrackingScale,
      headTrackingScale,
    });
  };

  return (
    <>
      <Head>
        <title>Live2D Mouse Tracker Demo</title>
      </Head>
      
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white">
        <div className="container mx-auto px-6 py-8">
          <h1 className="text-4xl font-bold mb-8 text-center bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            🖱️ Live2D Mouse Tracker Demo
          </h1>

          {/* Control Panel */}
          <div className="max-w-4xl mx-auto mb-8">
            <div className="bg-slate-800/50 rounded-2xl p-6 backdrop-blur border border-slate-700/50">
              <h2 className="text-xl font-semibold mb-4 text-blue-400">🎮 Control Panel</h2>
              
              {/* Model Path */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Model Path:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={modelPath}
                    onChange={(e) => setModelPath(e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="/path/to/model.model3.json"
                  />
                  <button
                    onClick={handleLoadModel}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
                  >
                    Load Model
                  </button>
                </div>
              </div>

              {/* Mouse Tracking Toggle */}
              <div className="mb-4 flex items-center gap-3">
                <button
                  onClick={handleToggleTracking}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    trackingEnabled
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {trackingEnabled ? '🟢 Tracking ON' : '🔴 Tracking OFF'}
                </button>
                <span className="text-sm text-slate-400">Toggle mouse tracking</span>
              </div>

              {/* Configuration Parameters */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Smoothness: {smoothness.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min="0.01"
                    max="0.2"
                    step="0.01"
                    value={smoothness}
                    onChange={(e) => setSmoothness(parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <div className="text-xs text-slate-500 mt-1">
                    Lower = smoother, Higher = more responsive
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Eye Tracking: {eyeTrackingScale.toFixed(1)}
                  </label>
                  <input
                    type="range"
                    min="0.2"
                    max="1.5"
                    step="0.1"
                    value={eyeTrackingScale}
                    onChange={(e) => setEyeTrackingScale(parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <div className="text-xs text-slate-500 mt-1">
                    Eye movement sensitivity
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Head Tracking: {headTrackingScale.toFixed(1)}
                  </label>
                  <input
                    type="range"
                    min="0.1"
                    max="0.8"
                    step="0.05"
                    value={headTrackingScale}
                    onChange={(e) => setHeadTrackingScale(parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <div className="text-xs text-slate-500 mt-1">
                    Head movement sensitivity
                  </div>
                </div>
              </div>

              <button
                onClick={handleUpdateConfig}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition-colors"
              >
                Update Config
              </button>
            </div>
          </div>

          {/* Info Panel */}
          <div className="max-w-4xl mx-auto mb-8">
            <div className="bg-slate-800/30 rounded-2xl p-6 backdrop-blur border border-slate-700/30">
              <h2 className="text-xl font-semibold mb-4 text-green-400">ℹ️ How It Works</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h3 className="text-lg font-medium text-yellow-400">👁️ Eye Tracking</h3>
                  <ul className="space-y-2 text-sm text-slate-300">
                    <li className="flex items-start gap-2">
                      <span className="text-green-400">✓</span>
                      <span>Models eyes follow mouse cursor in real-time</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-400">✓</span>
                      <span>Uses ParamEyeLeftX/Y and ParamEyeRightX/Y parameters</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-400">✓</span>
                      <span>Smooth interpolation for natural movement</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-400">✓</span>
                      <span>Configurable sensitivity (0.2 - 1.5)</span>
                    </li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <h3 className="text-lg font-medium text-yellow-400">🗣️ Head Tracking</h3>
                  <ul className="space-y-2 text-sm text-slate-300">
                    <li className="flex items-start gap-2">
                      <span className="text-green-400">✓</span>
                      <span>Head subtly follows mouse (subtle effect)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-400">✓</span>
                      <span>Uses ParamHeadX/Y parameters</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-400">✓</span>
                      <span>Lower sensitivity than eye tracking (0.1 - 0.8)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-400">✓</span>
                      <span>Creates natural "looking at" behavior</span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <h3 className="text-lg font-medium text-yellow-400">⚙️ Technical Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-300">
                  <div>📊 Mouse coordinates normalized to [-1, 1] range</div>
                  <div>🔄 Linear interpolation (Lerp) for smooth transitions</div>
                  <div>📱 Touch event support for mobile devices</div>
                  <div>🎯 60fps target with requestAnimationFrame</div>
                  <div>⚡ Automatic parameter reset on model load/unload</div>
                  <div>🔧 Compatible with standard Live2D parameter names</div>
                </div>
              </div>

              <div className="mt-6 p-4 bg-slate-900/50 rounded-lg border border-slate-700/50">
                <h4 className="text-sm font-semibold text-blue-400 mb-2">📝 Note</h4>
                <p className="text-sm text-slate-400">
                  If you don't see the tracking effect, make sure your Live2D model includes the required parameters:
                  <code className="block mt-2 p-2 bg-slate-900 rounded">
                    ParamEyeLeftX, ParamEyeLeftY, ParamEyeRightX, ParamEyeRightY, ParamHeadX, ParamHeadY
                  </code>
                  Different models may use different parameter naming conventions.
                </p>
              </div>
            </div>
          </div>

          {/* Live2D Viewer */}
          <div className="max-w-4xl mx-auto">
            <div className="bg-slate-800/20 rounded-2xl p-4 backdrop-blur border border-slate-700/30">
              <div className="h-96 w-full rounded-lg overflow-hidden border border-slate-700/50">
                <Live2DViewer
                  ref={viewerRef}
                  modelPath={modelPath}
                  onLoadComplete={(path) => {
                    console.log('Model loaded:', path);
                    setTrackingEnabled(true);
                  }}
                  onLoadError={(path, error) => {
                    console.error('Failed to load model:', path, error);
                  }}
                />
              </div>
              
              {/* Instructions */}
              <div className="mt-4 text-center text-sm text-slate-400">
                💡 Move your mouse over the model to see real-time tracking!
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}