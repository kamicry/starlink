import { APP_CONFIG, getEnvironmentConfig } from './constants';
import { handleWebSocketError, generateRequestId, base64ToBytes } from './utils';

// ========== TypeScript Interfaces ==========

// 客户端会话配置接口
export interface TurnDetectionConfig {
  type: "server_vad";
  threshold: number;                 // 0-1
  prefix_padding_ms: number;
  silence_duration_ms: number;
}

// 客户端会话配置接口（用户可配置的参数）
export interface SessionConfig {
  modalities?: ["text"] | ["text", "audio"];
  voice?: string;                    // Cherry, Serena, etc.
  instructions?: string;             // 系统指令
  turnDetection?: TurnDetectionConfig | null; // VAD 模式配置
  smoothOutput?: boolean | null;     // 口语化回复
  temperature?: number;              // 0-2，越高越多样
  topP?: number;                     // 0-1
  topK?: number | null;              // >= 0
  maxTokens?: number;
  repetitionPenalty?: number;        // > 0
  presencePenalty?: number;          // -2.0-2.0
  seed?: number;                     // 0 to 2^31-1
}

export interface QwenOmniMessage {
  event_id: string;
  type: string;
  session?: {
    modalities?: ["text"] | ["text", "audio"];
    voice?: string;
    input_audio_format?: string;
    output_audio_format?: string;
    instructions?: string;
    temperature?: number;
    topP?: number;
    topK?: number | null;
    max_tokens?: number;
    repetition_penalty?: number;
    presence_penalty?: number;
    seed?: number;
    turn_detection?: TurnDetectionConfig | null;
    smooth_output?: boolean | null;
  };
  audio?: string; // base64 encoded audio
  image?: string; // base64 encoded image
  content?: string;
}

export interface QwenOmniResponse {
  type: string;
  event_id?: string;
  session?: {
    id: string;
    model?: string;
    voice?: string;
    instructions?: string;
    temperature?: number;
    max_tokens?: number;
    turn_detection?: {
      threshold?: number;
      type?: string;
    };
  };
  error?: {
    code?: number;
    message: string;
    type?: string;
    param?: string;
  };
  audio_start_ms?: number;
  audio_end_ms?: number;
  item_id?: string;
  item?: {
    id: string;
    role: 'user' | 'assistant';
    status: string;
    content?: any[];
  };
  transcript?: {
    delta?: string;
    text?: string;
  };
  audio?: {
    delta?: string;
    done?: boolean;
  };
  response?: {
    id: string;
    status?: 'completed' | 'failed' | 'in_progress' | 'cancelled';
    modalities?: string[];
    voice?: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
    };
  };
  delta?: string;
  part?: {
    type: 'text' | 'audio';
    text?: string;
  };
}

// ========== Event Callback Interfaces ==========

export interface QwenOmniError {
  code?: number;
  message: string;
  type?: string;
  param?: string;
}

export interface QwenOmniSession {
  id: string;
  model?: string;
  voice?: string;
  instructions?: string;
  temperature?: number;
  max_tokens?: number;
  turn_detection?: any;
}

export interface QwenOmniConversationItem {
  id: string;
  role: 'user' | 'assistant';
  status: string;
  content?: any[];
}

export interface QwenOmniContentPart {
  type: 'text' | 'audio';
  text?: string;
}

export interface QwenOmniResponseInfo {
  id: string;
  status?: 'completed' | 'failed' | 'in_progress' | 'cancelled';
  modalities?: string[];
  voice?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

export interface QwenOmniCallbacks {
  // Error handling
  onError?: (error: QwenOmniError) => void;
  
  // Session events
  onSessionCreated?: (session: QwenOmniSession) => void;
  onSessionUpdated?: (session: QwenOmniSession) => void;
  
