# Live2D 动作管理系统实现文档

## 概述

本文档描述了为 Live2D 模型实现的动作管理系统和交互逻辑功能。该系统提供了完整的动作管理、鼠标交互和自动行为功能。

## 实现的功能

### 1. 动作管理器 (ActionManager.ts)

**位置**: `/lib/live2d/ActionManager.ts`

**核心功能**:
- ✅ 动作队列管理 - 支持优先级队列，避免动作冲突
- ✅ 权重随机选择 - 根据配置权重随机选择动作
- ✅ 分组动作系统 - 支持按动作分组进行选择
- ✅ 自动空闲动作 - 定时播放空闲待机动作
- ✅ 动作状态跟踪 - 实时监控动作播放状态
- ✅ 错误处理和回调 - 完善的事件系统

**主要API**:
```typescript
// 播放指定动作
playAction(actionName: string, priority?: number): Promise<boolean>

// 播放随机动作
playRandomAction(actions?: string[]): Promise<string | null>

// 从分组播放随机动作
playRandomActionFromGroup(groupName: string): Promise<string | null>

// 停止当前动作
stopAction(): boolean

// 获取动作状态
getState(): ActionState
```

### 2. 动作配置文件 (actions.ts)

**位置**: `/lib/live2d/actions.ts`

**预定义动作**:
- **Idle动作组**: Idle, Idle_2, Idle_3 (待机动作)
- **Tap动作组**: TapBody, TapHead, TapArm (点击交互)
- **Emotion动作组**: Happy, Angry, Sad (情绪表达)
- **Expression动作组**: Wink, Shrug, Breath (表情动作)
- **Speaking动作组**: MouthOpen (语音相关)

**权重系统**:
- 每个动作都有权重值，数值越大越容易被随机选择
- 支持动作分组管理，便于分类控制

### 3. Live2DViewer 增强

**位置**: `/components/Live2DViewer.tsx`

**新增功能**:
- ✅ **鼠标跟踪注视** - 模型头部和眼睛跟随鼠标移动
- ✅ **点击检测** - 精确检测鼠标点击是否在模型区域内
- ✅ **点击动作触发** - 点击时随机触发动作
- ✅ **动作管理器集成** - 完整的动作管理功能
- ✅ **视觉反馈** - 点击时的视觉闪光效果
- ✅ **状态指示器** - 显示注视状态

**鼠标交互流程**:
1. 鼠标移动时计算相对位置 (-1 到 1)
2. 更新模型的 lookAt 参数
3. 限制更新频率 (50ms) 避免性能问题
4. 点击时进行 hitTest 检测
5. 如果点击在模型上，触发随机动作

### 4. API 扩展

**Live2DViewerHandle 新增方法**:
```typescript
{
  playRandomActionFromGroup: (groupName: string) => void;
  queueAction: (actionName: string) => void;
  stopAction: () => void;
  getActionState: () => ActionState | null;
}
```

**新增 Props**:
```typescript
{
  onMouseMove?: (mouseX: number, mouseY: number) => void;
  onMouseClick?: (mouseX: number, mouseY: number, hitTest: boolean) => void;
}
```

## 核心特性

### 智能动作管理

1. **冲突避免**: 使用队列系统确保多个动作不会重叠播放
2. **优先级系统**: 高优先级动作可以中断低优先级动作
3. **自动恢复**: 动作完成后自动回到空闲状态
4. **超时保护**: 防止动作卡死

### 自然的交互体验

1. **平滑注视**: 鼠标移动时模型头部和眼睛平滑跟随
2. **智能触发**: 点击检测精确识别模型区域
3. **即时反馈**: 点击时的视觉闪光效果
4. **状态提示**: 实时显示当前状态

### 性能优化

1. **频率限制**: 鼠标移动更新限制在 50ms 间隔
2. **范围限制**: 注视角度限制在合理范围内
3. **资源管理**: 完善的清理和释放机制
4. **错误容错**: 各种异常情况下的优雅降级

## 使用示例

