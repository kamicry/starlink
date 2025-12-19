import React from 'react';
import OmniChat from '../components/OmniChat';

export default function Home() {
  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Live2D Model Area - Top 60% */}
      <div className="flex-1 bg-gradient-to-b from-gray-100 to-gray-50 flex items-center justify-center overflow-hidden">
        <div className="text-gray-400 text-center">
          <p className="text-lg font-semibold">Live2D Model Area</p>
          <p className="text-sm mt-2">(Your Live2D model will be rendered here)</p>
        </div>
      </div>

      {/* OmniChat - Bottom 40%, Fixed */}
      <div className="h-[40vh] bg-black/85 backdrop-blur-sm border-t border-gray-300 shadow-2xl z-10 overflow-hidden">
        <OmniChat />
      </div>
    </div>
  );
}