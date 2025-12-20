import React, { useState, useRef, useEffect } from 'react';
import Live2DViewer, { Live2DViewerHandle } from '../components/Live2DViewer';

export default function Live2DTest() {
  const viewerRef = useRef<Live2DViewerHandle>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [currentAction, setCurrentAction] = useState<string>('');

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    setLogs(prev => [...prev.slice(-9), logEntry]); // 保持最近10条日志
    console.log(logEntry);
  };

  const handleLoadStart = (path: string) => {
    addLog(`开始加载模型: ${path}`);
  };

  const handleLoadProgress = (progress: any) => {
    addLog(`加载进度: ${progress.progress}% (${progress.stage})`);
  };

  const handleLoadComplete = (path: string) => {
    addLog(`模型加载完成: ${path}`);
    setModelLoaded(true);
  };

  const handleLoadError = (path: string, error: Error) => {
    addLog(`模型加载失败: ${path} - ${error.message}`);
    setModelLoaded(false);
  };

  const handleAction = (actionName: string) => {
    addLog(`执行动作: ${actionName}`);
    setCurrentAction(actionName);
    
    // 2秒后清除当前动作显示
    setTimeout(() => {
      setCurrentAction('');
    }, 2000);
  };

  const handleMouseMove = (mouseX: number, mouseY: number) => {
    if (Math.random() < 0.1) { // 偶尔记录，避免日志过多
      addLog(`鼠标移动: (${mouseX.toFixed(0)}, ${mouseY.toFixed(0)})`);
    }
  };

  const handleMouseClick = (mouseX: number, mouseY: number, hitTest: boolean) => {
    addLog(`点击检测: (${mouseX.toFixed(0)}, ${mouseY.toFixed(0)}) - ${hitTest ? '命中' : '未命中'}`);
  };

  const testActions = () => {
    if (!viewerRef.current) return;
    
    const testActionSequence = [
      () => viewerRef.current?.playAction('Idle'),
      () => viewerRef.current?.playAction('TapBody'),
      () => viewerRef.current?.playAction('Happy'),
      () => viewerRef.current?.playAction('Wink'),
      () => viewerRef.current?.playRandomAction(),
      () => viewerRef.current?.stopAction(),
    ];

    let index = 0;
    const executeNext = () => {
      if (index < testActionSequence.length) {
        testActionSequence[index]();
        index++;
        setTimeout(executeNext, 2000);
      }
    };

    addLog('开始动作测试序列...');
    executeNext();
  };

  const getActionState = () => {
    if (!viewerRef.current) return;
    const state = viewerRef.current.getActionState();
    addLog(`动作状态: ${JSON.stringify(state, null, 2)}`);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Live2D 测试页面</h1>
          <p className="text-gray-600">测试 Live2D 模型的鼠标注视、动作播放和交互功能</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 主模型视图 */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold">Live2D 模型视图</h2>
                <p className="text-sm text-gray-600 mt-1">
                  测试鼠标移动注视、点击动作触发和参数控制
                </p>
              </div>
              <div className="h-96">
                <Live2DViewer
                  ref={viewerRef}
                  modelPath="/live2d/chara/chara.model3.json"
                  onLoadStart={handleLoadStart}
                  onLoadProgress={handleLoadProgress}
                  onLoadComplete={handleLoadComplete}
                  onLoadError={handleLoadError}
                  onAction={handleAction}
                  onMouseMove={handleMouseMove}
                  onMouseClick={handleMouseClick}
                  className="h-full"
                />
              </div>
            </div>
          </div>

          {/* 控制面板和日志 */}
          <div className="space-y-6">
            {/* 控制按钮 */}
            <div className="bg-white rounded-lg shadow-lg p-4">
              <h3 className="text-lg font-semibold mb-4">测试控制</h3>
              
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button
                  onClick={() => viewerRef.current?.playAction('Idle')}
                  className="px-3 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
                  disabled={!modelLoaded}
                >
                  待机
                </button>
                <button
                  onClick={() => viewerRef.current?.playAction('TapBody')}
                  className="px-3 py-2 bg-green-500 text-white text-sm rounded hover:bg-green-600"
                  disabled={!modelLoaded}
                >
                  点击
                </button>
                <button
                  onClick={() => viewerRef.current?.playAction('Happy')}
                  className="px-3 py-2 bg-yellow-500 text-white text-sm rounded hover:bg-yellow-600"
                  disabled={!modelLoaded}
                >
                  开心
                </button>
                <button
                  onClick={() => viewerRef.current?.playAction('Wink')}
                  className="px-3 py-2 bg-purple-500 text-white text-sm rounded hover:bg-purple-600"
                  disabled={!modelLoaded}
                >
                  眨眼
                </button>
                <button
                  onClick={() => viewerRef.current?.playRandomAction()}
                  className="px-3 py-2 bg-pink-500 text-white text-sm rounded hover:bg-pink-600"
                  disabled={!modelLoaded}
                >
                  随机动作
                </button>
                <button
                  onClick={() => viewerRef.current?.stopAction()}
                  className="px-3 py-2 bg-red-500 text-white text-sm rounded hover:bg-red-600"
                  disabled={!modelLoaded}
                >
                  停止
                </button>
              </div>

              <div className="space-y-2">
                <button
                  onClick={testActions}
                  className="w-full px-4 py-2 bg-indigo-500 text-white text-sm rounded hover:bg-indigo-600"
                  disabled={!modelLoaded}
                >
                  自动测试序列
                </button>
                <button
                  onClick={getActionState}
                  className="w-full px-4 py-2 bg-gray-500 text-white text-sm rounded hover:bg-gray-600"
                  disabled={!modelLoaded}
                >
                  获取动作状态
                </button>
              </div>

              {/* 当前状态显示 */}
              <div className="mt-4 p-3 bg-gray-50 rounded">
                <div className="text-sm space-y-1">
                  <div>模型状态: {modelLoaded ? '✅ 已加载' : '❌ 未加载'}</div>
                  <div>当前动作: {currentAction || '无'}</div>
                  <div>鼠标注视: 开启 (移动鼠标测试)</div>
                </div>
              </div>
            </div>

            {/* 调试日志 */}
            <div className="bg-white rounded-lg shadow-lg p-4">
              <h3 className="text-lg font-semibold mb-4">调试日志</h3>
              <div className="bg-black text-green-400 text-xs p-3 rounded font-mono h-64 overflow-y-auto">
                {logs.length === 0 ? (
                  <div className="text-gray-500">等待系统日志...</div>
                ) : (
                  logs.map((log, index) => (
                    <div key={index} className="mb-1">{log}</div>
                  ))
                )}
              </div>
              <button
                onClick={() => setLogs([])}
                className="mt-2 px-3 py-1 bg-gray-500 text-white text-xs rounded hover:bg-gray-600"
              >
                清空日志
              </button>
            </div>
          </div>
        </div>

        {/* 测试说明 */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-blue-800 mb-2">测试指南</h3>
          <div className="text-sm text-blue-700 space-y-1">
            <p>• <strong>鼠标注视测试</strong>: 移动鼠标到模型区域，观察模型是否跟随鼠标转动头部和眼睛</p>
            <p>• <strong>点击动作测试</strong>: 点击模型身体或头部，触发随机动作</p>
            <p>• <strong>手动动作测试</strong>: 使用上方按钮手动触发不同动作</p>
            <p>• <strong>参数控制测试</strong>: 观察参数控制动作（眨眼、表情变化等）</p>
            <p>• <strong>调试信息</strong>: 查看左上角的调试面板和右侧日志了解系统状态</p>
          </div>
        </div>
      </div>
    </div>
  );
}