// Configuration constants for the Starlink application

export const APP_CONFIG = {
  // WebSocket configuration
  WEBSOCKET_URL: 'wss://dashscope.aliyuncs.com/ws/v1/services/aigc-audio-generation/voice-generation',
  
  // Audio configuration
  AUDIO: {
    SAMPLE_RATE: 16000,
    CHANNELS: 1,
    BIT_DEPTH: 16,
    CHUNK_SIZE: 1024,
    FORMAT: 'audio/wav'
  },
  
  // WebRTC configuration
  WEBRTC: {
    ICE_SERVERS: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  },
  
  // API endpoints
  API: {
    AUTH: '/api/auth',
    WEBSOCKET: '/api/ws'
  },
  
  // Model configuration
  MODEL: {
    DEFAULT: 'qwen3-omni-flash-realtime'
  },
  
  // UI configuration
  UI: {
    MAX_AUDIO_LEVEL: 100,
    AUDIO_UPDATE_INTERVAL: 100
  }
};

// Environment-specific settings
export const getEnvironmentConfig = () => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  return {
    isDevelopment,
    apiKey: process.env.DASHSCOPE_API_KEY,
    qwenModel: process.env.NEXT_PUBLIC_QWEN_MODEL || APP_CONFIG.MODEL.DEFAULT,
    wsUrl: isDevelopment 
      ? 'ws://localhost:8080' 
      : APP_CONFIG.WEBSOCKET_URL
  };
};