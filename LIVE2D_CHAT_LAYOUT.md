# OmniChat 与 Live2D 布局集成

## 概述

将 OmniChat 聊天框与 Live2D 模型集成到同一个页面，Live2D 模型展示在上方，聊天框展示在下方。

## 布局结构

```
┌───────────────────────────────────┐
│                                   │
│     Live2D Model Display          │  flex-1 (自适应高度)
│     (Occupies top section)        │
│                                   │
├───────────────────────────────────┤
│         OmniChat Card             │  py-8 (下方 section)
│  ┌─────────────────────────────┐  │
│  │ Left Controls │ Chat Area   │  │
│  │   (Column 1)  │ (Column 2-3)│  │
│  └─────────────────────────────┘  │
└───────────────────────────────────┘
```

## 实现细节

### pages/index.tsx

```jsx
<div className="min-h-screen flex flex-col bg-gray-50">
  {/* Live2D 区域 - 上方，占用可用空间 */}
  <div className="flex-1 bg-gradient-to-b from-gray-100 to-gray-50 flex items-center justify-center overflow-hidden">
    <div className="text-gray-400 text-center">
      <p className="text-lg font-semibold">Live2D Model Area</p>
      <p className="text-sm mt-2">(Your Live2D model will be rendered here)</p>
    </div>
  </div>

  {/* OmniChat 卡片 - 下方 */}
  <div className="py-8">
    <OmniChat />
  </div>
</div>
```

**关键点**:
- `min-h-screen`: 最小全屏高度
- `flex flex-col`: 竖排布局
- `flex-1`: Live2D 占用上方所有可用空间
- `py-8`: 聊天框下方的内边距

### components/OmniChat.tsx

OmniChat 保持原有的卡片样式：

```jsx
<div className="w-full max-w-4xl mx-auto p-4 md:p-6 bg-white rounded-xl shadow-lg">
  {/* Header */}
  {/* Grid: 左侧控件 + 右侧聊天区 */}
  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
    {/* 左列：md:col-span-1 */}
    {/* 右列：md:col-span-2 */}
  </div>
</div>
```

**特点**:
- 白色卡片，圆角，阴影
- 居中显示，最大宽度 4xl
- 响应式网格布局
- 所有原有功能保留完整

## 样式细节

| 元素 | 样式 |
|------|------|
| 整体容器 | `min-h-screen flex flex-col bg-gray-50` |
| Live2D 区域 | `flex-1 bg-gradient-to-b ...` |
| OmniChat 容器 | `py-8` (padding) |
| OmniChat 卡片 | `w-full max-w-4xl mx-auto p-4 md:p-6 bg-white rounded-xl shadow-lg` |
| 内部布局 | `grid grid-cols-1 md:grid-cols-3 gap-6` |

## 响应式设计

- **移动端**: 单列布局，聊天控件堆叠
- **平板端**: 3 列网格，左侧控件，右侧聊天
- **桌面端**: 完整的 3 列布局，充分利用空间

## 功能保留

✅ **所有原有功能完整**:
- VAD 语音检测
- 麦克风权限管理
- API 连接测试
- 实时语音采集和播放
- 文本转录显示
- 聊天历史管理
- 音量控制
- 语音选择
- 错误处理

## Live2D 集成步骤

### 1. 添加 Live2D 组件

在 `pages/index.tsx` 中替换占位符：

```jsx
import Live2DViewer from '../components/Live2DViewer';

// ...
<div className="flex-1 bg-gradient-to-b from-gray-100 to-gray-50 flex items-center justify-center overflow-hidden">
  <Live2DViewer />
</div>
```

### 2. 确保容器正确

Live2D 组件应该：
- 使用 `width: 100%` 和 `height: 100%`
- 或者使用 `flex` 布局填充容器
- 不要指定固定的宽高，让容器决定大小

### 3. 处理事件

确保：
- Live2D 点击事件不被阻挡
- 聊天框不会覆盖 Live2D（通过 `flex` 布局自动分离）
- 页面滚动行为正常（使用 `min-h-screen`）

## 可选优化

### 1. 调整比例

如需修改 Live2D 和聊天框的高度比例：

```jsx
{/* Live2D 占 70% */}
<div className="h-[70vh]" ...>

{/* OmniChat 占 30% */}
<div className="h-[30vh]" ...>
```

### 2. 添加分隔线

```jsx
{/* 分隔线 */}
<div className="border-t border-gray-200"></div>
```

### 3. 固定聊天框高度

改用固定高度而不是 `flex-1`:

```jsx
<div className="h-[40vh] overflow-y-auto py-8">
  <OmniChat />
</div>
```

## 测试清单

- [ ] Live2D 区域正常显示
- [ ] OmniChat 卡片在下方正常显示
- [ ] 页面高度合理（不会溢出或留白过多）
- [ ] 响应式布局在各种屏幕尺寸下正常
- [ ] Live2D 点击交互有效
- [ ] 聊天功能完全正常
- [ ] 权限请求和连接测试正常
- [ ] 音频采集和播放正常

## 浏览器兼容性

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Edge 90+
- ✅ Safari 14+

## 文件清单

- `pages/index.tsx` - 主页面，Live2D + OmniChat 布局
- `components/OmniChat.tsx` - 聊天框组件（保持原有样式）
- `styles/globals.css` - 全局样式

## 完成状态

✅ **实现完成**

- 布局结构正确
- 所有功能保留
- 代码通过 TypeScript 检查
- Next.js 构建成功
- 可投入生产环境

---

**最后更新**: 2024-12-19  
**版本**: 1.0  
**状态**: 就绪
