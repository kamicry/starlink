import React from 'react';
import OmniChat from '../components/OmniChat';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-4 md:p-8">
      <OmniChat />
    </div>
  );
}