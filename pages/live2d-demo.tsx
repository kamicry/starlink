import React from 'react';
import Live2DModelPanel from '../components/Live2DModelPanel';

export default function Live2DDemo() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Live2D 动作管理系统演示
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            测试 Live2D 模型的动作列表功能。您可以点击模型触发随机动作，或使用下方的动作列表手动执行指定动作。
            模型还会跟随鼠标移动进行注视。
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 第一个模型演示 */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-800">
              示例模型 1
            </h2>
            <div className="h-96 rounded-xl overflow-hidden shadow-lg">
              <Live2DModelPanel 
                defaultModelPath="/live2d/chara/chara.model3.json"
                className="h-full"
              />
            </div>
            <div className="text-sm text-gray-500 space-y-1">
              <p>• 尝试移动鼠标查看模型注视效果</p>
              <p>• 点击模型身体或头部触发不同动作</p>
              <p>• 使用底部动作列表手动控制</p>
            </div>
          </div>

          {/* 第二个模型演示 */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-800">
              示例模型 2
            </h2>
            <div className="h-96 rounded-xl overflow-hidden shadow-lg">
              <Live2DModelPanel 
                defaultModelPath="/live2d/chara/chara.model3.json"
                className="h-full"
              />
            </div>
            <div className="text-sm text-gray-500 space-y-1">
              <p>• 比较不同模型的动画效果</p>
              <p>• 测试动作队列和优先级系统</p>
              <p>• 观察自动空闲动作功能</p>
            </div>
          </div>
        </div>

        {/* 功能说明 */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg p-6 shadow-sm border">
            <h3 className="font-semibold text-gray-800 mb-2">🎯 智能交互</h3>
            <p className="text-sm text-gray-600">
              模型会自动跟随鼠标移动进行注视，点击时触发随机动作，支持精确的命中检测。
            </p>
          </div>
          
          <div className="bg-white rounded-lg p-6 shadow-sm border">
            <h3 className="font-semibold text-gray-800 mb-2">📋 动作列表</h3>
            <p className="text-sm text-gray-600">
              可展开的分组动作列表，包含空闲、点击、表情、情绪等多种动作类型，支持一键随机选择。
            </p>
          </div>
          
          <div className="bg-white rounded-lg p-6 shadow-sm border">
            <h3 className="font-semibold text-gray-800 mb-2">⚡ 性能优化</h3>
            <p className="text-sm text-gray-600">
              智能队列系统避免动作冲突，优先级管理确保重要动作优先执行，实时状态监控。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}