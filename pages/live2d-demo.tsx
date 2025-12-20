import React, { useState } from 'react';
import Live2DModelPanel from '../components/Live2DModelPanel';

export default function Live2DDemo() {
  const [selectedModel, setSelectedModel] = useState('/live2d/chara/chara.model3.json');
  
  // 模拟不同的用户输入用于测试情绪映射
  const testInputs = [
    '你好！我今天非常开心！',
    '这个任务让我很沮丧...',
    '等等，这是怎么回事？我很困惑。',
    '我有点紧张，不知道该怎么办。',
    '太棒了！我非常兴奋！',
    '今天感觉很平静。'
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* 页面标题 */}
      <div className="bg-gray-800 p-4">
        <h1 className="text-2xl font-bold text-center">
          🎭 Live2D 模型解析和情绪映射系统演示
        </h1>
        <p className="text-center text-gray-300 mt-2">
          自动解析模型配置文件，智能映射情绪到表情和动作
        </p>
      </div>

      <div className="flex h-screen">
        {/* 左侧：Live2D 模型显示区域 */}
        <div className="flex-1 bg-gray-800">
          <Live2DModelPanel 
            defaultModelPath={selectedModel}
            className="h-full"
          />
        </div>

        {/* 右侧：控制面板和演示 */}
        <div className="w-96 bg-gray-900 p-4 space-y-4">
          {/* 模型选择 */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-3">🎮 模型选择</h2>
            <select 
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full bg-gray-700 text-white rounded px-3 py-2"
            >
              <option value="/live2d/chara/chara.model3.json">默认角色 (chara)</option>
            </select>
            <p className="text-sm text-gray-400 mt-2">
              当前模型会自动解析动作组、表情、物理参数等配置
            </p>
          </div>

          {/* 情绪映射演示 */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-3">🎭 情绪映射演示</h2>
            <p className="text-sm text-gray-300 mb-3">
              点击下方文本，Live2D 模型会自动根据情绪表达相应的表情和动作：
            </p>
            <div className="space-y-2">
              {testInputs.map((input, index) => (
                <button
                  key={index}
                  onClick={() => {
                    // 在实际应用中，这里会触发情绪分析并更新模型
                    console.log('用户输入:', input);
                    // 这里只是模拟，实际会调用 getMostLikelyEmotion 或类似函数
                    let emotion = 'neutral';
                    if (input.includes('开心') || input.includes('高兴')) emotion = 'happy';
                    else if (input.includes('沮丧') || input.includes('难过')) emotion = 'sad';
                    else if (input.includes('困惑') || input.includes('怎么回事')) emotion = 'confused';
                    else if (input.includes('紧张') || input.includes('焦虑')) emotion = 'nervous';
                    else if (input.includes('兴奋') || input.includes('太棒')) emotion = 'excited';
                    else if (input.includes('平静') || input.includes('冷静')) emotion = 'calm';
                    
                    console.log(`检测到情绪: ${emotion}`);
                  }}
                  className="w-full text-left p-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors text-sm"
                >
                  {input}
                </button>
              ))}
            </div>
          </div>

          {/* 系统功能说明 */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-3">⚙️ 系统功能</h2>
            <div className="space-y-2 text-sm text-gray-300">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                自动解析 .model3.json 配置文件
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                提取动作组、表情、物理参数
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-purple-400 rounded-full"></span>
                智能情绪映射到表情和动作
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-yellow-400 rounded-full"></span>
                识别交互区域和参数组
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-red-400 rounded-full"></span>
                完整的错误处理和调试信息
              </div>
            </div>
          </div>

          {/* 技术特性 */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-3">🔧 技术特性</h2>
            <div className="space-y-1 text-xs text-gray-400">
              <div>• 基于标准 Live2D 模型格式</div>
              <div>• 自动解析 FileReferences 配置</div>
              <div>• 支持多种动作组格式</div>
              <div>• 表情文件自动扫描</div>
              <div>• 情绪关键词智能匹配</div>
              <div>• 调试面板实时显示信息</div>
              <div>• 完整的 TypeScript 类型支持</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}