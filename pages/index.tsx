import React from 'react';
import OmniChat from '../components/OmniChat';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Live2D Model Area - Top Section */}
      <div className="flex-1 bg-gradient-to-b from-gray-100 to-gray-50 flex items-center justify-center overflow-hidden">
        <div className="text-gray-400 text-center">
          <p className="text-lg font-semibold">Live2D Model Area</p>
          <p className="text-sm mt-2">(Your Live2D model will be rendered here)</p>
        </div>
      </div>

      {/* OmniChat - Bottom Section */}
      <div className="py-8">
        <OmniChat />
      </div>
    </div>
  );
}