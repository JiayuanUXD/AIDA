import React from 'react';
import { Trash2 } from 'lucide-react';

interface SplitViewProps {
  theme: string;
  isOwner: boolean;
  image: string | null;
  liveImage: string | null;
  liveStream: MediaStream | null;
  liveSourceType: 'image' | 'url' | 'sim';
  url: string;
  scale: number;
  showCrosshair: boolean;
  crosshairPos: { x: number; y: number };
  isAddingDiff: boolean;
  liveImageSize: { width: number; height: number };
  videoRef: React.RefObject<HTMLVideoElement>;
  isAnalyzing: boolean;
  setImage: (img: string | null) => void;
  setUrl: (url: string) => void;
  setLiveImage: (img: string | null) => void;
  stopLiveCapture: () => void;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleSplitMouseMove: (e: React.MouseEvent) => void;
  toggleCrosshair: () => void;
  renderDifferenceBoxes: (paneType: 'design' | 'build') => React.ReactNode;
  renderDesignSourceSelector: () => React.ReactNode;
  renderLiveSourceSelector: () => React.ReactNode;
}

export const SplitView: React.FC<SplitViewProps> = ({
  theme, isOwner, image, liveImage, liveStream, liveSourceType, url, scale,
  showCrosshair, crosshairPos, isAddingDiff, liveImageSize, videoRef, isAnalyzing,
  setImage, setUrl, setLiveImage, stopLiveCapture,
  handleMouseDown, handleSplitMouseMove, toggleCrosshair,
  renderDifferenceBoxes, renderDesignSourceSelector, renderLiveSourceSelector
}) => {
  return (
    <div 
      className="absolute right-0 bottom-0 flex z-50" 
      style={{ top: '20px', left: '20px' }}
      onMouseMove={handleSplitMouseMove}
      onDoubleClick={toggleCrosshair}
    >
      <div id="design-pane" className="flex-1 relative border-r border-indigo-500/30">
        <div className={`absolute bottom-2 left-2 z-30 text-[10px] uppercase font-bold tracking-widest flex items-center gap-2 ${theme === 'dark' ? 'text-white/30' : 'text-black/30'}`}>
          Design
          {isOwner && image && (
            <button onClick={() => setImage(null)} className="hover:text-rose-400 transition-colors p-1.5 -m-1.5">
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className={`w-full h-full flex items-center justify-center overflow-auto ${theme === 'dark' ? 'bg-[#0a0a0a]' : 'bg-[#e5e5e5]'}`}>
          {image ? (
            <div 
              className={`relative inline-block ${isAddingDiff ? 'cursor-crosshair' : ''}`} 
              style={{ transform: `scale(${scale})`, transformOrigin: 'center' }} 
              onMouseDown={handleMouseDown}
            >
              <img src={image} className="w-[390px] max-w-full h-auto transition-opacity duration-500" draggable={false} />
              {renderDifferenceBoxes('design')}
            </div>
          ) : (
            renderDesignSourceSelector()
          )}
        </div>
        {showCrosshair && (
          <>
            <div className="absolute top-0 bottom-0 w-px border-l border-dashed border-indigo-500/60 z-40 pointer-events-none" style={{ left: crosshairPos.x }} />
            <div className="absolute left-0 right-0 h-px border-t border-dashed border-indigo-500/60 z-40 pointer-events-none" style={{ top: crosshairPos.y }} />
            <div className="absolute z-50 bg-indigo-600 text-white text-[8px] px-1 py-0.5 rounded shadow-sm pointer-events-none" style={{ left: crosshairPos.x + 4, top: crosshairPos.y + 4 }}>
              {Math.round(crosshairPos.x)}, {Math.round(crosshairPos.y)}
            </div>
          </>
        )}
      </div>
      <div id="build-pane" className="flex-1 relative">
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
            <div 
              className={`relative inline-block ${isAddingDiff ? 'cursor-crosshair' : ''}`} 
              style={{ transform: `scale(${scale})`, transformOrigin: 'center' }} 
              onMouseDown={handleMouseDown}
            >
              {liveSourceType === 'sim' && liveStream ? (
                <>
                  <video ref={videoRef} autoPlay playsInline className={`w-[390px] max-w-full h-auto transition-opacity duration-500 ${isAnalyzing ? 'opacity-50' : ''}`} />
                  {renderDifferenceBoxes('build')}
                  {isAnalyzing && (
                    <div className="absolute inset-0 z-50 pointer-events-none overflow-hidden bg-indigo-500/5 mix-blend-screen">
                      <div className="absolute left-0 right-0 h-48 bg-gradient-to-b from-transparent via-indigo-500/10 to-indigo-500/30 border-b border-indigo-500/40 animate-scan" style={{ animationDelay: '0.2s' }} />
                    </div>
                  )}
                </>
              ) : liveImage ? (
                <>
                  <img src={liveImage} className={`w-[390px] max-w-full h-auto transition-opacity duration-500 ${isAnalyzing ? 'opacity-50' : ''}`} />
                  {renderDifferenceBoxes('build')}
                  {isAnalyzing && (
                    <div className="absolute inset-0 z-50 pointer-events-none overflow-hidden bg-indigo-500/5 mix-blend-screen">
                      <div className="absolute left-0 right-0 h-48 bg-gradient-to-b from-transparent via-indigo-500/10 to-indigo-500/30 border-b border-indigo-500/40 animate-scan" style={{ animationDelay: '0.2s' }} />
                    </div>
                  )}
                </>
              ) : (
                renderLiveSourceSelector()
              )}
            </div>
          </div>
        )}
        {showCrosshair && (
          <>
            <div className="absolute top-0 bottom-0 w-px border-l border-dashed border-indigo-500/60 z-40 pointer-events-none" style={{ left: crosshairPos.x }} />
            <div className="absolute left-0 right-0 h-px border-t border-dashed border-indigo-500/60 z-40 pointer-events-none" style={{ top: crosshairPos.y }} />
            <div className="absolute z-50 bg-indigo-600 text-white text-[8px] px-1 py-0.5 rounded shadow-sm pointer-events-none" style={{ left: crosshairPos.x + 4, top: crosshairPos.y + 4 }}>
              {Math.round(crosshairPos.x)}, {Math.round(crosshairPos.y)}
            </div>
          </>
        )}
        {/* Marks Layer for Split Mode */}
        <div className="absolute inset-0 pointer-events-none z-[60]">
          <div className="w-full h-full flex items-center justify-center overflow-hidden">
            <div 
              className="relative inline-block" 
              style={{ 
                transform: `scale(${scale})`,
                width: liveSourceType === 'image' && liveImageSize.width ? `${liveImageSize.width}px` : '100%',
                height: liveSourceType === 'image' && liveImageSize.height ? `${liveImageSize.height}px` : '100%',
              }}
            >
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
