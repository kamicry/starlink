/**
 * Examples and usage demonstrations for Qwen-Omni client
 */

import { QwenOmniClient, QwenOmniCallbacks, QwenOmniError, QwenOmniSession, QwenOmniConversationItem } from './qwen-omni-client';

/**
 * Basic usage example
 */
export const basicExample = async () => {
  const callbacks: QwenOmniCallbacks = {
    onOpen: () => console.log('Connected to Qwen-Omni service'),
    onClose: () => console.log('Disconnected from service'),
    onError: (error: QwenOmniError) => console.error(`Error [${error.code}]:`, error.message),
    
    // Session events
    onSessionCreated: (session: QwenOmniSession) => console.log('Session created:', session.id),
    onSessionUpdated: (session: QwenOmniSession) => console.log('Session updated:', session.id),
    
    // Audio input events
    onSpeechStarted: (audioStartMs: number) => console.log('Speech started:', audioStartMs),
    onSpeechStopped: (audioEndMs: number) => console.log('Speech stopped:', audioEndMs),
    onAudioBufferCommitted: (itemId: string) => console.log('Audio committed:', itemId),
    
    // Response events
    onAudioTranscriptDelta: (delta: string) => console.log('Transcript delta:', delta),
    onAudioTranscriptDone: (text: string) => console.log('Final transcript:', text),
    onAudioDelta: (audioBytes: Uint8Array) => console.log('Received audio data:', audioBytes.byteLength, 'bytes'),
    onAudioDone: () => console.log('Audio response done'),
    onResponseDone: (response) => console.log('Full response completed:', response.status)
  };

  const apiKey = process.env.DASHSCOPE_API_KEY || 'your_api_key_here';
  const client = new QwenOmniClient(apiKey, callbacks);

  try {
    // Connect to the service
    await client.connect();
    console.log('WebSocket connected successfully');

    // Initialize session with custom configuration
    client.updateSession({
      modalities: ['text', 'audio'],
      voice: 'Cherry',
      input_audio_format: 'pcm16',
      output_audio_format: 'pcm24',
      instructions: '你是一个友好的AI助手，请用中文自然地进行对话。'
    });

    // Simulate audio data sending
    // Note: In real usage, this would be actual audio data from microphone
    const mockAudioData = new ArrayBuffer(1024);
    client.streamAudio(mockAudioData);
    
    // Commit the audio to trigger processing
    client.commitAudioBuffer();

    // Close when done
    await client.close();

  } catch (error) {
    console.error('Connection failed:', error);
  }
};

/**
 * Advanced usage with custom event listeners
 */
export const advancedExample = async () => {
  const apiKey = process.env.DASHSCOPE_API_KEY || 'your_api_key_here';
  const client = new QwenOmniClient(apiKey);

  // Add custom event listeners
  client.addEventListener('onOpen', () => {
    console.log('Connection established');
    client.updateSession(); // Auto-initialize session
  });

  client.addEventListener('onSessionCreated', (session: QwenOmniSession) => {
    console.log('Session initialized with ID:', session.id);
    
    // Start streaming audio after session creation
    startAudioStreaming(client);
  });

  client.addEventListener('onAudioDelta', (audioBytes: Uint8Array) => {
    // Handle received audio data
    console.log('Processing audio response:', audioBytes.byteLength, 'bytes');
  });

  client.addEventListener('onAudioTranscriptDone', (text: string) => {
    console.log('AI Response transcript:', text);
  });

  client.addEventListener('onError', (error: QwenOmniError) => {
    console.error(`Error [${error.code}]:`, error.message);
    if (error.type === 'connection') {
      // Attempt to reconnect after connection errors
      setTimeout(() => client.connect(), 5000);
    }
  });

  await client.connect();
};

/**
 * Simulate audio streaming
 */
const startAudioStreaming = (client: QwenOmniClient) => {
  // This would be replaced with real audio capture in production
  const interval = setInterval(() => {
    if (client.getConnectionStatus()) {
      // Generate mock audio data (in production, this would be real microphone data)
      const audioData = new ArrayBuffer(512);
      client.streamAudio(audioData);
    } else {
      clearInterval(interval);
    }
  }, 100); // Send audio every 100ms

  // Stop after 5 seconds for demo purposes
  setTimeout(() => {
    clearInterval(interval);
    client.commitAudioBuffer();
    client.close();
  }, 5000);
};

/**
 * Event handling with multiple listeners
 */
export const eventHandlingExample = async () => {
  const callbacks: QwenOmniCallbacks = {
    onOpen: () => {
      console.log('✓ Connection established');
      document.getElementById('connection-status')?.classList.add('connected');
    },
    
    onClose: () => {
      console.log('✗ Connection lost');
      document.getElementById('connection-status')?.classList.remove('connected');
    },
    
    onError: (error: QwenOmniError) => {
      console.error('✗ Error occurred:', error.message);
      showErrorNotification(error.message);
    },
    
    onSessionCreated: (session: QwenOmniSession) => {
      console.log('✓ Session initialized:', session.id);
      updateUIState('session-ready');
    },
    
    onAudioDelta: (audioBytes: Uint8Array) => {
      console.log('🎵 Received audio data');
      playAudioData(audioBytes.buffer as ArrayBuffer);
    },
    
    onAudioTranscriptDone: (text: string) => {
      console.log('💬 AI Response:', text);
      updateChatHistory(text);
    }
  };

  const client = new QwenOmniClient(process.env.DASHSCOPE_API_KEY!, callbacks);
  await client.connect();
};

/**
 * Helper functions for UI updates
 */
const showErrorNotification = (error: string) => {
  // Implementation for showing error notifications
  console.error('Error notification:', error);
};

const updateUIState = (state: string) => {
  // Implementation for updating UI state
  console.log('UI state updated:', state);
};

const playAudioData = (audioData: ArrayBuffer) => {
  // Implementation for playing audio data
  console.log('Playing audio data:', audioData.byteLength, 'bytes');
};

const updateChatHistory = (text: string) => {
  // Implementation for updating chat history
  console.log('Chat history updated:', text);
};

/**
 * Cleanup and resource management
 */
export const cleanupExample = async () => {
  const client = new QwenOmniClient(process.env.DASHSCOPE_API_KEY!);
  
  // Connect and use
  try {
    await client.connect();
    console.log('Client connected');
    
    // Set up cleanup on window unload
    const cleanup = async () => {
      console.log('Cleaning up resources');
      await client.close();
    };
    
    window.addEventListener('beforeunload', cleanup);
    
    // Return cleanup function
    return () => {
      window.removeEventListener('beforeunload', cleanup);
      cleanup();
    };
  } catch (error) {
    console.error('Connection failed:', error);
  }
};