import React from 'react';
import Live2DModelPanel from '../components/Live2DModelPanel';
import OmniChat from '../components/OmniChat';

export default function Home() {
  const modelPath =
    process.env.NEXT_PUBLIC_LIVE2D_MODEL_PATH ||
    process.env.NEXT_PUBLIC_LIVE2D_DEFAULT_MODEL_PATH ||
    '/live2d/chara/chara.model3.json';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 pt-6 md:pt-8">
        <div className="h-[45vh] md:h-[60vh]">
          <Live2DModelPanel defaultModelPath={modelPath} />
        </div>
      </div>

      <OmniChat />
    </div>
  );
}
