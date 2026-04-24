import React from 'react';
import { ChevronLeft, Sparkles, Moon, Sun, ListChecks, Loader2, Cloud, RefreshCw, AlertCircle, Copy, User as UserIcon, LogIn } from 'lucide-react';
import { User } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';

interface HeaderProps {
  theme: string;
  navigate: (path: string) => void;
  projectName: string;
  isEditingName: boolean;
  setIsEditingName: (val: boolean) => void;
  tempName: string;
  setTempName: (val: string) => void;
  handleNameSave: () => void;
  isOwner: boolean;
  saveStatus: string;
  comparisonMode: string;
  setComparisonMode: (mode: 'split' | 'slider' | 'overlay' | 'diff') => void;
  isSaving: boolean;
  showRoundsPanel: boolean;
  setShowRoundsPanel: (val: boolean) => void;
  roundsLength: number;
  createNewRound: () => void;
  isCreatingRound: boolean;
  canSubmitRound: boolean;
  image: string | null;
  liveImage: string | null;
  differencesLength: number;
  user: User | null;
  forkProject: () => void;
  setShowAuthModal: (val: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({
  theme, navigate, projectName, isEditingName, setIsEditingName,
  tempName, setTempName, handleNameSave, isOwner, saveStatus,
  comparisonMode, setComparisonMode, isSaving,
  showRoundsPanel, setShowRoundsPanel, roundsLength, createNewRound, 
  isCreatingRound, canSubmitRound, image, liveImage, differencesLength,
  user, forkProject, setShowAuthModal
}) => {
  const [showSavedMsg, setShowSavedMsg] = React.useState(false);

  React.useEffect(() => {
    if (saveStatus === 'saved') {
      setShowSavedMsg(true);
      const timer = setTimeout(() => setShowSavedMsg(false), 1000);
      return () => clearTimeout(timer);
    } else {
      setShowSavedMsg(false);
    }
  }, [saveStatus]);

  return (
    <header className={`h-16 shrink-0 border-b flex items-center justify-between px-6 z-[150] transition-colors duration-200 relative ${
      theme === 'dark' ? 'bg-[#1e1e1e] border-[#383838]' : 'bg-white border-gray-200 shadow-sm'
    }`}>
      <div className="flex items-center gap-1">
        <button 
          onClick={() => navigate('/')}
          className={`p-1 rounded-xl transition-all flex items-center group ${
            theme === 'dark' 
              ? 'text-gray-400 hover:text-white hover:bg-[#2c2c2c]' 
              : 'text-gray-500 hover:text-indigo-600 hover:bg-gray-50'
          }`}
          title="Back to Projects"
        >
          <ChevronLeft className="w-7 h-7 transition-transform group-hover:-translate-x-0.5" />
        </button>
        
        {/* Editable Title */}
        <div className="flex items-center gap-0.5">
          {isEditingName ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="text"
                maxLength={100}
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onBlur={handleNameSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleNameSave();
                  if (e.key === 'Escape') {
                    setIsEditingName(false);
                    setTempName(projectName);
                  }
                }}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 border transition-all ${
                  theme === 'dark' ? 'bg-[#2c2c2c] border-[#383838] text-white' : 'bg-gray-50 border-gray-200 text-black'
                }`}
              />
            </div>
          ) : (
            <button 
              onDoubleClick={() => isOwner && setIsEditingName(true)}
              disabled={!isOwner}
              className={`group flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
                !isOwner ? 'cursor-default' : theme === 'dark' ? 'hover:bg-[#2c2c2c]' : 'hover:bg-gray-50'
              }`}
              title={!isOwner ? "You don't have permission to edit this project's name" : "Double-click to Edit Project Name"}
            >
              <span className="text-sm font-bold tracking-tight">{projectName}</span>
              {!isOwner && (
                <span className="px-1.5 py-0.5 rounded bg-gray-500/10 text-gray-500 text-[10px] font-bold uppercase tracking-wider border border-gray-500/20">
                  Read Only
                </span>
              )}
              {isOwner && <span className="sr-only">Edit</span>}
            </button>
          )}

          {/* Minimal Cloud Sync Indicator */}
          <div className={`flex items-center transition-all ${isEditingName ? 'ml-2' : '-ml-1'}`}>
            <AnimatePresence>
              {isOwner && (saveStatus !== 'saved' || showSavedMsg) && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center transition-all duration-300"
                  title={
                    saveStatus === 'saving' ? 'Saving changes...' :
                    saveStatus === 'saved' ? 'All changes saved' :
                    saveStatus === 'unsaved' ? 'Unsaved changes' : 'Error saving'
                  }
                >
                  {saveStatus === 'saving' ? (
                    <RefreshCw className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
                  ) : saveStatus === 'saved' ? (
                    <Cloud className="w-3.5 h-3.5 text-emerald-500" />
                  ) : saveStatus === 'unsaved' ? (
                    <Cloud className="w-3.5 h-3.5 text-amber-500 opacity-60" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Centered Comparison Modes - Fully Centered */}
      <div className="absolute left-0 right-0 flex justify-center pointer-events-none">
        <div className={`flex items-center gap-1 p-1 rounded-2xl transition-colors duration-200 pointer-events-auto ${
          theme === 'dark' ? 'bg-[#2c2c2c]' : 'bg-[#f0f0f5]'
        }`}>
          <button 
            onClick={() => setComparisonMode('split')}
            className={`px-4 py-1.5 rounded-xl text-[13px] font-semibold transition-all ${
              comparisonMode === 'split'
                ? 'bg-white text-indigo-600 shadow-sm' 
                : theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Split
          </button>
          <button 
            onClick={() => setComparisonMode('overlay')}
            className={`px-4 py-1.5 rounded-xl text-[13px] font-semibold transition-all ${
              comparisonMode === 'overlay' 
                ? 'bg-white text-indigo-600 shadow-sm' 
                : theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Overlay
          </button>
          <button 
            onClick={() => setComparisonMode('slider')}
            className={`px-4 py-1.5 rounded-xl text-[13px] font-semibold transition-all ${
              comparisonMode === 'slider' 
                ? 'bg-white text-indigo-600 shadow-sm' 
                : theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Slider
          </button>
          <button 
            onClick={() => setComparisonMode('diff')}
            className={`px-4 py-1.5 flex items-center gap-1.5 rounded-xl text-[13px] font-semibold transition-all ${
              comparisonMode === 'diff' 
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/20' 
                : theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Diff
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* User Status / Auth CTA */}
        <div className="flex items-center gap-2 mr-2">
          {user?.isAnonymous ? (
            <button 
              onClick={() => setShowAuthModal(true)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${
                theme === 'dark' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/20' : 'bg-amber-50 text-amber-700 border border-amber-100 hover:bg-amber-100'
              }`}
            >
              <UserIcon className="w-3 h-3" />
              Guest Session · Sign In
            </button>
          ) : !user ? (
            <button 
              onClick={() => setShowAuthModal(true)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${
                theme === 'dark' ? 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 hover:bg-indigo-500/20' : 'bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100'
              }`}
            >
              <LogIn className="w-3 h-3" />
              Sign In
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          {!isOwner && (
            <button 
              onClick={() => forkProject()}
              title="Duplicate this project to your workspace to edit"
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                theme === 'dark' ? 'bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600/20' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
              }`}
            >
              <Copy className="w-4 h-4" />
              <span>Fork</span>
            </button>
          )}

          {(roundsLength > 0 || differencesLength > 0) && (
            <button 
              onClick={() => setShowRoundsPanel(!showRoundsPanel)}
              title="Rounds"
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                showRoundsPanel 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' 
                  : (theme === 'dark' ? 'bg-[#2c2c2c] text-gray-400 hover:text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')
              }`}
            >
              <ListChecks className="w-4 h-4" />
              {roundsLength > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                  showRoundsPanel ? 'bg-white/20' : 'bg-indigo-100 text-indigo-600'
                }`}>
                  {roundsLength}
                </span>
              )}
            </button>
          )}

          {isOwner && differencesLength > 0 && (
            <button 
              onClick={() => createNewRound()}
              disabled={!canSubmitRound}
              title={
                isCreatingRound 
                  ? "Creating round..." 
                  : !image || !liveImage 
                    ? "Please upload a design and capture a snapshot first." 
                    : "Submit round"
              }
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                theme === 'dark' 
                  ? 'bg-[#2c2c2c] text-gray-400 hover:text-white border border-white/5' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'
              }`}
            >
              {isCreatingRound && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Submit</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

