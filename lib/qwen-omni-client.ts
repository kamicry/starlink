import { APP_CONFIG, getEnvironmentConfig } from './constants';
import { handleWebSocketError, generateRequestId } from './utils';

// Qwen-Omni-Realtime specific interfaces

export interface QwenOmniMessage {
  event_id: string;
  type: string;
  session?: {
    modalities?: string[];
    voice?: string;
    input_audio_format?: string;
    output_audio_format?: string;
    instructions?: string;
    turn_detection?: any;
  };
  audio?: string; // base64 encoded audio
  content?: string;
}

export interface QwenOmniResponse {
  type: string;
  event_id?: string;
  session?: {
    id: string;
  };
  transcript?: {
    delta?: string;
    text?: string;
  };
  audio?: {
    delta?: string;
  };
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  error?: {
    message: string;
    type: string;
  };
}

// Event callback types
export interface QwenOmniCallbacks {
  onSessionCreated?: (sessionId: string) => void;
  onSessionUpdated?: () => void;
  onSpeechStarted?: () => void;
  onSpeechStopped?: () => void;
  onAudioCommitted?: () => void;
  onAudioTranscriptDelta?: (delta: string) => void;
  onAudioTranscriptDone?: (text: string) => void;
  onAudioData?: (audioData: ArrayBuffer) => void;
  onAudioDone?: () => void;
  onResponseDone?: () => void;
  onError?: (error: string, type?: string) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

export class QwenOmniClient {
  private ws: WebSocket | null = null;
  private callbacks: QwenOmniCallbacks;
  private apiKey: string;
  private eventId: string = '';
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(apiKey: string, callbacks: QwenOmniCallbacks = {}) {
    this.callbacks = callbacks;
    this.apiKey = apiKey;
  }

  /**
   * Connect to the Qwen Omni WebSocket
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = `wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-omni-flash-realtime`;
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
          console.log('Qwen-Omni WebSocket connected');
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
            this.callbacks.onError?.('Error parsing message');
          }
        };

        this.ws.onclose = (event) => {
          console.log('Qwen-Omni WebSocket closed:', event.code, event.reason);
          this.isConnected = false;
          this.stopHeartbeat();
          this.callbacks.onClose?.();
          this.handleReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('Qwen-Omni WebSocket error:', error);
          this.callbacks.onError?.('WebSocket connection error');
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
  private handleMessage(response: QwenOmniResponse): void {
    console.log('Received message:', response);

    switch (response.type) {
      case 'session.created':
        if (response.session?.id) {
          this.callbacks.onSessionCreated?.(response.session.id);
        }
        break;

      case 'session.updated':
        this.callbacks.onSessionUpdated?.();
        break;

      case 'input_audio_buffer.speech_started':
        this.callbacks.onSpeechStarted?.();
        break;

      case 'input_audio_buffer.speech_stopped':
        this.callbacks.onSpeechStopped?.();
        break;

      case 'input_audio_buffer.committed':
        this.callbacks.onAudioCommitted?.();
        break;

      case 'response.audio_transcript.delta':
        if (response.transcript?.delta) {
          this.callbacks.onAudioTranscriptDelta?.(response.transcript.delta);
        }
        break;

      case 'response.audio_transcript.done':
        if (response.transcript?.text) {
          this.callbacks.onAudioTranscriptDone?.(response.transcript.text);
        }
        break;

      case 'response.audio.delta':
        if (response.audio?.delta) {
          const audioBuffer = this.base64ToArrayBuffer(response.audio.delta);
          this.callbacks.onAudioData?.(audioBuffer);
        }
        break;

      case 'response.audio.done':
        this.callbacks.onAudioDone?.();
        break;

      case 'response.done':
        this.callbacks.onResponseDone?.();
        break;

      case 'error':
        if (response.error) {
          this.callbacks.onError?.(response.error.message, response.error.type);
        }
        break;

      default:
        console.log('Unhandled message type:', response.type);
    }
  }

  /**
   * Send session update to initialize session
   */
  updateSession(config?: {
    modalities?: string[];
    voice?: string;
    input_audio_format?: string;
    output_audio_format?: string;
    instructions?: string;
  }): void {
    if (!this.isConnected) {
      console.warn('WebSocket not connected, cannot update session');
      return;
    }

    const message: QwenOmniMessage = {
      event_id: generateRequestId(),
      type: 'session.update',
      session: {
        modalities: config?.modalities || ['text', 'audio'],
        voice: config?.voice || 'Cherry',
        input_audio_format: config?.input_audio_format || 'pcm16',
        output_audio_format: config?.output_audio_format || 'pcm24',
        instructions: config?.instructions || '你是一个友好的 AI 助手，请自然地进行对话。',
        turn_detection: null
      }
    };

    this.sendMessage(message);
  }

  /**
   * Append audio to input buffer
   */
  appendAudio(audioData: ArrayBuffer): void {
    if (!this.isConnected) {
      console.warn('WebSocket not connected, cannot append audio');
      return;
    }

    const message: QwenOmniMessage = {
      event_id: generateRequestId(),
      type: 'input_audio_buffer.append',
      audio: this.arrayBufferToBase64(audioData)
    };

    this.sendMessage(message);
  }

  /**
   * Commit audio buffer
   */
  commit(): void {
    if (!this.isConnected) {
      console.warn('WebSocket not connected, cannot commit audio');
      return;
    }

    const message: QwenOmniMessage = {
      event_id: generateRequestId(),
      type: 'input_audio_buffer.commit'
    };

    this.sendMessage(message);
  }

  /**
   * Finish session
   */
  finish(): void {
    if (!this.isConnected) {
      console.warn('WebSocket not connected, cannot finish session');
      return;
    }

    const message: QwenOmniMessage = {
      event_id: generateRequestId(),
      type: 'session.finish'
    };

    this.sendMessage(message);
  }

  /**
   * Send a message through WebSocket
   */
  private sendMessage(message: QwenOmniMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('Sending message:', message);
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Handle reconnection logic
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        this.connect().catch(error => {
          handleWebSocketError(error, 'reconnection');
        });
      }, 1000 * this.reconnectAttempts);
    } else {
      console.error('Max reconnection attempts reached');
      this.callbacks.onError?.('Max reconnection attempts reached');
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
   * Disconnect WebSocket
   */
  disconnect(): void {
    if (this.ws) {
      this.stopHeartbeat();
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
      this.isConnected = false;
    }
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Utility: Convert ArrayBuffer to base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Utility: Convert base64 to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
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
   * Get current session ID
   */
  getSessionId(): string {
    return this.eventId;
  }

  /**
   * Set custom API key
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }
}