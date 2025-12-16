import { APP_CONFIG } from './constants';

// Utility functions for audio processing and WebSocket communication

/**
 * Convert ArrayBuffer to base64 string
 */
export const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

/**
 * Convert base64 string to ArrayBuffer
 */
export const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

/**
 * Convert Float32Array to Int16Array (PCM16)
 */
export const float32ToInt16 = (float32Array: Float32Array): Int16Array => {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16Array;
};

/**
 * Convert Int16Array to Float32Array
 */
export const int16ToFloat32 = (int16Array: Int16Array): Float32Array => {
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / 0x7FFF;
  }
  return float32Array;
};

/**
 * Calculate audio level (RMS)
 */
export const calculateAudioLevel = (audioData: Float32Array): number => {
  let sum = 0;
  for (let i = 0; i < audioData.length; i++) {
    sum += audioData[i] * audioData[i];
  }
  const rms = Math.sqrt(sum / audioData.length);
  return Math.min(100, (rms * 100));
};

/**
 * Create audio context
 */
export const createAudioContext = (): AudioContext => {
  return new (window.AudioContext || (window as any).webkitAudioContext)();
};

/**
 * Check if browser supports required features
 */
export const checkBrowserSupport = (): { webAudio: boolean; websocket: boolean } => {
  return {
    webAudio: !!(window.AudioContext || (window as any).webkitAudioContext),
    websocket: !!window.WebSocket
  };
};

/**
 * Format audio data for WebSocket transmission
 */
export const formatAudioForTransmission = (audioData: Float32Array, sampleRate: number = APP_CONFIG.AUDIO.SAMPLE_RATE): any => {
  return {
    audio: {
      sample_rate: sampleRate,
      sample_bits: APP_CONFIG.AUDIO.BIT_DEPTH,
      channel: APP_CONFIG.AUDIO.CHANNELS,
      audio_data: arrayBufferToBase64(audioData.buffer as ArrayBuffer)
    }
  };
};

/**
 * Parse received audio data
 */
export const parseReceivedAudio = (data: any): Float32Array => {
  try {
    const audioData = base64ToArrayBuffer(data.audio_data);
    return new Float32Array(audioData);
  } catch (error) {
    console.error('Error parsing received audio:', error);
    return new Float32Array();
  }
};

/**
 * Error handling utility
 */
export const handleWebSocketError = (error: any, context: string): void => {
  console.error(`WebSocket error in ${context}:`, error);
  // Here you could add error reporting, retry logic, or user notifications
};

/**
 * Generate unique request ID
 */
export const generateRequestId = (): string => {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Sleep utility for delays
 */
export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};