### 基础使用
```typescript
<Live2DViewer
  modelPath="/models/chara.model3.json"
  onAction={(actionName) => console.log('Action:', actionName)}
  onMouseMove={(x, y) => console.log('Mouse:', x, y)}
  onMouseClick={(x, y, hitTest) => console.log('Click:', x, y, hitTest)}
/>
```

### 程序化控制
```typescript
const viewerRef = useRef<Live2DViewerHandle>(null);

// 播放特定动作
viewerRef.current?.playAction('Happy');

// 播放随机表情动作
viewerRef.current?.playRandomActionFromGroup('Expression');

// 停止当前动作
viewerRef.current?.stopAction();

// 获取当前状态
const state = viewerRef.current?.getActionState();
console.log('Current state:', state);
```

### 自定义配置
```typescript
// 在 Live2DViewer 中可以调整动作管理器配置
actionManagerRef.current = new ActionManager({
  autoPlayIdle: true,      // 启用自动空闲动作
  idleInterval: 10000,     // 10秒间隔
  maxQueueSize: 3,         // 最大队列3个
  actionTimeout: 5000,     // 5秒超时
});
```

## 技术实现细节

### 鼠标注视算法
1. **坐标系转换**: 将屏幕坐标转换为模型相对坐标
2. **范围限制**: 限制注视角度为 [-1, 1] 范围
3. **强度调节**: 使用 0.5 和 0.3 系数减弱注视强度
4. **性能优化**: 防抖处理避免过度更新

### 动作队列机制
1. **优先级排序**: 高优先级动作优先执行
2. **时间戳管理**: 同优先级按时间顺序执行
3. **超时处理**: 防止动作卡死影响后续执行
4. **状态同步**: 实时更新动作播放状态

### 点击检测算法
1. **Canvas坐标转换**: 将页面坐标转换为Canvas内部坐标
2. **边界检测**: 使用模型边界框进行初步判断
3. **Live2D API**: 优先使用模型的 hitTest 方法
4. **容错机制**: 检测失败时提供备用方案

## 配置说明

### 动作权重配置
在 `actions.ts` 中可以调整每个动作的权重：

```typescript
'TapBody': {
  name: 'TapBody',
  weight: 8,        // 权重值，越大越容易被选中
  group: 'Tap',
  duration: 2000,   // 预期持续时间
  description: '点击身体时触发的动作'
}
```

### 鼠标交互配置
在 `Live2DViewer` 中可以调整交互参数：

```typescript
// 鼠标更新频率 (毫秒)
const MOUSE_UPDATE_INTERVAL = 50;

// 注视强度系数
const LOOK_AT_X_STRENGTH = 0.5;
const LOOK_AT_Y_STRENGTH = 0.3;
```

## 验收标准完成情况

- ✅ **点击模型能正确触发动作** - 实现了精确的点击检测和动作触发
- ✅ **动作随机选择合理** - 使用权重系统确保选择合理性
- ✅ **多个动作不会重叠冲突** - 队列系统确保动作按序执行
- ✅ **性能良好，不影响渲染帧率** - 优化更新频率和资源管理

## 扩展建议

### 后续可扩展功能
1. **粒子效果** - 动作触发时的视觉特效
2. **声音反馈** - 配合动作的音效系统
3. **手势识别** - 支持更多手势交互
4. **情绪系统** - 根据对话内容调整情绪动作
5. **自定义动作** - 支持用户上传自定义动作

### 性能监控
1. **FPS监控** - 实时监控渲染性能
2. **内存使用** - 监控内存占用情况
3. **动作执行时间** - 分析动作执行效率
4. **用户交互统计** - 收集用户行为数据

## 总结

本次实现成功构建了一个完整的 Live2D 动作管理系统，具备以下特点：

1. **功能完整** - 涵盖动作管理、鼠标交互、状态监控等全部需求
2. **性能优秀** - 优化了更新频率和资源管理，确保流畅体验
3. **易于扩展** - 模块化设计便于后续功能扩展
4. **稳定可靠** - 完善的错误处理和容错机制
5. **用户友好** - 直观的交互和即时反馈系统

系统已完全满足验收标准，可以投入生产使用。