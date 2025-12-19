'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Mic, MicOff, Volume2, VolumeX, Wifi, WifiOff, Play, Trash2, 
  Activity, Loader2, Shield, ShieldCheck, AlertCircle, RefreshCw,
  User, Bot, MessageSquare, Settings, BarChart2, Zap, Sparkles
} from 'lucide-react';
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
    <div className="w-full max-w-6xl mx-auto my-4 md:my-8 relative z-10">
      <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/40 overflow-hidden flex flex-col md:flex-row h-[85vh] md:h-[800px] transition-all duration-300">
        
        {/* Sidebar (Left) */}
        <div className="w-full md:w-80 bg-gray-50/80 border-r border-gray-100 flex flex-col backdrop-blur-sm">
           {/* Header */}
           <div className="p-6 border-b border-gray-200/50 bg-white/50">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent flex items-center gap-2">
                <Sparkles className="text-blue-600 fill-blue-100" />
                OmniChat
              </h1>
              <p className="text-gray-500 text-xs font-medium mt-1 tracking-wide">REAL-TIME VOICE AI</p>
           </div>
           
           {/* Controls Area */}
           <div className="flex-1 p-6 space-y-6 overflow-y-auto">
              
              {/* Browser Warning */}
              {browserCompatibility && !browserCompatibility.recommended && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
                    <div className="text-sm">
                      <div className="font-semibold text-red-800 mb-1">Compatibility Issue</div>
                      <ul className="text-red-700 text-xs space-y-1">
                        {browserCompatibility.issues.map((issue, idx) => (
                          <li key={idx}>• {issue}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Status Section */}
              <div className="space-y-4">
                 <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Connection</span>
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                        isConnected ? 'bg-green-50 text-green-700 border-green-200' : 
                        connectionStatus === 'connecting' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                        connectionStatus === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-100 text-gray-500 border-gray-200'
                      }`}>
                      {connectionStatus === 'connecting' ? <Loader2 size={12} className="animate-spin" /> : 
                       isConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
                      {connectionStatus === 'connected' ? 'Online' : 
                       connectionStatus === 'connecting' ? 'Connecting' : 
                       connectionStatus === 'error' ? 'Error' : 'Offline'}
                    </div>
                 </div>

                 {isConnected && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Status</span>
                      <div className="flex items-center gap-2">
                         {appStatus === 'listening' && (
                           <span className="flex items-center gap-1.5 text-blue-600 text-xs font-semibold bg-blue-50 px-2 py-1 rounded-full border border-blue-100">
                             <span className="relative flex h-2 w-2">
                               <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                               <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                             </span>
                             Listening
                           </span>
                         )}
                         {appStatus === 'speaking' && (
                           <span className="flex items-center gap-1.5 text-indigo-600 text-xs font-semibold bg-indigo-50 px-2 py-1 rounded-full border border-indigo-100">
                             <BarChart2 size={12} className="animate-pulse" />
                             Speaking
                           </span>
                         )}
                         {appStatus === 'processing' && (
                           <span className="flex items-center gap-1.5 text-purple-600 text-xs font-semibold bg-purple-50 px-2 py-1 rounded-full border border-purple-100">
                             <Loader2 size={12} className="animate-spin" />
                             Processing
                           </span>
                         )}
                         {appStatus === 'idle' && (
                           <span className="flex items-center gap-1.5 text-gray-500 text-xs font-semibold bg-gray-100 px-2 py-1 rounded-full border border-gray-200">
                             <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                             Idle
                           </span>
                         )}
                      </div>
                    </div>
                 )}
              </div>

              {/* Setup Steps */}
              <div className="space-y-3 pt-2">
                 {/* Step 1: Mic Permission */}
                 {permissionStatus !== 'granted' && (
                    <div className="space-y-2">
                       <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Setup</div>
                       {permissionStatus === 'not_requested' && (
                         <button
                           onClick={handleRequestMicrophonePermission}
                           disabled={!isBrowserSupported || isRetryingPermission}
                           className="w-full py-2.5 px-4 rounded-xl flex items-center gap-3 bg-white border border-gray-200 text-gray-700 hover:border-blue-400 hover:text-blue-600 hover:shadow-md transition-all group text-sm font-medium"
                         >
                           <div className="p-1.5 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
                             <Shield size={16} className="text-blue-600" />
                           </div>
                           Enable Microphone
                         </button>
                       )}
                       {permissionStatus === 'denied' && (
                         <button
                           onClick={retryMicrophonePermission}
                           className="w-full py-2.5 px-4 rounded-xl flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 text-sm font-medium"
                         >
                           <RefreshCw size={16} /> Retry Permission
                         </button>
                       )}
                    </div>
                 )}

                 {/* Step 2: Test Connection */}
                 {permissionStatus === 'granted' && connectionTestStatus !== 'success' && (
                    <div className="space-y-2">
                       <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Setup</div>
                       <button
                         onClick={handleTestConnection}
                         disabled={isRetryingConnection}
                         className="w-full py-2.5 px-4 rounded-xl flex items-center gap-3 bg-white border border-gray-200 text-gray-700 hover:border-green-400 hover:text-green-600 hover:shadow-md transition-all group text-sm font-medium"
                       >
                         <div className="p-1.5 bg-green-50 rounded-lg group-hover:bg-green-100 transition-colors">
                            {isRetryingConnection ? <Loader2 size={16} className="animate-spin text-green-600"/> : <Zap size={16} className="text-green-600" />}
                         </div>
                         Test Connection
                         {connectionTestStatus === 'failed' && <span className="text-xs text-red-500 ml-auto">Failed</span>}
                       </button>
                       {connectionTestStatus === 'failed' && (
                         <div className="text-xs text-red-500 bg-red-50 p-2 rounded-lg border border-red-100">
                           {connectionTestMessage}
                         </div>
                       )}
                    </div>
                 )}
              </div>

              {/* Audio Visualizer */}
              <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
                 <div className="flex justify-between items-center mb-3">
                   <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Audio Input</span>
                   <span className={`text-xs font-mono font-medium ${audioLevel > 5 ? 'text-blue-600' : 'text-gray-400'}`}>
                     {Math.round(audioLevel)}%
                   </span>
                 </div>
                 <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex items-center">
                   <div 
                      className="h-full bg-gradient-to-r from-blue-400 to-indigo-500 transition-all duration-75 ease-out rounded-full"
                      style={{ width: `${Math.min(100, Math.max(5, audioLevel))}%`, opacity: audioLevel > 1 ? 1 : 0.3 }}
                    />
                 </div>
              </div>

              {/* Volume & Settings */}
              <div className="space-y-4">
                 <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm space-y-4">
                    <div>
                       <div className="flex justify-between items-center mb-2">
                          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Volume</label>
                          <span className="text-xs text-gray-500">{Math.round(volume * 100)}%</span>
                       </div>
                       <div className="flex items-center gap-3">
                          <button onClick={() => setVolume(v => v === 0 ? 0.7 : 0)} className="text-gray-500 hover:text-gray-700 transition-colors">
                            {volume === 0 ? <VolumeX size={18}/> : <Volume2 size={18}/>}
                          </button>
                          <input 
                            type="range" 
                            min="0" max="1" step="0.05"
                            value={volume}
                            onChange={(e) => setVolume(parseFloat(e.target.value))}
                            className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                          />
                       </div>
                    </div>
                    
                    <div className="pt-3 border-t border-gray-100">
                       <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Voice Model</label>
                       <div className="relative">
                          <Settings size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                          <select 
                            value={voice} 
                            onChange={(e) => setVoice(e.target.value)}
                            disabled={isConnected}
                            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                          >
                            <option value="Cherry">Cherry (Default)</option>
                            <option value="Harry">Harry</option>
                          </select>
                       </div>
                    </div>
                 </div>
              </div>
           </div>
           
           {/* Footer Actions */}
           <div className="p-6 bg-white border-t border-gray-100 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)] z-10">
              {!isConnected ? (
                <button
                  onClick={startSession}
                  disabled={permissionStatus !== 'granted' || connectionTestStatus !== 'success' || connectionStatus === 'connecting'}
                  className={`w-full py-4 rounded-2xl flex items-center justify-center gap-3 transition-all transform active:scale-[0.98] ${
                    permissionStatus === 'granted' && connectionTestStatus === 'success' && connectionStatus !== 'connecting'
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-200 hover:shadow-xl hover:shadow-blue-300'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {connectionStatus === 'connecting' ? (
                    <Loader2 size={24} className="animate-spin" />
                  ) : (
                    <Mic size={24} />
                  )}
                  <span className="font-bold text-lg">Start Conversation</span>
                </button>
              ) : (
                <button
                  onClick={stopSession}
                  className="w-full py-4 rounded-2xl flex items-center justify-center gap-3 bg-white border-2 border-red-100 text-red-500 hover:bg-red-50 hover:border-red-200 shadow-sm hover:shadow-md transition-all transform active:scale-[0.98]"
                >
                  <MicOff size={24} />
                  <span className="font-bold text-lg">End Session</span>
                </button>
              )}
           </div>
        </div>

        {/* Main Chat Area (Right) */}
        <div className="flex-1 flex flex-col bg-white/60 relative">
           {/* Chat Header */}
           <div className="h-16 border-b border-gray-100 flex items-center justify-between px-6 bg-white/80 backdrop-blur-md sticky top-0 z-10">
              <div className="flex items-center gap-3">
                 <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md">
                    <Bot size={18} />
                 </div>
                 <div>
                    <div className="font-bold text-gray-800 text-sm">AI Assistant</div>
                    <div className="text-xs text-green-600 flex items-center gap-1 font-medium">
                       <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                       Online
                    </div>
                 </div>
              </div>
              
              <div className="flex items-center gap-2">
                 {errorMsg && (
                   <div className="text-red-600 text-xs bg-red-50 px-3 py-1.5 rounded-full border border-red-100 flex items-center gap-1.5 animate-fade-in">
                      <AlertCircle size={12} />
                      {errorMsg}
                   </div>
                 )}
                 <button 
                   onClick={clearHistory}
                   className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                   title="Clear History"
                 >
                   <Trash2 size={18} />
                 </button>
              </div>
           </div>
           
           {/* Chat Messages */}
           <div 
             ref={transcriptRef}
             className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth"
           >
              {conversationHistory.length === 0 && !transcript && (
                 <div className="h-full flex flex-col items-center justify-center text-gray-300 select-none">
                    <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                       <MessageSquare size={40} className="text-gray-200" />
                    </div>
                    <h3 className="text-gray-900 font-semibold mb-2">Welcome to OmniChat</h3>
                    <p className="text-sm text-center max-w-xs leading-relaxed">
                       Start the conversation by connecting your microphone and saying "Hello".
                    </p>
                 </div>
              )}

              {conversationHistory.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                   <div className={`flex items-end gap-2 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm ${
                         msg.role === 'user' 
                           ? 'bg-blue-600 text-white' 
                           : 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white'
                      }`}>
                         {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                      </div>
                      
                      <div className={`px-5 py-3.5 text-sm leading-relaxed shadow-sm ${
                         msg.role === 'user' 
                           ? 'bg-blue-600 text-white rounded-2xl rounded-tr-sm' 
                           : 'bg-white border border-gray-100 text-gray-800 rounded-2xl rounded-tl-sm'
                      }`}>
                         {msg.text}
                      </div>
                   </div>
                </div>
              ))}

              {/* Current Live Transcript */}
              {transcript && (
                 <div className="flex justify-start animate-fade-in">
                   <div className="flex items-end gap-2 max-w-[85%]">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-sm flex-shrink-0">
                         <Bot size={14} />
                      </div>
                      <div className="bg-white border border-gray-100 text-gray-800 rounded-2xl rounded-tl-sm px-5 py-3.5 text-sm leading-relaxed shadow-sm">
                         <div className="flex items-center gap-2">
                            <div className="flex gap-1 h-3 items-center">
                              <span className="w-1 h-1 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                              <span className="w-1 h-1 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                              <span className="w-1 h-1 bg-indigo-500 rounded-full animate-bounce"></span>
                            </div>
                            <span className="text-gray-600">{transcript}</span>
                         </div>
                      </div>
                   </div>
                 </div>
              )}
           </div>
           
           {/* Visualizer Footer Overlay */}
           {isConnected && appStatus !== 'idle' && (
             <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none flex items-end justify-center pb-8">
               <div className="flex items-center gap-1 h-12">
                  {[...Array(12)].map((_, i) => (
                    <div 
                      key={i} 
                      className={`w-1.5 rounded-full bg-indigo-500 transition-all duration-150 ease-in-out ${
                        appStatus === 'speaking' ? 'animate-pulse' : ''
                      }`}
                      style={{ 
                        height: appStatus === 'listening' ? `${Math.max(4, audioLevel * Math.random() * 2)}px` : 
                                appStatus === 'speaking' ? `${10 + Math.random() * 30}px` : '4px',
                        opacity: 0.6 + (i % 3) * 0.2
                      }}
                    />
                  ))}
               </div>
             </div>
           )}

           {/* Debug Information Panel */}
           {process.env.NODE_ENV === 'development' && environmentInfo && (
             <div className="mx-6 mb-6 mt-2 bg-gray-50 border border-gray-200 rounded-xl p-3">
               <details className="text-xs text-gray-500">
                 <summary className="cursor-pointer font-semibold flex items-center gap-2 select-none hover:text-indigo-600 transition-colors">
                   <Activity size={14} /> Debug Information
                 </summary>
                 <div className="mt-3 grid grid-cols-2 gap-2 font-mono">
                   <div>Secure: {environmentInfo.secure ? 'Yes' : 'No'}</div>
                   <div>WebSocket: {environmentInfo.webSocketSupported ? 'Supported' : 'No'}</div>
                   <div>Mic Permission: <span className={permissionStatus === 'granted' ? 'text-green-600' : 'text-orange-600'}>{permissionStatus}</span></div>
                   <div>Connection Test: <span className={connectionTestStatus === 'success' ? 'text-green-600' : 'text-gray-500'}>{connectionTestStatus}</span></div>
                   <div>App Status: {appStatus}</div>
                   <div>Latency: {connectionLatency ? `${connectionLatency}ms` : '-'}</div>
                 </div>
               </details>
             </div>
           )}
        </div>
      </div>
    </div>
  );
}
