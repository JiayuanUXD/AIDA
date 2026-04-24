import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Mail, Lock, QrCode, ArrowRight } from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup } from 'firebase/auth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'wechat'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
        onClose();
      } else if (mode === 'register') {
        await createUserWithEmailAndPassword(auth, email, password);
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Google login failed');
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden relative"
        >
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors z-10"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="p-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Create an account' : 'WeChat Login'}
              </h2>
              <p className="text-sm text-gray-500">
                {mode === 'login' ? 'Enter your details to access your account' : 
                 mode === 'register' ? 'Sign up to start managing your projects' : 
                 'Scan the QR code with WeChat to log in'}
              </p>
            </div>

            {error && (
              <div className="mb-6 p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100">
                {error}
              </div>
            )}

            {mode === 'wechat' ? (
              <div className="flex flex-col items-center justify-center py-4">
                <div className="w-48 h-48 bg-gray-100 rounded-2xl flex items-center justify-center mb-6 border-2 border-dashed border-gray-300 relative overflow-hidden group">
                  <QrCode className="w-16 h-16 text-gray-400 group-hover:scale-110 transition-transform" />
                  <div className="absolute inset-0 bg-black/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-xs font-bold text-gray-600 bg-white px-3 py-1 rounded-full shadow-sm">Simulated QR</span>
                  </div>
                </div>
                <p className="text-sm text-gray-500 mb-6 text-center">
                  Please use WeChat to scan the QR code.<br/>
                  <span className="text-xs text-gray-400">(Note: This is a simulated UI for WeChat login)</span>
                </p>
                <button 
                  onClick={() => setMode('login')}
                  className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  Back to Email Login
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input 
                      type="email" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 focus:border-indigo-500 focus:bg-white rounded-xl outline-none transition-all text-sm"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input 
                      type="password" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 focus:border-indigo-500 focus:bg-white rounded-xl outline-none transition-all text-sm"
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {loading ? 'Processing...' : mode === 'login' ? 'Sign In' : 'Sign Up'}
                  {!loading && <ArrowRight className="w-4 h-4" />}
                </button>
              </form>
            )}

            {mode !== 'wechat' && (
              <>
                <div className="mt-6 flex items-center gap-4">
                  <div className="flex-1 h-px bg-gray-200"></div>
                  <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">Or continue with</span>
                  <div className="flex-1 h-px bg-gray-200"></div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  <button 
                    onClick={handleGoogleLogin}
                    type="button"
                    className="flex items-center justify-center gap-2 py-2.5 border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    <span className="text-sm font-medium text-gray-700">Google</span>
                  </button>
                  <button 
                    onClick={() => setMode('wechat')}
                    type="button"
                    className="flex items-center justify-center gap-2 py-2.5 border border-gray-200 hover:bg-[#07C160]/5 hover:border-[#07C160]/30 rounded-xl transition-colors group"
                  >
                    <svg className="w-5 h-5 text-[#07C160]" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8.25 2.25C3.693 2.25 0 5.412 0 9.31c0 2.146 1.137 4.068 2.923 5.358-.235.877-.733 2.19-.75 2.246-.052.164.04.28.188.234.148-.046 2.373-.96 3.468-1.558 0 .002.002.002.004.002.77.215 1.58.328 2.417.328 4.557 0 8.25-3.162 8.25-7.06 0-3.898-3.693-7.06-8.25-7.06zm-2.25 4.5c.62 0 1.125.505 1.125 1.125S6.62 9 6 9s-1.125-.505-1.125-1.125S5.38 6.75 6 6.75zm4.5 0c.62 0 1.125.505 1.125 1.125S11.12 9 10.5 9s-1.125-.505-1.125-1.125S9.88 6.75 10.5 6.75zm6.75 1.5c4.142 0 7.5 2.865 7.5 6.398 0 1.945-1.034 3.687-2.657 4.856-.214.795-.666 1.985-.682 2.036-.047.148.036.254.17.212.135-.042 2.157-.87 3.153-1.412.7.195 1.436.297 2.197.297 4.142 0 7.5-2.865 7.5-6.398 0-3.533-3.358-6.398-7.5-6.398-1.01 0-1.97.17-2.865.48-.363-1.78-1.87-3.23-3.816-4.07zM15 11.25c.414 0 .75.336.75.75s-.336.75-.75.75-.75-.336-.75-.75.336-.75.75-.75zm4.5 0c.414 0 .75.336.75.75s-.336.75-.75.75-.75-.336-.75-.75.336-.75.75-.75z"/>
                    </svg>
                    <span className="text-sm font-medium text-gray-700 group-hover:text-[#07C160]">WeChat</span>
                  </button>
                </div>
              </>
            )}

            {mode !== 'wechat' && (
              <div className="mt-8 text-center">
                <p className="text-sm text-gray-500">
                  {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
                  <button 
                    onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                    className="text-indigo-600 hover:text-indigo-700 font-medium hover:underline"
                  >
                    {mode === 'login' ? 'Sign up' : 'Sign in'}
                  </button>
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
