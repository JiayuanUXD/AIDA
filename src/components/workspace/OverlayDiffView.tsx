import React from 'react';
import { Trash2, Zap } from 'lucide-react';

interface OverlayDiffViewProps {
  theme: string;
  isOwner: boolean;
  image: string | null;
  liveImage: string | null;
  liveStream: MediaStream | null;
  liveSourceType: 'image' | 'url' | 'sim';
  url: string;
  scale: number;
  opacity: number;
  position: { x: number; y: number };
  isVisible: boolean;
  comparisonMode: 'split' | 'slider' | 'overlay' | 'diff';
  isAddingDiff: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
  isAnalyzing: boolean;
  setImage: (img: string | null) => void;
  setUrl: (url: string) => void;
  setLiveImage: (img: string | null) => void;
  stopLiveCapture: () => void;
  handleMouseDown: (e: React.MouseEvent) => void;
  renderDifferenceBoxes: (paneType: 'design' | 'build') => React.ReactNode;
  renderDesignSourceSelector: () => React.ReactNode;
  renderLiveSourceSelector: () => React.ReactNode;
}

export const OverlayDiffView: React.FC<OverlayDiffViewProps> = ({
  theme, isOwner, image, liveImage, liveStream, liveSourceType, url, scale,
  opacity, position, isVisible, comparisonMode, isAddingDiff, videoRef, isAnalyzing,
  setImage, setUrl, setLiveImage, stopLiveCapture, handleMouseDown,
  renderDifferenceBoxes, renderDesignSourceSelector, renderLiveSourceSelector
}) => {
  return (
    <div className="absolute right-0 bottom-0 overflow-hidden" style={{ top: '20px', left: '20px' }}>
      <div className="absolute bottom-2 left-2 z-[70] flex gap-2">
        <div className={`text-[10px] uppercase font-bold tracking-widest flex items-center gap-2 ${theme === 'dark' ? 'text-white/30' : 'text-black/30'}`}>
          Design
          {isOwner && image && (
            <button onClick={() => setImage(null)} className="hover:text-rose-400 transition-colors p-1.5 -m-1.5">
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className={`text-[10px] uppercase font-bold tracking-widest flex items-center gap-2 ${theme === 'dark' ? 'text-white/30' : 'text-black/30'}`}>
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
      </div>
      {/* Background Layer & Overlay Container */}
      <div className={`w-full h-full overflow-auto ${theme === 'dark' ? 'bg-[#0a0a0a]' : 'bg-[#e5e5e5]'}`} style={{ isolation: 'isolate' }}>
        <div className="min-w-full min-h-full flex items-center justify-center relative">
          {!image && !url && !liveImage && !(liveSourceType === 'sim' && liveStream) ? (
            <div className="flex items-center justify-center gap-12 p-8 w-full h-full">
              <div className="flex-1 flex justify-center border-r border-indigo-500/20">
                {renderDesignSourceSelector()}
              </div>
              <div className="flex-1 flex justify-center">
                {renderLiveSourceSelector()}
              </div>
            </div>
          ) : (
            <>
              {/* Design Selector if no image and build source is present */}
              {!image && ((liveSourceType === 'url' && url) || (liveSourceType === 'image' && liveImage) || (liveSourceType === 'sim' && liveStream)) && (
                <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/5 backdrop-blur-[2px]">
                  {renderDesignSourceSelector()}
                </div>
              )}

              {/* Live Source Selector if no build source and design is present */}
              {image && !url && !liveImage && !(liveSourceType === 'sim' && liveStream) && (
                <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/5 backdrop-blur-[2px]">
                  {renderLiveSourceSelector()}
                </div>
              )}

              {liveSourceType === 'url' && url && (
                <div className="absolute inset-0">
                  <iframe 
                    src={url} 
                    className="w-full h-full border-none bg-white"
                    title="Live Website"
                    style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}
                  />
                  <div className="absolute inset-0 pointer-events-none z-[60]" style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}>
                    {renderDifferenceBoxes('build')}
                  </div>
                  {/* Iframe Warning Overlay */}
                  {comparisonMode === 'diff' && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-amber-500/90 text-white px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 shadow-lg backdrop-blur-sm">
                      <Zap className="w-3 h-3" />
                      Browser limitation: Iframe blending may be inaccurate
                    </div>
                  )}
                </div>
              )}

              {liveSourceType === 'image' && liveImage && (
                <div 
                  className={`relative inline-block ${isAddingDiff && isOwner ? 'cursor-crosshair' : ''}`} 
                  style={{ transform: `scale(${scale})`, transformOrigin: 'center' }} 
                >
                  <img 
                    src={liveImage} 
                    alt="Live Screenshot" 
                    draggable={false}
                    className={`w-[390px] max-w-full h-auto rounded border ${theme === 'dark' ? 'border-white/5' : 'border-black/5'} relative z-0 transition-opacity duration-500 ${isAnalyzing ? 'opacity-50' : ''}`}
                    onMouseDown={handleMouseDown}
                  />
                  {isAnalyzing && (
                    <div className="absolute inset-0 z-50 pointer-events-none overflow-hidden bg-indigo-500/5 mix-blend-screen rounded">
                      <div className="absolute left-0 right-0 h-48 bg-gradient-to-b from-transparent via-indigo-500/10 to-indigo-500/30 border-b border-indigo-500/40 animate-scan" style={{ animationDelay: '0.2s' }} />
                    </div>
                  )}
                  
                  {/* Unified Design Overlay and Marks Layer */}
                  {/* Design Overlay */}
                  {image && isVisible && (
                        <div 
                          className="absolute inset-x-0 top-0 pointer-events-none flex justify-center z-10"
                          style={{ 
                            mixBlendMode: comparisonMode === 'diff' ? 'difference' : 'normal',
                            opacity: comparisonMode === 'diff' ? 1 : opacity,
                            filter: comparisonMode === 'diff' ? 'invert(1)' : 'none'
                          }}
                        >
                          <div 
                            className="cursor-move pointer-events-auto"
                            style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
                            onMouseDown={handleMouseDown}
                          >
                            <img src={image} alt="Design Overlay" className="w-[390px] max-w-full h-auto pointer-events-none transition-opacity duration-500" draggable={false} />
                          </div>
                        </div>
                      )}
                      
                      {/* Marks Layer (Top-most inside scaled container) z-index 100 relative to this container */}
                      <div className="absolute inset-x-0 top-0 pointer-events-none z-[100] flex justify-center">
                        <div className="relative w-[390px]">
                          {renderDifferenceBoxes('build')}
                        </div>
                      </div>
                </div>
              )}

              {liveSourceType === 'sim' && liveStream && (
                <div 
                  className={`relative inline-block ${isAddingDiff && isOwner ? 'cursor-crosshair' : ''}`} 
                  style={{ transform: `scale(${scale})`, transformOrigin: 'center' }} 
                >
                  <video ref={videoRef} autoPlay playsInline className={`w-[390px] max-w-full h-auto rounded border ${theme === 'dark' ? 'border-white/10' : 'border-black/10'} relative z-0 transition-opacity duration-500 ${isAnalyzing ? 'opacity-50' : ''}`} onMouseDown={handleMouseDown} />
                  {isAnalyzing && (
                    <div className="absolute inset-0 z-50 pointer-events-none overflow-hidden bg-indigo-500/5 mix-blend-screen rounded">
                      <div className="absolute left-0 right-0 h-48 bg-gradient-to-b from-transparent via-indigo-500/10 to-indigo-500/30 border-b border-indigo-500/40 animate-scan" style={{ animationDelay: '0.2s' }} />
                    </div>
                  )}
                  
                  {/* Unified Design Overlay and Marks Layer */}
                  {/* Design Overlay */}
                  {image && isVisible && (
                        <div 
                          className="absolute inset-x-0 top-0 pointer-events-none flex justify-center z-10"
                          style={{ 
                            mixBlendMode: comparisonMode === 'diff' ? 'difference' : 'normal',
                            opacity: comparisonMode === 'diff' ? 1 : opacity,
                            filter: comparisonMode === 'diff' ? 'invert(1)' : 'none'
                          }}
                        >
                          <div 
                            className="cursor-move pointer-events-auto"
                            style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
                            onMouseDown={handleMouseDown}
                          >
                            <img src={image} alt="Design Overlay" className="w-[390px] max-w-full h-auto pointer-events-none transition-opacity duration-500" draggable={false} />
                          </div>
                        </div>
                      )}
                      
                      {/* Marks Layer (Top-most) */}
                      <div className="absolute inset-x-0 top-0 pointer-events-none z-[100] flex justify-center">
                        <div className="relative w-[390px]">
                          {renderDifferenceBoxes('build')}
                        </div>
                      </div>
                </div>
              )}

              {/* Iframe Support (Legacy separate structure due to viewport filling) */}
              {liveSourceType === 'url' && url && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-[100]">
                  <div className="relative origin-center pointer-events-none flex flex-col items-center justify-start h-full pt-[20px]" style={{ transform: `scale(${scale})`, width: '390px' }}>
                     {/* Design Overlay for Iframe */}
                     {image && isVisible && (
                        <div 
                          className="absolute inset-x-0 top-0 pointer-events-none flex justify-center z-10"
                          style={{ 
                            mixBlendMode: comparisonMode === 'diff' ? 'difference' : 'normal',
                            opacity: comparisonMode === 'diff' ? 1 : opacity,
                            filter: comparisonMode === 'diff' ? 'invert(1)' : 'none'
                          }}
                        >
                          <div 
                            className="cursor-move pointer-events-auto"
                            style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
                            onMouseDown={handleMouseDown}
                          >
                            <img src={image} alt="Design Overlay" className="w-[390px] max-w-full h-auto pointer-events-none transition-opacity duration-500" draggable={false} />
                          </div>
                        </div>
                      )}
                      
                      {/* Marks for iframe */}
                      <div className="absolute inset-x-0 top-0 z-[100] pointer-events-none">
                        {renderDifferenceBoxes('build')}
                      </div>
                  </div>
                </div>
              )}

            </>
          )}
        </div>
      </div>
    </div>
  );
};
