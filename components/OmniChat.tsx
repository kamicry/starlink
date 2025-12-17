'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Wifi, WifiOff, Play, Pause, Trash2, Activity, Loader2 } from 'lucide-react';
import { QwenOmniClient, QwenOmniCallbacks } from '../lib/qwen-omni-client';
import { PCMDecoder } from '../lib/audio/pcm-decoder';
import { AudioPlayer } from '../lib/audio/audio-player';
import { AudioProcessor } from '../lib/audio/audio-processor';

// Types for component status
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type AppStatus = 'idle' | 'listening' | 'processing' | 'speaking';

export default function OmniChat() {
  // Application State
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [appStatus, setAppStatus] = useState<AppStatus>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [conversationHistory, setConversationHistory] = useState<{role: 'user' | 'assistant', text: string}[]>([]);
  const [volume, setVolume] = useState(0.7);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [voice, setVoice] = useState('Cherry');

  // Refs for instances
  const clientRef = useRef<QwenOmniClient | null>(null);
  const audioProcessorRef = useRef<AudioProcessor | null>(null);
  const pcmDecoderRef = useRef<PCMDecoder | null>(null);
  const audioPlayerRef = useRef<AudioPlayer | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  
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
          bitDepth: 24
        });

        // Initialize Audio Player
        audioPlayerRef.current = new AudioPlayer({
          sampleRate: 24000, // Match decoder sample rate
          channels: 1,
          volume: volume,
          autoPlay: false,
          onPlay: () => {
            setAppStatus('speaking');
            setIsPaused(false);
          },
          onPause: () => {
            setIsPaused(true);
          },
          onEnded: () => {
            if (connectionStatus === 'connected') {
              setAppStatus('idle'); // Or back to listening if we were in continuous mode
            }
            setIsPaused(false);
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

  // Process and Queue Audio Logic
  const processAndQueueAudio = useCallback((audioData: ArrayBuffer) => {
    if (!pcmDecoderRef.current || !audioPlayerRef.current) return;

    try {
      // Decode PCM24
      const float32Audio = pcmDecoderRef.current.decodePCM(audioData, 24);
      
      if (float32Audio.length > 0) {
        // Create AudioBuffer
        const playbackBuffer = pcmDecoderRef.current.createAudioBuffer(float32Audio);
        
        // Add to queue
        audioPlayerRef.current.addToQueue(playbackBuffer);
        
        // Auto-play if not playing
        const status = audioPlayerRef.current.getStatus();
        if (!status.isPlaying && !isPaused && status.queueLength === 1) {
          audioPlayerRef.current.play().catch(e => console.error("Auto-play failed", e));
        }
      }
    } catch (error) {
      console.error('Error processing audio data:', error);
    }
  }, [isPaused]);

  // Start Voice Session
  const startSession = async () => {
    setErrorMsg(null);
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
          
          // 2.1 Update Session immediately after connection
          clientRef.current?.updateSession({
            voice: voice,
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm24',
            instructions: 'You are a helpful AI assistant.'
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
        
        onAudioTranscriptDelta: (delta) => {
          setTranscript(prev => prev + delta);
          setAppStatus('processing');
        },
        
        onAudioTranscriptDone: (text) => {
           // Move current transcript to history
           setTranscript('');
           setConversationHistory(prev => [...prev, { role: 'assistant', text }]);
        },

        onAudioData: (audioData) => {
          // Process audio for playback
          processAndQueueAudio(audioData);
        },
        
        onSpeechStarted: () => {
           // User started speaking
           console.log("Speech started");
        },
        
        onSpeechStopped: () => {
           // User stopped speaking
           console.log("Speech stopped");
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
    
    // Commit remaining audio
    if (clientRef.current && clientRef.current.getConnectionStatus()) {
       clientRef.current.commit();
       // We don't disconnect immediately to allow pending audio responses to finish
       // But based on ticket requirements: "4. 断开连接"
       // Let's give it a short delay or just disconnect if the user wants to "Stop"
       
       // For a true "Stop" button in a UI, it usually means "I want to stop everything".
       // So we will disconnect.
       setTimeout(() => {
         clientRef.current?.disconnect();
         audioPlayerRef.current?.stop();
         audioPlayerRef.current?.clearQueue();
       }, 500);
    } else {
        clientRef.current?.disconnect();
    }
  };

  const clearHistory = () => {
    setConversationHistory([]);
    setTranscript('');
  };

  const isConnected = connectionStatus === 'connected';

  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-6 bg-white rounded-xl shadow-lg my-8">
      {/* Header */}
      <header className="flex justify-between items-center mb-8 border-b pb-4">
        <div>
           <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
             <Activity className="text-blue-600" />
             OmniChat
           </h1>
           <p className="text-gray-500 text-sm mt-1">Real-time Voice Interaction</p>
        </div>
        
        {/* Connection Indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-full border">
          {connectionStatus === 'connecting' ? (
             <Loader2 className="animate-spin text-orange-500" size={16} />
          ) : isConnected ? (
             <Wifi className="text-green-500" size={16} />
          ) : (
             <WifiOff className="text-gray-400" size={16} />
          )}
          <span className={`text-sm font-medium ${
            isConnected ? 'text-green-600' : 
            connectionStatus === 'connecting' ? 'text-orange-600' :
            connectionStatus === 'error' ? 'text-red-600' : 'text-gray-500'
          }`}>
            {connectionStatus === 'connected' ? 'Connected' : 
             connectionStatus === 'connecting' ? 'Connecting...' : 
             connectionStatus === 'error' ? 'Error' : 'Disconnected'}
          </span>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left Column: Controls */}
        <div className="md:col-span-1 space-y-6">
           
           {/* Voice Control Panel */}
           <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
              <div className="flex flex-col gap-4">
                 {/* Start/Stop Button */}
                 {!isConnected ? (
                   <button
                     onClick={startSession}
                     disabled={connectionStatus === 'connecting'}
                     className={`w-full py-4 rounded-xl flex flex-col items-center justify-center gap-2 transition-all ${
                       connectionStatus === 'connecting' 
                         ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                         : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg'
                     }`}
                   >
                     <Mic size={24} />
                     <span className="font-semibold">Start Voice</span>
                   </button>
                 ) : (
                   <button
                     onClick={stopSession}
                     className="w-full py-4 rounded-xl flex flex-col items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white shadow-md hover:shadow-lg transition-all"
                   >
                     <MicOff size={24} />
                     <span className="font-semibold">Stop Voice</span>
                   </button>
                 )}

                 {/* Status Detail */}
                 {isConnected && (
                    <div className="text-center py-2 bg-white rounded-lg border border-gray-100">
                      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Status</div>
                      <div className="font-medium text-blue-600 capitalize flex items-center justify-center gap-2">
                        {appStatus === 'listening' && <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span></span>}
                        {appStatus === 'speaking' && <Play size={14} className="animate-pulse" />}
                        {appStatus}
                      </div>
                    </div>
                 )}
              </div>
           </div>

           {/* Audio Visualizer / Level */}
           <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-gray-500">MICROPHONE</span>
                <span className="text-xs text-gray-400">{Math.round(audioLevel)}%</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                   className="h-full bg-blue-500 transition-all duration-75"
                   style={{ width: `${audioLevel}%` }}
                />
              </div>
           </div>

           {/* Volume Control */}
           <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
              <div className="flex items-center gap-3">
                 <button onClick={() => setVolume(v => v === 0 ? 0.7 : 0)}>
                   {volume === 0 ? <VolumeX size={18} className="text-gray-400"/> : <Volume2 size={18} className="text-gray-600"/>}
                 </button>
                 <input 
                   type="range" 
                   min="0" max="1" step="0.05"
                   value={volume}
                   onChange={(e) => setVolume(parseFloat(e.target.value))}
                   className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                 />
              </div>
           </div>

           {/* Settings (Voice) */}
           <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
              <label className="block text-xs font-semibold text-gray-500 mb-2">VOICE</label>
              <select 
                value={voice} 
                onChange={(e) => setVoice(e.target.value)}
                disabled={isConnected}
                className="w-full p-2 bg-white border border-gray-200 rounded-md text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <option value="Cherry">Cherry (Default)</option>
                <option value="Harry">Harry</option>
              </select>
           </div>
        </div>

        {/* Right Column: Transcript & Interaction */}
        <div className="md:col-span-2 flex flex-col h-[500px]">
           
           {/* Transcript Area */}
           <div 
             ref={transcriptRef}
             className="flex-1 bg-gray-50 rounded-xl border border-gray-200 p-4 overflow-y-auto space-y-4"
           >
              {conversationHistory.length === 0 && !transcript && (
                 <div className="h-full flex flex-col items-center justify-center text-gray-400">
                    <Activity size={48} className="mb-4 opacity-20" />
                    <p>Start voice chat to see transcription</p>
                 </div>
              )}

              {conversationHistory.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                   <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                      msg.role === 'user' 
                        ? 'bg-blue-600 text-white rounded-tr-none' 
                        : 'bg-white border border-gray-200 text-gray-800 rounded-tl-none shadow-sm'
                   }`}>
                      {msg.text}
                   </div>
                </div>
              ))}

              {/* Current Live Transcript */}
              {transcript && (
                 <div className="flex justify-start">
                   <div className="max-w-[80%] bg-white border border-gray-200 text-gray-800 rounded-2xl rounded-tl-none shadow-sm px-4 py-2 text-sm">
                      <div className="flex items-center gap-2">
                         <span className="animate-pulse w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                         {transcript}
                      </div>
                   </div>
                 </div>
              )}
           </div>

           {/* Actions Footer */}
           <div className="mt-4 flex justify-between items-center">
              <button 
                onClick={clearHistory}
                className="text-gray-400 hover:text-red-500 flex items-center gap-1 text-sm transition-colors"
              >
                <Trash2 size={14} /> Clear History
              </button>

              {errorMsg && (
                <div className="text-red-500 text-sm bg-red-50 px-3 py-1 rounded-full border border-red-100 animate-fade-in">
                   {errorMsg}
                </div>
              )}
           </div>

        </div>
      </div>
    </div>
  );
}