  // Input audio events
  onSpeechStarted?: (audioStartMs: number) => void;
  onSpeechStopped?: (audioEndMs: number) => void;
  onAudioBufferCommitted?: (itemId: string) => void;
  onAudioBufferCleared?: () => void;
  
  // Conversation item events
  onConversationItemCreated?: (item: QwenOmniConversationItem) => void;
  onUserTranscript?: (transcript: string) => void;
  onTranscriptionError?: (error: QwenOmniError) => void;
  
  // Response events
  onResponseCreated?: (response: QwenOmniResponseInfo) => void;
  onResponseDone?: (response: QwenOmniResponseInfo) => void;
  
  // Text output events
  onTextDelta?: (delta: string) => void;
  onTextDone?: (text: string) => void;
  
  // Audio output events
  onAudioDelta?: (audioBytes: Uint8Array) => void;
  onAudioDone?: () => void;
  onAudioTranscriptDelta?: (delta: string) => void;
  onAudioTranscriptDone?: (transcript: string) => void;
  
  // Output item events
  onOutputItemAdded?: (item: QwenOmniConversationItem) => void;
  onOutputItemDone?: (item: QwenOmniConversationItem) => void;
  
  // Content part events
  onContentPartAdded?: (part: QwenOmniContentPart) => void;
  onContentPartDone?: (part: QwenOmniContentPart) => void;
  
  // Connection events
  onOpen?: () => void;
  onClose?: () => void;
}

// ========== Main Client Class ==========

export class QwenOmniClient {
  // WebSocket connection
  private ws: WebSocket | null = null;
  private apiKey: string;
  private callbacks: QwenOmniCallbacks;
  
  // Connection management
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  
  // Event management
  private eventCounter = 0;
  
  // State management
  private _isResponding = false;
  private _currentResponseId: string | null = null;
  private _currentInputItemId: string | null = null;
  private _currentOutputItemId: string | null = null;
  public sessionId: string | null = null;
  
  // Text buffers for UI display
  private userTranscriptBuffer = '';
  private assistantTextBuffer = '';
  private assistantTranscriptBuffer = '';

  constructor(apiKey: string, callbacks: QwenOmniCallbacks = {}) {
    this.callbacks = callbacks;
    this.apiKey = apiKey;
  }

  // ========== Connection Methods ==========

  /**
   * Connect to the Qwen Omni WebSocket
   * 支持API Key认证
   */
  async connect(url?: string, apiKey?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // 使用提供的API Key或构造函数中设置的API Key
        const key = apiKey || this.apiKey;
        if (!key) {
          throw new Error('API Key is required');
        }

        // 如果没有提供URL，使用默认URL（API Key通过query参数传递）
        const wsUrl = url || `wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-omni-flash-realtime&authorization=Bearer ${key}`;
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
          console.log('✓ Qwen-Omni WebSocket connected');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.callbacks.onOpen?.();
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const response: QwenOmniResponse = JSON.parse(event.data);
            this.handleMessage(response);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
            this.callbacks.onError?.({ message: 'Error parsing message' });
          }
        };

