import React from 'react';
import { Trash2, Split } from 'lucide-react';

interface SliderViewProps {
  theme: string;
  isOwner: boolean;
  image: string | null;
  liveImage: string | null;
  liveStream: MediaStream | null;
  liveSourceType: 'image' | 'url' | 'sim';
  url: string;
  scale: number;
  sliderPosition: number;
  opacity: number;
  position: { x: number; y: number };
  videoRef: React.RefObject<HTMLVideoElement>;
  isAnalyzing: boolean;
  setImage: (img: string | null) => void;
  setUrl: (url: string) => void;
  setLiveImage: (img: string | null) => void;
  stopLiveCapture: () => void;
  setIsResizingSlider: (is: boolean) => void;
  renderDifferenceBoxes: (paneType: 'design' | 'build') => React.ReactNode;
  renderDesignSourceSelector: () => React.ReactNode;
  renderLiveSourceSelector: () => React.ReactNode;
}

export const SliderView: React.FC<SliderViewProps> = ({
  theme, isOwner, image, liveImage, liveStream, liveSourceType, url, scale,
  sliderPosition, opacity, position, videoRef, isAnalyzing,
  setImage, setUrl, setLiveImage, stopLiveCapture, setIsResizingSlider,
  renderDifferenceBoxes, renderDesignSourceSelector, renderLiveSourceSelector
}) => {
  return (
    <div className="w-full h-full relative">
      {/* Background (Build) */}
      <div className="absolute right-0 bottom-0" style={{ top: '20px', left: '20px' }}>
        <div className={`absolute bottom-2 left-2 z-30 text-[10px] uppercase font-bold tracking-widest flex items-center gap-2 ${theme === 'dark' ? 'text-white/30' : 'text-black/30'}`}>
          Build
          {isOwner && (url || liveImage || (liveSourceType === 'sim' && liveStream)) && (
            <button 
              onClick={() => {
                setUrl('');
                setLiveImage(null);
                if (liveStream) stopLiveCapture();
              }} 
              className="hover:text-rose-400 transition-colors p-1.5 -m-1.5"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
        {liveSourceType === 'url' && url ? (
          <div className="w-full h-full relative overflow-hidden">
            <iframe src={url} className="w-full h-full border-none bg-white" style={{ transform: `scale(${scale})`, transformOrigin: 'center' }} />
          </div>
        ) : (
           <div className={`w-full h-full flex items-center justify-center overflow-auto ${theme === 'dark' ? 'bg-[#0a0a0a]' : 'bg-[#e5e5e5]'}`}>
            <div className="relative inline-block" style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}>
              {liveSourceType === 'sim' && liveStream ? (
                <>
                  <video ref={videoRef} autoPlay playsInline className={`w-[390px] max-w-full h-auto transition-opacity duration-500 ${isAnalyzing ? 'opacity-50' : ''}`} />
                  {isAnalyzing && (
                    <div className="absolute inset-0 z-50 pointer-events-none overflow-hidden bg-indigo-500/5 mix-blend-screen">
                      <div className="absolute left-0 right-0 h-48 bg-gradient-to-b from-transparent via-indigo-500/10 to-indigo-500/30 border-b border-indigo-500/40 animate-scan" style={{ animationDelay: '0.2s' }} />
                    </div>
                  )}
                </>
              ) : liveImage ? (
                <>
                  <img src={liveImage} className={`w-[390px] max-w-full h-auto transition-opacity duration-500 ${isAnalyzing ? 'opacity-50' : ''}`} />
                  {isAnalyzing && (
                    <div className="absolute inset-0 z-50 pointer-events-none overflow-hidden bg-indigo-500/5 mix-blend-screen">
                      <div className="absolute left-0 right-0 h-48 bg-gradient-to-b from-transparent via-indigo-500/10 to-indigo-500/30 border-b border-indigo-500/40 animate-scan" style={{ animationDelay: '0.2s' }} />
                    </div>
                  )}
                </>
              ) : (
                renderLiveSourceSelector()
              )}
              {/* Attach marks directly to the Build image so they perfectly align without absolute coords */}
              {(liveImage || liveStream) && renderDifferenceBoxes('build')}
            </div>
          </div>
        )}
      </div>
      {/* Foreground (Design) - Clipped using clip-path to maintain alignment */}
      <div 
        className="absolute z-10 pointer-events-none"
        style={{ 
          top: '20px',
          left: '20px',
          right: 0,
          bottom: 0,
          clipPath: `inset(0 ${100 - sliderPosition}% 0 0)`,
          opacity: opacity
        }}
      >
        <div className={`absolute bottom-2 left-2 z-30 text-[10px] uppercase font-bold tracking-widest flex items-center gap-2 pointer-events-auto ${theme === 'dark' ? 'text-white/30' : 'text-black/30'}`}>
          Design
          {isOwner && image && (
            <button onClick={() => setImage(null)} className="hover:text-rose-400 transition-colors p-1.5 -m-1.5">
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="w-full h-full flex items-center justify-center overflow-hidden relative">
          {image ? (
            <div 
              className="origin-center relative"
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              }}
            >
              <img src={image} className="w-[390px] max-w-full h-auto transition-opacity duration-500" draggable={false} />
            </div>
          ) : (
            <div className="pointer-events-auto">
              {renderDesignSourceSelector()}
            </div>
          )}
        </div>
      </div>
      {/* Slider Handle */}
      <div 
        className="absolute bottom-0 z-50 w-px bg-indigo-500/30 cursor-col-resize flex items-center justify-center pointer-events-auto group"
        style={{ 
          top: '20px',
          left: `calc(20px + (100% - 20px) * ${sliderPosition} / 100)` 
        }} 
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsResizingSlider(true);
        }}
      >
        <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center -ml-[0.5px] active:scale-95 transition-all hover:bg-indigo-500 hover:border-indigo-400 hover:scale-110 shadow-sm">
          <Split className="w-4 h-4 text-white/40 group-hover:text-white" />
        </div>
      </div>
    </div>
  );
};
