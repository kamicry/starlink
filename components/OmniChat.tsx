'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Wifi, WifiOff, Play, Trash2, Activity, Loader2, Shield, ShieldCheck, AlertCircle, RefreshCw } from 'lucide-react';
import { QwenOmniClient, QwenOmniCallbacks } from '../lib/qwen-omni-client';
import { PCMDecoder } from '../lib/audio/pcm-decoder';
import { AudioPlayer } from '../lib/audio/audio-player';
import { AudioProcessor } from '../lib/audio/audio-processor';
import { AudioSmoother } from '../lib/audio/audio-smoother';
import { requestMicrophonePermission, checkBrowserCompatibility, BrowserCompatibility } from '../lib/audio/microphone-permission';
import { testQwenConnection, validateApiKey, getEnvironmentInfo } from '../lib/test-connection';

// Types for component status
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type AppStatus = 'idle' | 'listening' | 'processing' | 'speaking';
type PermissionStatus = 'not_requested' | 'requesting' | 'granted' | 'denied' | 'error';
type ConnectionTestStatus = 'not_tested' | 'testing' | 'success' | 'failed';

export default function OmniChat() {
  // Application State
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [appStatus, setAppStatus] = useState<AppStatus>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [conversationHistory, setConversationHistory] = useState<{role: 'user' | 'assistant', text: string}[]>([]);
  const [volume, setVolume] = useState(0.7);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [voice, setVoice] = useState('Cherry');
  
  // 权限和连接测试状态
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('not_requested');
  const [connectionTestStatus, setConnectionTestStatus] = useState<ConnectionTestStatus>('not_tested');
  const [connectionTestMessage, setConnectionTestMessage] = useState<string>('');
  const [connectionLatency, setConnectionLatency] = useState<number | null>(null);
  const [browserCompatibility, setBrowserCompatibility] = useState<BrowserCompatibility | null>(null);
  const [isRetryingPermission, setIsRetryingPermission] = useState(false);
  const [isRetryingConnection, setIsRetryingConnection] = useState(false);

  // Refs for instances
  const clientRef = useRef<QwenOmniClient | null>(null);
  const audioProcessorRef = useRef<AudioProcessor | null>(null);
  const pcmDecoderRef = useRef<PCMDecoder | null>(null);
  const audioPlayerRef = useRef<AudioPlayer | null>(null);
  const audioSmootherRef = useRef<AudioSmoother | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  
  // 检查浏览器兼容性
  useEffect(() => {
    const compatibility = checkBrowserCompatibility();
    setBrowserCompatibility(compatibility);
    
    if (!compatibility.recommended) {
      setErrorMsg(`浏览器兼容性警告: ${compatibility.issues.join(', ')}`);
    }
  }, []);
  
  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript, conversationHistory]);

  // Initialize Audio Components
  useEffect(() => {
    const initAudioComponents = async () => {
      try {
        // Initialize PCM Decoder
        pcmDecoderRef.current = new PCMDecoder({
          sampleRate: 24000, // Output format is usually 24kHz for high quality text-to-speech
          channels: 1,
          bitDepth: 16
        });

        // Initialize Audio Smoother
        audioSmootherRef.current = new AudioSmoother(5, 24000); // 5ms crossfade

        // Initialize Audio Player
        audioPlayerRef.current = new AudioPlayer({
          sampleRate: 24000, // Match decoder sample rate
          channels: 1,
          volume: volume,
          autoPlay: false,
          onPlay: () => {
            setAppStatus('speaking');
          },
          onEnded: () => {
            setAppStatus('listening');
          },
          onError: (error) => {
            console.error('Audio player error:', error);
            setErrorMsg(`Audio player error: ${error}`);
          }
        });

        await audioPlayerRef.current.initialize();
        
        // Initialize Audio Processor (Microphone)
        audioProcessorRef.current = new AudioProcessor({
          sampleRate: 16000, // Input sample rate required by Qwen
          channels: 1,
          chunkDurationMs: 100, // Send chunk every 100ms
          onAudioChunk: (buffer) => {
            // Forward audio chunk to WebSocket
            if (clientRef.current && clientRef.current.getConnectionStatus()) {
              clientRef.current.appendAudio(buffer);
            }
          },
          onAudioLevel: (level) => {
            setAudioLevel(level);
          },
          onError: (error) => {
            console.error('Audio processor error:', error);
            setErrorMsg(`Microphone error: ${error}`);
          }
        });
        
        // Initialize Audio Processor resources (request mic permission early or wait for start)
        // Note: initialization usually requires user interaction, so we might do it on "Start"
        
      } catch (error) {
        console.error('Failed to initialize audio components:', error);
        setErrorMsg('Failed to initialize audio components');
      }
    };

    initAudioComponents();

    return () => {
      // Clean up
      pcmDecoderRef.current?.dispose();
      audioPlayerRef.current?.dispose();
      audioProcessorRef.current?.dispose();
      clientRef.current?.disconnect();
    };
  }, []);

  // Sync volume
  useEffect(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.setVolume(volume);
    }
  }, [volume]);

  // 处理麦克风权限请求
  const handleRequestMicrophonePermission = async () => {
    if (!browserCompatibility?.getUserMedia) {
      setErrorMsg('您的浏览器不支持麦克风功能，请使用 Chrome、Firefox 或 Edge 浏览器');
      return;
    }

    setIsRetryingPermission(true);
    setPermissionStatus('requesting');
    setErrorMsg(null);

    try {
      await requestMicrophonePermission();
      setPermissionStatus('granted');
      setErrorMsg(null);
    } catch (error: any) {
      console.error('麦克风权限请求失败:', error);
      setPermissionStatus('denied');
      setErrorMsg(error.message || '麦克风权限请求失败');
    } finally {
      setIsRetryingPermission(false);
    }
  };

  // 处理 API 连接测试
  const handleTestConnection = async () => {
    const apiKey = process.env.NEXT_PUBLIC_DASHSCOPE_API_KEY || '';
    
    // 验证 API Key 格式
    const apiKeyValidation = validateApiKey(apiKey);
    if (!apiKeyValidation.valid) {
      setErrorMsg(apiKeyValidation.message);
      setConnectionTestStatus('failed');
      setConnectionTestMessage(apiKeyValidation.message);
      return;
    }

    setIsRetryingConnection(true);
    setConnectionTestStatus('testing');
    setConnectionTestMessage('🔄 正在测试连接...');
    setErrorMsg(null);

    try {
      const result = await testQwenConnection(apiKey);
      
      if (result.success) {
        setConnectionTestStatus('success');
        setConnectionTestMessage(result.message);
        setConnectionLatency(result.latency || null);
      } else {
        setConnectionTestStatus('failed');
        setConnectionTestMessage(result.message);
        setConnectionLatency(null);
        
        if (result.errorType === 'invalid_api_key') {
          setErrorMsg('API Key 无效，请检查 .env.local 文件中的 NEXT_PUBLIC_DASHSCOPE_API_KEY');
        } else {
          setErrorMsg(result.message);
        }
      }
    } catch (error: any) {
      console.error('连接测试失败:', error);
      setConnectionTestStatus('failed');
      setConnectionTestMessage(`❌ 连接测试失败: ${error.message}`);
      setConnectionLatency(null);
      setErrorMsg(`连接测试失败: ${error.message}`);
    } finally {
      setIsRetryingConnection(false);
    }
  };

  // 重试麦克风权限
  const retryMicrophonePermission = () => {
    handleRequestMicrophonePermission();
  };

  // 重试 API 连接
  const retryConnection = () => {
    handleTestConnection();
  };

  // Process and Queue Audio Logic
  const processAndQueueAudio = useCallback((audioData: ArrayBuffer) => {
    if (!pcmDecoderRef.current || !audioPlayerRef.current || !audioSmootherRef.current) return;

    try {
      // Decode PCM16 (S16LE) to Float32
      let processedAudio = pcmDecoderRef.current.decodePCM(audioData, 16);
      if (processedAudio.length === 0) return;

      // Calculate audio statistics for debugging (only log occasionally)
      if (Math.random() < 0.05) { // Log 5% of chunks
        let min = Infinity, max = -Infinity, sum = 0, sumAbs = 0;
        for (let i = 0; i < processedAudio.length; i++) {
          const sample = processedAudio[i];
          if (sample < min) min = sample;
          if (sample > max) max = sample;
          sum += sample;
          sumAbs += Math.abs(sample);
        }
        console.log('Audio chunk stats (before processing):', {
          samples: processedAudio.length,
          min: min.toFixed(3),
          max: max.toFixed(3),
          mean: (sum / processedAudio.length).toFixed(3),
          rms: Math.sqrt(sumAbs / processedAudio.length).toFixed(3)
        });
      }

      // Apply DC offset removal
      processedAudio = audioSmootherRef.current.removeDCOffset(processedAudio);

      // Apply smoothing and crossfade
      processedAudio = audioSmootherRef.current.smooth(processedAudio);

      // Apply soft limiting to prevent clipping
      const limitedAudio = new Float32Array(processedAudio.length);
      let clippedCount = 0;
      for (let i = 0; i < processedAudio.length; i++) {
        const sample = processedAudio[i];
        // Hard limit at ±0.95 to prevent distortion
        if (sample > 0.95) {
          limitedAudio[i] = 0.95;
          clippedCount++;
        } else if (sample < -0.95) {
          limitedAudio[i] = -0.95;
          clippedCount++;
        } else {
          limitedAudio[i] = sample;
        }
      }

      if (clippedCount > 0) {
        console.warn(`Clipped ${clippedCount} samples out of ${processedAudio.length}`);
      }

      // Enqueue for playback at 24kHz
      audioPlayerRef.current.enqueueFloat32Chunk(limitedAudio, 24000);
    } catch (error) {
      console.error('Error processing audio data:', error);
    }
  }, []);

  // Start Voice Session
  const startSession = async () => {
    setErrorMsg(null);
    
    // 检查前置条件
    if (permissionStatus !== 'granted') {
      setErrorMsg('请先请求麦克风权限');
      return;
    }
    
    if (connectionTestStatus !== 'success') {
      setErrorMsg('请先测试 API 连接');
      return;
    }
    
    setConnectionStatus('connecting');
    
    try {
      // 1. Initialize Microphone first to ensure permission
      if (audioProcessorRef.current) {
        await audioProcessorRef.current.initialize();
      }

      // 2. Setup Client
      const callbacks: QwenOmniCallbacks = {
        onOpen: () => {
          console.log('Connected to Qwen-Omni');
          setConnectionStatus('connected');

          // 2.1 VAD (server_vad) session config
          clientRef.current?.updateSession({
            modalities: ['text', 'audio'],
            voice: voice,
            instructions: '你是小云，风趣幽默的好助手，请自然地进行对话。',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'gummy-realtime-v1'
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.1,
              prefix_padding_ms: 500,
              silence_duration_ms: 900
            }
          });
        },

        onSessionCreated: (sessionId) => {
          console.log('Session created:', sessionId);

          // 3. Start Capture after session is ready
          audioProcessorRef.current?.startCapture().then(() => {
            setAppStatus('listening');
          }).catch(err => {
            setErrorMsg(`Failed to start mic: ${err}`);
            setConnectionStatus('error');
          });
        },

        onSessionUpdated: () => {
           console.log('Session updated');
        },
        
        onClose: () => {
          console.log('Disconnected');
          setConnectionStatus('disconnected');
          setAppStatus('idle');
          setAudioLevel(0);
        },
        
        onError: (error, type) => {
          console.error(`Error (${type}):`, error);
          setErrorMsg(`${type || 'Error'}: ${error}`);
          // Don't necessarily disconnect on all errors, but for connection error we might
          if (type === 'WebSocket connection error' || type === 'reconnection') {
             setConnectionStatus('error');
             setAppStatus('idle');
          }
        },
        
        onResponseCreated: () => {
          setTranscript('');
          setAppStatus('processing');
        },

        onInputAudioTranscriptionCompleted: (text) => {
          setConversationHistory(prev => [...prev, { role: 'user', text }]);
        },

        onAudioTranscriptDelta: (delta) => {
          setTranscript(prev => prev + delta);
          setAppStatus('processing');
        },

        onAudioTranscriptDone: (text) => {
          setTranscript('');
          if (text) {
            setConversationHistory(prev => [...prev, { role: 'assistant', text }]);
          }
        },

        onResponseDone: () => {
          setAppStatus('listening');
        },

        onAudioData: (audioData) => {
          processAndQueueAudio(audioData);
        },

        onSpeechStarted: () => {
          // If user starts speaking while assistant audio is playing, stop local playback immediately.
          audioPlayerRef.current?.stop();
          audioPlayerRef.current?.clearQueue();
          setTranscript('');
          setAppStatus('listening');
        },

        onSpeechStopped: () => {
          console.log('Speech stopped');
        }
      };

      const apiKey = process.env.NEXT_PUBLIC_DASHSCOPE_API_KEY || '';
      if (!apiKey) {
        throw new Error('API Key is missing');
      }

      clientRef.current = new QwenOmniClient(apiKey, callbacks);
      await clientRef.current.connect();

    } catch (error: any) {
      console.error('Failed to start session:', error);
      setErrorMsg(error.message || 'Failed to start session');
      setConnectionStatus('error');
    }
  };

  // Stop Voice Session
  const stopSession = async () => {
    if (audioProcessorRef.current?.isActive()) {
      audioProcessorRef.current.stopCapture();
    }

    audioPlayerRef.current?.stop();
    audioPlayerRef.current?.clearQueue();
    audioSmootherRef.current?.reset(); // Reset audio smoother state
    setTranscript('');
    setAppStatus('idle');

    if (clientRef.current && clientRef.current.getConnectionStatus()) {
      // VAD 模式下无需 commit，直接结束会话并断开连接
      clientRef.current.finish();
      setTimeout(() => {
        clientRef.current?.disconnect();
      }, 200);
    } else {
      clientRef.current?.disconnect();
    }
  };

  const clearHistory = () => {
    setConversationHistory([]);
    setTranscript('');
  };

  const isConnected = connectionStatus === 'connected';
  const isBrowserSupported = browserCompatibility?.getUserMedia && browserCompatibility?.webAudioAPI;
  
  // 环境信息状态，只在客户端初始化
  const [environmentInfo, setEnvironmentInfo] = useState<any>(null);

  // 在客户端初始化环境信息
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setEnvironmentInfo(getEnvironmentInfo());
    }
  }, []);

  return (
    <div className="w-full h-full flex flex-col">
      {/* Main Content Area - Flex Row Layout */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Column: Controls - Fixed Width, Vertical Layout */}
        <div className="w-24 flex-shrink-0 bg-gray-900 border-r border-gray-700 p-3 overflow-y-auto flex flex-col gap-3">
           
           {/* Permission & Connection Status Panel */}
           <div className="bg-gray-800 rounded-lg p-2 border border-gray-700 flex-shrink-0">
              <div className="flex flex-col gap-2 items-center">
                 
                 {/* Step 1: Request Microphone Permission - Icon Button */}
                 {permissionStatus === 'not_requested' && (
                   <button
                     onClick={handleRequestMicrophonePermission}
                     disabled={!isBrowserSupported || isRetryingPermission}
                     title="Request Microphone Permission"
                     className={`p-2 rounded-lg flex items-center justify-center transition-all ${
                       !isBrowserSupported 
                         ? 'bg-gray-600 text-gray-500 cursor-not-allowed'
                         : 'bg-blue-600 hover:bg-blue-700 text-white'
                     }`}
                   >
                     <Shield size={16} />
                   </button>
                 )}

                 {permissionStatus === 'requesting' && (
                   <div className="p-2 rounded-lg flex items-center justify-center bg-blue-600 text-white">
                     <Loader2 className="animate-spin" size={16} />
                   </div>
                 )}

                 {(permissionStatus === 'granted' || permissionStatus === 'error' || permissionStatus === 'denied') && (
                   <div className={`p-2 rounded-lg flex items-center justify-center ${
                     permissionStatus === 'granted' 
                       ? 'bg-green-600 text-white' 
                       : 'bg-red-600 text-white'
                   }`}>
                     {permissionStatus === 'granted' ? (
                       <ShieldCheck size={16} />
                     ) : (
                       <AlertCircle size={16} />
                     )}
                   </div>
                 )}

                 {/* Step 2: Test API Connection */}
                 {permissionStatus === 'granted' && connectionTestStatus === 'not_tested' && (
                   <button
                     onClick={handleTestConnection}
                     disabled={isRetryingConnection}
                     title="Test API Connection"
                     className="p-2 rounded-lg flex items-center justify-center bg-green-600 hover:bg-green-700 text-white transition-all"
                   >
                     <Wifi size={16} />
                   </button>
                 )}

                 {connectionTestStatus === 'testing' && (
                   <div className="p-2 rounded-lg flex items-center justify-center bg-green-600 text-white">
                     <Loader2 className="animate-spin" size={16} />
                   </div>
                 )}

                 {connectionTestStatus === 'success' && (
                   <div className="p-2 rounded-lg flex items-center justify-center bg-green-600 text-white">
                     <Wifi size={16} />
                   </div>
                 )}

                 {connectionTestStatus === 'failed' && (
                   <button
                     onClick={retryConnection}
                     disabled={isRetryingConnection}
                     title="Retry Connection"
                     className="p-2 rounded-lg flex items-center justify-center bg-red-600 hover:bg-red-700 text-white transition-all"
                   >
                     <RefreshCw size={16} className={isRetryingConnection ? 'animate-spin' : ''} />
                   </button>
                 )}

                 {/* Permission Failed - Show Retry */}
                 {permissionStatus === 'denied' && (
                   <button
                     onClick={retryMicrophonePermission}
                     disabled={isRetryingPermission}
                     title="Retry Permission"
                     className="p-2 rounded-lg flex items-center justify-center bg-red-600 hover:bg-red-700 text-white transition-all"
                   >
                     <RefreshCw size={16} className={isRetryingPermission ? 'animate-spin' : ''} />
                   </button>
                 )}

                 {/* Step 3: Start Voice Session */}
                 {!isConnected && permissionStatus === 'granted' && connectionTestStatus === 'success' && (
                   <button
                     onClick={startSession}
                     disabled={connectionStatus === 'connecting'}
                     title="Start Voice Chat"
                     className={`p-2 rounded-lg flex items-center justify-center transition-all ${
                       connectionStatus === 'connecting' 
                         ? 'bg-gray-600 text-gray-500 cursor-not-allowed'
                         : 'bg-blue-600 hover:bg-blue-700 text-white'
                     }`}
                   >
                     <Mic size={16} />
                   </button>
                 )}

                 {/* Stop Voice Button */}
                 {isConnected && (
                   <button
                     onClick={stopSession}
                     title="Stop Voice Chat"
                     className="p-2 rounded-lg flex items-center justify-center bg-red-600 hover:bg-red-700 text-white transition-all"
                   >
                     <MicOff size={16} />
                   </button>
                 )}

                 {/* Divider */}
                 <div className="w-full h-px bg-gray-700 my-1"></div>

                 {/* Volume Control - Icon Button */}
                 <button 
                   onClick={() => setVolume(v => v === 0 ? 0.7 : 0)}
                   title="Mute/Unmute"
                   className="p-2 rounded-lg flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-gray-300 transition-all"
                 >
                   {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                 </button>

                 {/* Settings (Voice) - Dropdown */}
                 <select 
                   value={voice} 
                   onChange={(e) => setVoice(e.target.value)}
                   disabled={isConnected}
                   title="Select Voice"
                   className="w-full p-1.5 bg-gray-700 border border-gray-600 rounded text-xs text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 cursor-pointer"
                 >
                   <option value="Cherry">Cherry</option>
                   <option value="Harry">Harry</option>
                 </select>
              </div>
           </div>
        </div>

        {/* Right Column: Transcript & Interaction */}
        <div className="flex-1 flex flex-col bg-gray-950 border-r border-gray-700 overflow-hidden">
           
           {/* Header */}
           <div className="bg-gray-900 border-b border-gray-700 px-4 py-3 flex-shrink-0">
              <div className="flex justify-between items-center">
                <div className="text-white font-semibold text-sm flex items-center gap-2">
                  <Activity size={16} className="text-blue-400" />
                  OmniChat
                </div>
                <div className="flex items-center gap-2">
                  {connectionStatus === 'connecting' ? (
                     <Loader2 className="animate-spin text-orange-400" size={14} />
                  ) : isConnected ? (
                     <Wifi className="text-green-400" size={14} />
                  ) : (
                     <WifiOff className="text-gray-500" size={14} />
                  )}
                  <span className={`text-xs font-medium ${
                    isConnected ? 'text-green-400' : 
                    connectionStatus === 'connecting' ? 'text-orange-400' :
                    connectionStatus === 'error' ? 'text-red-400' : 'text-gray-400'
                  }`}>
                    {connectionStatus === 'connected' ? 'Connected' : 
                     connectionStatus === 'connecting' ? 'Connecting' : 
                     connectionStatus === 'error' ? 'Error' : 'Disconnected'}
                  </span>
                </div>
              </div>
           </div>

           {/* Transcript Area */}
           <div 
             ref={transcriptRef}
             className="flex-1 overflow-y-auto p-4 space-y-4"
           >
              {conversationHistory.length === 0 && !transcript && (
                 <div className="h-full flex flex-col items-center justify-center text-gray-500">
                    <Activity size={32} className="mb-2 opacity-40" />
                    <p className="text-xs">Start voice chat to see transcription</p>
                 </div>
              )}

              {conversationHistory.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                   <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                      msg.role === 'user' 
                        ? 'bg-blue-600 text-white rounded-tr-none' 
                        : 'bg-gray-800 border border-gray-700 text-gray-100 rounded-tl-none'
                   }`}>
                      {msg.text}
                   </div>
                </div>
              ))}

              {/* Current Live Transcript */}
              {transcript && (
                 <div className="flex justify-start">
                   <div className="max-w-[80%] bg-gray-800 border border-gray-700 text-gray-100 rounded-2xl rounded-tl-none px-4 py-2 text-sm">
                      <div className="flex items-center gap-2">
                         <span className="animate-pulse w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                         {transcript}
                      </div>
                   </div>
                 </div>
              )}
           </div>

           {/* Status and Actions Footer */}
           <div className="bg-gray-900 border-t border-gray-700 px-4 py-3 flex-shrink-0 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                 {isConnected && (
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-gray-400">
                        {appStatus === 'listening' && <span className="flex items-center gap-1"><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span></span>Listening</span>}
                        {appStatus === 'speaking' && <span className="flex items-center gap-1"><Play size={12} className="animate-pulse" />Speaking</span>}
                        {appStatus === 'processing' && <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" />Processing</span>}
                      </div>
                      <div className="w-px h-4 bg-gray-700"></div>
                    </div>
                 )}
              </div>

              <button 
                onClick={clearHistory}
                className="text-gray-400 hover:text-gray-200 flex items-center gap-1 text-xs transition-colors"
                title="Clear History"
              >
                <Trash2 size={12} />
              </button>

              {errorMsg && (
                <div className="text-red-400 text-xs bg-red-950/30 px-2 py-1 rounded border border-red-900/50 flex-1">
                   {errorMsg}
                </div>
              )}
           </div>
        </div>
      </div>

      {/* Debug Information Panel - Only in development */}
      {process.env.NODE_ENV === 'development' && environmentInfo && (
        <div className="bg-gray-800 text-gray-300 border-t border-gray-700 px-4 py-2 text-xs font-mono flex-shrink-0 overflow-y-auto max-h-20">
          <div className="space-y-0.5">
            <div>🔗 {environmentInfo.secure ? 'HTTPS' : 'HTTP'} | Perms: {permissionStatus} | API: {connectionTestStatus} | Net: {connectionStatus}</div>
            {connectionTestMessage && <div className="text-yellow-300">📡 {connectionTestMessage}</div>}
            {browserCompatibility && !browserCompatibility.recommended && (
              <div className="text-yellow-300">⚠️ {browserCompatibility.issues.join(', ')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
  }