        this.ws.onclose = (event) => {
          console.log(`→ WebSocket closed: ${event.code} ${event.reason}`);
          this.isConnected = false;
          this.stopHeartbeat();
          this.callbacks.onClose?.();
          this.handleReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('❌ Qwen-Omni WebSocket error:', error);
          this.callbacks.onError?.({ message: 'WebSocket connection error' });
          reject(error);
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private async handleMessage(response: QwenOmniResponse): Promise<void> {
    console.log(`📨 Received: ${response.type}`, response);

    switch (response.type) {
      // ========== Session Events ==========
      case 'error':
        const error = response.error;
        console.error(`❌ 错误 [${error?.code}]: ${error?.message}`);
        if (error?.param) {
          console.error(`   参数: ${error.param}`);
        }
        this.callbacks.onError?.(error!);
        break;

      case 'session.created':
        const sessionId = response.session?.id!;
        console.log(`✓ 会话已创建: ${sessionId}`);
        if (response.session?.model) console.log(`  模型: ${response.session.model}`);
        if (response.session?.voice) console.log(`  音色: ${response.session.voice}`);
        if (response.session?.turn_detection?.threshold) {
          console.log(`  VAD 阈值: ${response.session.turn_detection.threshold}`);
        }
        this.sessionId = sessionId;
        this.callbacks.onSessionCreated?.(response.session!);
        break;

      case 'session.updated':
        console.log(`✓ 会话配置已更新`);
        if (response.session?.instructions) {
          console.log(`  指令: ${response.session.instructions}`);
        }
        if (response.session?.temperature) {
          console.log(`  温度: ${response.session.temperature}`);
        }
        if (response.session?.max_tokens) {
          console.log(`  最大 tokens: ${response.session.max_tokens}`);
        }
        this.callbacks.onSessionUpdated?.(response.session!);
        break;

      // ========== Input Audio Events ==========
      case 'input_audio_buffer.speech_started':
        const audioStartMs = response.audio_start_ms!;
        const itemId = response.item_id!;
        console.log(`✓ 检测到语音开始 (${audioStartMs}ms), 项目ID: ${itemId}`);
        
        // 关键：如果正在回复，需要中断
        if (this._isResponding) {
          console.log(`→ 用户打断，中断前一个回复`);
          await this.cancelResponse();
        }
        
        this._currentInputItemId = itemId;
        this.callbacks.onSpeechStarted?.(audioStartMs);
        break;

      case 'input_audio_buffer.speech_stopped':
        const audioEndMs = response.audio_end_ms!;
        console.log(`✓ 检测到语音结束 (${audioEndMs}ms)`);
        this.callbacks.onSpeechStopped?.(audioEndMs);
        break;

      case 'input_audio_buffer.committed':
        console.log(`✓ 音频缓冲区已提交, 项目ID: ${response.item_id}`);
        this.callbacks.onAudioBufferCommitted?.(response.item_id!);
        break;

      case 'input_audio_buffer.cleared':
        console.log(`✓ 音频缓冲区已清除`);
        this.callbacks.onAudioBufferCleared?.();
        break;

      // ========== Conversation Item Events ==========
      case 'conversation.item.created':
        const item = response.item!;
        const role = item.role;
        console.log(`✓ 对话项已创建: ${item.id} (角色: ${role}, 状态: ${item.status})`);
        this.callbacks.onConversationItemCreated?.(item);
        break;

      case 'conversation.item.input_audio_transcription.completed':
        const transcript = response.transcript?.text!;
        console.log(`👤 用户: ${transcript}`);
        this.callbacks.onUserTranscript?.(transcript);
        this.userTranscriptBuffer = transcript; // 保存供 UI 显示
        break;

      case 'conversation.item.input_audio_transcription.failed':
        const transcriptError = response.error!;
        console.error(`❌ 转录失败 [${transcriptError.code}]: ${transcriptError.message}`);
        this.callbacks.onTranscriptionError?.(transcriptError);
        break;

      // ========== Response Events ==========
      case 'response.created':
        const responseId = response.response?.id!;
        this._currentResponseId = responseId;
        this._isResponding = true;
        console.log(`→ 开始生成回复 (ID: ${responseId})`);
        if (response.response?.modalities) {
          console.log(`  模态: ${response.response.modalities.join(', ')}`);
        }
        if (response.response?.voice) {
          console.log(`  音色: ${response.response.voice}`);
        }
        this.callbacks.onResponseCreated?.(response.response!);
        break;

      case 'response.done':
        this._isResponding = false;
        const status = response.response?.status!;
        const usage = response.response?.usage;
        console.log(`✓ 回复完成 (状态: ${status})`);
        if (usage) {
          console.log(`  Token 使用: 总计 ${usage.total_tokens}, 输入 ${usage.input_tokens}, 输出 ${usage.output_tokens}`);
        }
        this.callbacks.onResponseDone?.(response.response!);
        break;

      // ========== Text Output Events ==========
      case 'response.text.delta':
        const textDelta = response.delta!;
        console.log(`  ${textDelta}`, ''); // 实时显示，无换行
        this.assistantTextBuffer += textDelta;
        this.callbacks.onTextDelta?.(textDelta);
        break;

      case 'response.text.done':
        const completeText = response.transcript?.text!;
        console.log(`\n✓ 文本完成: "${completeText}"`);
        this.callbacks.onTextDone?.(completeText);
        break;

      // ========== Audio Output Events ==========
      case 'response.audio.delta':
        const audioDelta = response.audio?.delta!;
        const audioBytes = base64ToBytes(audioDelta);
        // 立即加入播放队列
        this.callbacks.onAudioDelta?.(audioBytes);
        break;

      case 'response.audio.done':
        console.log(`✓ 音频生成完成`);
        this.callbacks.onAudioDone?.();
        break;

      case 'response.audio_transcript.delta':
        const transcriptDelta = response.transcript?.delta!;
        console.log(`🤖 助手: ${transcriptDelta}`, '');
        this.assistantTranscriptBuffer += transcriptDelta;
        this.callbacks.onAudioTranscriptDelta?.(transcriptDelta);
        break;

      case 'response.audio_transcript.done':
        const completeTranscript = response.transcript?.text!;
        console.log(`\n✓ 音频转录: "${completeTranscript}"`);
        this.callbacks.onAudioTranscriptDone?.(completeTranscript);
        break;

      // ========== Output Item Events ==========
      case 'response.output_item.added':
        const outputItem = response.item!;
        console.log(`→ 输出项目已添加 (ID: ${outputItem.id}, 角色: ${outputItem.role})`);
        this._currentOutputItemId = outputItem.id;
        this.callbacks.onOutputItemAdded?.(outputItem);
        break;

      case 'response.output_item.done':
        const completedItem = response.item!;
        const itemContent = completedItem.content;
        console.log(`✓ 输出项目完成 (ID: ${completedItem.id})`);
        if (itemContent && itemContent.length > 0) {
          const firstContent = itemContent[0];
          if (firstContent.type === 'audio') {
            console.log(`  包含音频, 转录: "${firstContent.transcript || ''}"`);
          } else if (firstContent.type === 'text') {
            console.log(`  包含文本: "${firstContent.text || ''}"`);
          }
        }
        this.callbacks.onOutputItemDone?.(completedItem);
        break;

      // ========== Content Part Events ==========
      case 'response.content_part.added':
        const partAdded = response.part!;
        console.log(`→ 内容部分已添加 (类型: ${partAdded.type})`);
        this.callbacks.onContentPartAdded?.(partAdded);
        break;

      case 'response.content_part.done':
        const partDone = response.part!;
        console.log(`✓ 内容部分完成 (类型: ${partDone.type})`);
        if (partDone.type === 'audio') {
          console.log(`  音频转录: "${partDone.text || ''}"`);
        } else if (partDone.type === 'text') {
          console.log(`  文本: "${partDone.text || ''}"`);
        }
        this.callbacks.onContentPartDone?.(partDone);
        break;

      default:
        console.log(`❓ 未处理的事件类型: ${response.type}`);
    }
  }

  // ========== Session Management Methods ==========

  /**
   * Send session update to initialize session
   * 必须：连接后立即发送，作为第一个事件
   */
  async updateSession(config: SessionConfig): Promise<void> {
    const event = {
      "type": "session.update",
      "session": {
        // 必选字段
        "modalities": config.modalities || ["text", "audio"],
        "voice": config.voice || "Cherry",
        "input_audio_format": "pcm16",  // 固定值
        "output_audio_format": "pcm24", // 固定值
        
        // 可选字段 - 系统指令
        "instructions": config.instructions || "你是一个友好的 AI 助手，请自然地进行对话。",
        
        // 可选字段 - VAD 模式配置（VAD 模式下服务端自动检测语音）
        "turn_detection": config.turnDetection || {
          "type": "server_vad",
          "threshold": 0.1,              // VAD 灵敏度（0-1，越低越灵敏）
          "prefix_padding_ms": 500,      // 前导填充（毫秒）
          "silence_duration_ms": 900     // 停顿检测（毫秒）
        },
        
        // 可选字段 - 输出模态特性
        "smooth_output": config.smoothOutput !== undefined ? config.smoothOutput : true,
        
        // 可选字段 - 生成控制参数
        "temperature": config.temperature !== undefined ? config.temperature : 0.9,
        "top_p": config.topP !== undefined ? config.topP : 1.0,
        "top_k": config.topK !== undefined ? config.topK : 50,
        "max_tokens": config.maxTokens || 16384,
        "repetition_penalty": config.repetitionPenalty || 1.05,
        "presence_penalty": config.presencePenalty || 0.0,
        "seed": config.seed !== undefined ? config.seed : -1
      }
    };
    
    await this.sendEvent(event);
    
    console.log('✓ 会话配置已发送：');
    console.log('  - 音色: ' + event.session.voice);
    console.log('  - 指令: ' + event.session.instructions);
    console.log('  - 温度: ' + event.session.temperature);
    console.log('  - VAD 阈值: ' + event.session.turn_detection?.threshold);
  }

  /**
   * 取消当前响应
   * 用途：中断模型当前生成的响应
   */
  async cancelResponse(): Promise<void> {
    if (!this._currentResponseId) {
      console.warn('⚠ 没有正在进行的响应，无法取消');
      return;
    }
    
    const event = {
      "type": "response.cancel"
    };
    
    await this.sendEvent(event);
    console.log('⊗ 已取消响应');
    
    this._isResponding = false;
    this._currentResponseId = null;
  }

  // ========== Audio Streaming Methods ==========

  /**
   * 追加音频数据
   * 用途：持续发送音频块到服务端
   * 格式：PCM16（16bit，16kHz，单声道）
   */
  async streamAudio(audioData: ArrayBuffer): Promise<void> {
    // 将 ArrayBuffer 转换为 Base64
    const audioBase64 = this.arrayBufferToBase64(audioData);
    
    const event = {
      "type": "input_audio_buffer.append",
      "audio": audioBase64  // Base64 编码的 PCM16 数据
    };
    
    await this.sendEvent(event);
    
    // 不输出日志（太频繁），可选调试
    // console.log('▶ 发送音频块 (' + audioData.byteLength + ' 字节)');
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * 提交音频缓冲区
   * 用途：（仅 Manual 模式）手动提交缓冲区以触发处理
   * VAD 模式：无需调用，服务端自动提交
   */
  async commitAudioBuffer(): Promise<void> {
    const event = {
      "type": "input_audio_buffer.commit"
    };
    
    await this.sendEvent(event);
    console.log('✓ 音频缓冲区已提交');
  }

  /**
   * 清除音频缓冲区
   * 用途：清除当前缓冲区中的音频数据
   */
  async clearAudioBuffer(): Promise<void> {
    const event = {
      "type": "input_audio_buffer.clear"
    };
    
    await this.sendEvent(event);
    console.log('✓ 音频缓冲区已清除');
  }

  /**
   * 请求创建响应
   * 用途：（仅 Manual 模式）手动请求模型生成响应
   * VAD 模式：无需调用，服务端自动生成
   */
  async createResponse(): Promise<void> {
    const event = {
      "type": "response.create"
    };
    
    await this.sendEvent(event);
    console.log('→ 已请求创建响应');
  }

  /**
   * 追加图像数据（可选）
   * 用途：（暂不使用）发送视频帧到服务端
   */
  async appendImage(imageData: ArrayBuffer): Promise<void> {
    // 将 ArrayBuffer 转换为 Base64
    const imageBase64 = this.arrayBufferToBase64(imageData);
    
    const event = {
      "type": "input_image_buffer.append",
      "image": imageBase64  // Base64 编码的 JPG/JPEG 数据
    };
    
    await this.sendEvent(event);
    console.log('▶ 发送图像帧 (' + imageData.byteLength + ' 字节)');
  }

  // ========== Event Management ==========

  /**
   * 生成唯一事件ID
   */
  private generateEventId(): string {
    return `event_${Date.now()}_${++this.eventCounter}`;
  }

  /**
   * 发送事件到服务端
   * 检查WebSocket连接状态并添加事件ID
   */
  private async sendEvent(event: any): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket 未连接');
    }
    
    // 生成事件 ID
    event.event_id = this.generateEventId();
    
    console.log(`📤 发送事件: ${event.type}`, event);
    this.ws.send(JSON.stringify(event));
  }

