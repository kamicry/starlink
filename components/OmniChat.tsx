'use client';

import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';

export default function OmniChat() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  const toggleRecording = () => {
    setIsRecording(!isRecording);
  };

  const togglePlayback = () => {
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="omni-chat-container">
      <header className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Starlink Voice Chat</h1>
        <p className="text-gray-600">Real-time AI voice conversation</p>
      </header>

      <div className="flex flex-col items-center space-y-8">
        {/* Audio Visualizer */}
        <div className="w-full max-w-md">
          <div className="audio-visualizer" style={{ width: `${audioLevel}%` }} />
          <div className="mt-2 text-center text-sm text-gray-500">
            {isRecording ? 'Listening...' : 'Click to start recording'}
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex space-x-6">
          <button
            onClick={toggleRecording}
            className={`flex items-center justify-center w-16 h-16 rounded-full transition-all duration-200 ${
              isRecording
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
          >
            {isRecording ? <MicOff size={24} /> : <Mic size={24} />}
          </button>

          <button
            onClick={togglePlayback}
            disabled={!isPlaying}
            className={`flex items-center justify-center w-16 h-16 rounded-full transition-all duration-200 ${
              isPlaying
                ? 'bg-green-500 hover:bg-green-600 text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Volume2 size={24} />
          </button>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${isRecording ? 'bg-red-500 pulse' : 'bg-gray-300'}`} />
          <span className="text-sm text-gray-600">
            {isRecording ? 'Recording' : 'Ready'}
          </span>
        </div>
      </div>
    </div>
  );
}