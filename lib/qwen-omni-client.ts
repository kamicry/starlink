import { APP_CONFIG, getEnvironmentConfig } from './constants';
import { handleWebSocketError, generateRequestId } from './utils';

export interface WebSocketMessage {
  header: {
    action: 'start' | 'continue' | 'finish';
    task_id: string;
    streaming: string;
    [key: string]: any;
  };
  payload?: {
    audio?: {
      sample_rate: number;
      sample_bits: number;
      channel: number;
      audio_data: string;
    };
    [key: string]: any;
  };
}

export interface WebSocketResponse {
  header: {
    action: string;
    task_id: string;
    status: string;
    status_code: number;
    usage?: {
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
    };
  };
  payload?: {
    audio?: {
      sample_rate: number;
      sample_bits: number;
      channel: number;
      audio_data: string;
    };
    text?: string;
    [key: string]: any;
  };
}

export interface QwenOmniClientOptions {
  onMessage?: (response: WebSocketResponse) => void;
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (error: Event) => void;
  onAudioData?: (audioData: ArrayBuffer) => void;
  onTextData?: (text: string) => void;
}

export class QwenOmniClient {
  private ws: WebSocket | null = null;
  private options: QwenOmniClientOptions;
  private requestId: string;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;

  constructor(options: QwenOmniClientOptions = {}) {
    this.options = options;
    this.requestId = generateRequestId();
  }

  /**
   * Connect to the Qwen Omni WebSocket
   */
  async connect(): Promise<void> {
    const config = getEnvironmentConfig();
    
    if (!config.apiKey || config.apiKey === 'your_key_here') {
      throw new Error('API key not configured. Please set DASHSCOPE_API_KEY in .env.local');
    }

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(config.wsUrl);
        
        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.options.onOpen?.();
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const response: WebSocketResponse = JSON.parse(event.data);
            this.handleMessage(response);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        this.ws.onclose = (event) => {
          console.log('WebSocket closed:', event.code, event.reason);
          this.isConnected = false;
          this.options.onClose?.(event);
          this.handleReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.options.onError?.(error);
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
  private handleMessage(response: WebSocketResponse): void {
    // Call the message handler
    this.options.onMessage?.(response);

    // Handle audio data
    if (response.payload?.audio?.audio_data) {
      const audioBuffer = this.base64ToArrayBuffer(response.payload.audio.audio_data);
      this.options.onAudioData?.(audioBuffer);
    }

    // Handle text data
    if (response.payload?.text) {
      this.options.onTextData?.(response.payload.text);
    }

    // Log usage statistics if available
    if (response.header.usage) {
      console.log('Token usage:', response.header.usage);
    }
  }

  /**
   * Start audio transmission
   */
  startAudioTransmission(audioConfig?: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const message: WebSocketMessage = {
      header: {
        action: 'start',
        task_id: this.requestId,
        streaming: 'duplex'
      },
      payload: {
        audio: {
          sample_rate: audioConfig?.sample_rate || APP_CONFIG.AUDIO.SAMPLE_RATE,
          sample_bits: audioConfig?.sample_bits || APP_CONFIG.AUDIO.BIT_DEPTH,
          channel: audioConfig?.channel || APP_CONFIG.AUDIO.CHANNELS,
          audio_data: ''
        }
      }
    };

    this.sendMessage(message);
  }

  /**
   * Send audio data
   */
  sendAudioData(audioData: ArrayBuffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected, cannot send audio data');
      return;
    }

    const message: WebSocketMessage = {
      header: {
        action: 'continue',
        task_id: this.requestId,
        streaming: 'duplex'
      },
      payload: {
        audio: {
          sample_rate: APP_CONFIG.AUDIO.SAMPLE_RATE,
          sample_bits: APP_CONFIG.AUDIO.BIT_DEPTH,
          channel: APP_CONFIG.AUDIO.CHANNELS,
          audio_data: this.arrayBufferToBase64(audioData)
        }
      }
    };

    this.sendMessage(message);
  }

  /**
   * Finish the transmission
   */
  finishTransmission(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const message: WebSocketMessage = {
      header: {
        action: 'finish',
        task_id: this.requestId,
        streaming: 'duplex'
      }
    };

    this.sendMessage(message);
  }

  /**
   * Send a message through WebSocket
   */
  private sendMessage(message: WebSocketMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
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
    }
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    if (this.ws) {
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
}