  // ========== Utility Methods ==========

  /**
   * Send a message through WebSocket (向后兼容)
   */
  private sendMessage(message: QwenOmniMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log(`📤 Sending: ${message.type}`, message);
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('⚠️ WebSocket not open, cannot send message');
    }
  }

  /**
   * Handle reconnection logic
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`🔄 尝试重连... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        this.connect().catch(error => {
          handleWebSocketError(error, 'reconnection');
        });
      }, 1000 * this.reconnectAttempts);
    } else {
      console.error('❌ 达到最大重连次数');
      this.callbacks.onError?.({ message: 'Max reconnection attempts reached' });
    }
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected && this.ws) {
        const heartbeatMessage: QwenOmniMessage = {
          event_id: generateRequestId(),
          type: 'ping'
        };
        this.sendMessage(heartbeatMessage);
      }
    }, 30000); // Send ping every 30 seconds
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Disconnect WebSocket and cleanup
   */
  async close(): Promise<void> {
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    
    this.isConnected = false;
    this._isResponding = false;
    this._currentResponseId = null;
    this._currentInputItemId = null;
    this._currentOutputItemId = null;
    this.sessionId = null;
    
    console.log('✓ WebSocket connection closed');
    this.callbacks.onClose?.();
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Get current response ID
   */
  getCurrentResponseId(): string | null {
    return this._currentResponseId;
  }

  /**
   * Check if currently responding
   */
  getIsResponding(): boolean {
    return this._isResponding;
  }

  /**
   * Get current input item ID
   */
  getCurrentInputItemId(): string | null {
    return this._currentInputItemId;
  }

  /**
   * Get current output item ID
   */
  getCurrentOutputItemId(): string | null {
    return this._currentOutputItemId;
  }

  /**
   * Get buffered user transcript
   */
  getUserTranscriptBuffer(): string {
    return this.userTranscriptBuffer;
  }

  /**
   * Get buffered assistant text
   */
  getAssistantTextBuffer(): string {
    return this.assistantTextBuffer;
  }

  /**
   * Get buffered assistant transcript
   */
  getAssistantTranscriptBuffer(): string {
    return this.assistantTranscriptBuffer;
  }

  /**
   * Clear all text buffers
   */
  clearBuffers(): void {
    this.userTranscriptBuffer = '';
    this.assistantTextBuffer = '';
    this.assistantTranscriptBuffer = '';
  }

  /**
   * Add event listener
   */
  addEventListener(event: keyof QwenOmniCallbacks, callback: Function): void {
    (this.callbacks as any)[event] = callback;
  }

  /**
   * Remove event listener
   */
  removeEventListener(event: keyof QwenOmniCallbacks): void {
    (this.callbacks as any)[event] = undefined;
  }

  /**
   * Set custom API key
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Get current session ID
   */
  getSessionId(): string {
    return this.sessionId || '';
  }
}