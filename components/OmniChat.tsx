'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react';
import { QwenOmniClient, QwenOmniCallbacks } from '../lib/qwen-omni-client';
import { createAudioContext, calculateAudioLevel } from '../lib/utils';

export default function OmniChat() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [conversationHistory, setConversationHistory] = useState<string[]>([]);
  
  const clientRef = useRef<QwenOmniClient | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Initialize Qwen-Omni client
  useEffect(() => {
    const callbacks: QwenOmniCallbacks = {
      onOpen: () => {
        console.log('Connected to Qwen-Omni service');
        setIsConnected(true);
      },
      
      onClose: () => {
        console.log('Disconnected from service');
        setIsConnected(false);
      },
      
      onError: (error, type) => {
        console.error(`Error (${type}):`, error);
        setIsConnected(false);
      },
      
      onSessionCreated: (sessionId) => {
        console.log('Session created:', sessionId);
      },
      
      onSpeechStarted: () => {
        console.log('Speech started detected');
      },
      
      onSpeechStopped: () => {
        console.log('Speech stopped detected');
      },
      
      onAudioTranscriptDelta: (delta) => {
        setTranscript(prev => prev + delta);
      },
      
      onAudioTranscriptDone: (text) => {
        console.log('Final transcript:', text);
        setTranscript(text);
        setConversationHistory(prev => [...prev, `User: ${text}`]);
      },
      
      onAudioData: (audioData) => {
        console.log('Received audio data:', audioData.byteLength, 'bytes');
        // Play the received audio
        playAudioData(audioData);
      },
      
      onResponseDone: () => {
        console.log('Response completed');
      }
    };

    const apiKey = process.env.NEXT_PUBLIC_DASHSCOPE_API_KEY || 'your_api_key_here';
    clientRef.current = new QwenOmniClient(apiKey, callbacks);
    
    // Auto-connect
    clientRef.current.connect().catch(console.error);
    
    return () => {
      clientRef.current?.disconnect();
    };
  }, []);

  // Start recording audio
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      
      audioContextRef.current = createAudioContext();
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        audioBlob.arrayBuffer().then(buffer => {
          clientRef.current?.appendAudio(buffer);
          clientRef.current?.commit();
        });
        
        // Clean up
        stream.getTracks().forEach(track => track.stop());
      };
      
      // Monitor audio levels
      const monitorAudioLevel = () => {
        if (isRecording && audioContextRef.current) {
          const analyser = audioContextRef.current.createAnalyser();
          const source = audioContextRef.current.createMediaStreamSource(stream);
          source.connect(analyser);
          analyser.fftSize = 256;
          const bufferLength = analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);
          analyser.getByteFrequencyData(dataArray);
          
          const level = calculateAudioLevel(Float32Array.from(dataArray));
          setAudioLevel(level);
          
          if (isRecording) {
            requestAnimationFrame(monitorAudioLevel);
          }
        }
      };
      
      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      monitorAudioLevel();
      
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setAudioLevel(0);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // Play audio data
  const playAudioData = (audioData: ArrayBuffer) => {
    try {
      const audioContext = new AudioContext();
      audioContext.decodeAudioData(audioData).then(audioBuffer => {
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start();
        
        setIsPlaying(true);
        source.onended = () => setIsPlaying(false);
      });
    } catch (error) {
      console.error('Error playing audio:', error);
    }
  };

  // Manual play/pause
  const togglePlayback = () => {
    setIsPlaying(!isPlaying);
  };

  // Finish session
  const finishSession = () => {
    clientRef.current?.finish();
  };

  return (
    <div className="omni-chat-container min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Qwen-Omni Voice Chat</h1>
          <p className="text-gray-600">Real-time AI voice conversation with Qwen-Omni</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Panel - Controls */}
          <div className="space-y-6">
            {/* Connection Status */}
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Connection</h2>
                <div className="flex items-center space-x-2">
                  {isConnected ? (
                    <Wifi className="text-green-500" size={20} />
                  ) : (
                    <WifiOff className="text-red-500" size={20} />
                  )}
                  <span className={`text-sm ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
                    {isConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
              </div>
              
              {isConnected && (
                <div className="text-sm text-gray-600">
                  Session active with Qwen-Omni Realtime API
                </div>
              )}
            </div>

            {/* Audio Visualizer */}
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-4">Audio Level</h3>
              <div className="w-full bg-gray-200 rounded-full h-4 mb-2">
                <div 
                  className={`h-4 rounded-full transition-all duration-100 ${
                    isRecording ? 'bg-red-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${audioLevel}%` }}
                />
              </div>
              <div className="text-center text-sm text-gray-500">
                {isRecording ? 'Listening and processing...' : 'Ready to record'}
              </div>
            </div>

            {/* Control Buttons */}
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-4">Controls</h3>
              <div className="flex justify-center space-x-6">
                <button
                  onClick={toggleRecording}
                  disabled={!isConnected}
                  className={`flex items-center justify-center w-20 h-20 rounded-full transition-all duration-200 ${
                    isRecording
                      ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
                      : isConnected
                      ? 'bg-blue-500 hover:bg-blue-600 text-white'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {isRecording ? <MicOff size={32} /> : <Mic size={32} />}
                </button>

                <button
                  onClick={finishSession}
                  disabled={!isConnected}
                  className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Finish
                </button>
              </div>
            </div>

            {/* Status */}
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Status</span>
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${
                    isRecording ? 'bg-red-500 animate-pulse' : 
                    isPlaying ? 'bg-green-500 animate-pulse' : 
                    isConnected ? 'bg-green-500' : 'bg-gray-300'
                  }`} />
                  <span className="text-sm text-gray-600">
                    {isRecording ? 'Recording' : 
                     isPlaying ? 'Playing' : 
                     isConnected ? 'Ready' : 'Disconnected'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel - Conversation */}
          <div className="space-y-6">
            {/* Current Transcript */}
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-4">Live Transcript</h3>
              <div className="min-h-[100px] p-4 bg-gray-50 rounded border">
                {transcript || (
                  <span className="text-gray-400 italic">
                    Start speaking to see the transcript here...
                  </span>
                )}
              </div>
            </div>

            {/* Conversation History */}
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-4">Conversation</h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {conversationHistory.length === 0 ? (
                  <div className="text-gray-400 italic text-center py-8">
                    No conversation yet. Start speaking to begin!
                  </div>
                ) : (
                  conversationHistory.map((message, index) => (
                    <div
                      key={index}
                      className="p-3 bg-gray-50 rounded-lg"
                    >
                      {message}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Connection Info */}
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <h4 className="font-semibold mb-2">Session Info</h4>
              <div className="text-sm text-gray-600 space-y-1">
                <div>Model: qwen3-omni-flash-realtime</div>
                <div>Voice: Cherry</div>
                <div>Audio Format: PCM16 → PCM24</div>
                <div>Modalities: Text + Audio</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}