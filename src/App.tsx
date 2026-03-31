import React, { useState, useEffect, Component, ErrorInfo } from 'react';
import { 
  Upload, Eye, EyeOff, ZoomIn, ZoomOut, SlidersHorizontal, Layers, RotateCcw,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical, Link as LinkIcon, Loader2, Focus,
  Sun, Moon, Split, Columns2, Zap, X, MessageSquare, Trash2, Save, History, LogIn, LogOut, ArrowLeft, Check, Edit3, ChevronLeft, Plus, Sparkles, ClipboardList
} from 'lucide-react';
import { 
  getProject,
  patchProject,
  listAnalysisResults,
  createAnalysisResult,
  deleteAnalysisResult,
  uploadImageBase64,
  parseDataUrl,
} from './lib/localApi';
import { Routes, Route, useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import ProjectManagement from './pages/ProjectManagement';
import ReviewHistory from './components/ReviewHistory';
import ReviewDetail from './components/ReviewDetail';
import { ReviewRoundWithItems } from './types';

const API_BASE = '';

interface Difference {
  id: string;
  title: string;
  type: 'CONTENT' | 'LAYOUT' | 'STYLE';
  description: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  status: 'pending' | 'fixed' | 'ignored';
  imageUrl?: string;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-red-100">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <Zap className="w-8 h-8" />
              <h1 className="text-xl font-bold">Something went wrong</h1>
            </div>
            <p className="text-gray-600 mb-6 text-sm">
              The application encountered an unexpected error. Please try refreshing the page.
            </p>
            {this.state.error && (
              <div className="bg-red-50 rounded-lg p-4 mb-6 overflow-auto max-h-40">
                <p className="text-xs font-mono text-red-800 break-words">
                  {this.state.error.message}
                </p>
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/20"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const compressImage = (base64: string, maxWidth = 4096, quality = 0.95): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    // Set crossOrigin to anonymous to avoid tainted canvas when loading from URLs (like Firebase Storage)
    if (!base64.startsWith('data:')) {
      img.crossOrigin = "anonymous";
    }
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (maxWidth / width) * height;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        // Use jpeg for better compression
        resolve(canvas.toDataURL('image/jpeg', quality));
      } else {
        resolve(base64);
      }
    };
    img.onerror = () => resolve(base64);
  });
};

function DesignChecker() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  // Local dev mode: no login, treat as fully authorized.
  const user = { uid: 'dev' };
  const [savedResults, setSavedResults] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const [showHistory, setShowHistory] = useState(false);

  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [comparisonMode, setComparisonMode] = useState<'overlay' | 'slider' | 'split' | 'diff'>('split');
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isResizingSlider, setIsResizingSlider] = useState(false);
  const [url, setUrl] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [liveSourceType, setLiveSourceType] = useState<'url' | 'sim' | 'image'>('image');
  const [liveImage, setLiveImage] = useState<string | null>(null);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [liveImageSize, setLiveImageSize] = useState({ width: 0, height: 0 });
  const [opacity, setOpacity] = useState(0.5);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [designSourceType, setDesignSourceType] = useState<'upload' | 'figma'>('upload');
  const [figmaUrl, setFigmaUrl] = useState('');
  const [isFetchingFigma, setIsFetchingFigma] = useState(false);
  const [showCrosshair, setShowCrosshair] = useState(false);
  const [crosshairPos, setCrosshairPos] = useState({ x: 0, y: 0 });
  const [differences, setDifferences] = useState<Difference[]>([]);
  // Default to Gemini for best visual analysis quality.
  const [selectedModel, setSelectedModel] = useState<'gemini' | 'kimi' | 'doubao' | 'qwen' | 'claude' | 'gpt'>('gemini');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedDiffId, setSelectedDiffId] = useState<string | null>(null);
  const [editingDiffId, setEditingDiffId] = useState<string | null>(null);
  const [editType, setEditType] = useState<'move' | 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se' | 'resize-n' | 'resize-s' | 'resize-e' | 'resize-w' | null>(null);
  const [editStartPos, setEditStartPos] = useState({ x: 0, y: 0 });
  const [editStartRect, setEditStartRect] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [isAddingDiff, setIsAddingDiff] = useState(false);
  const [newDiffStart, setNewDiffStart] = useState<{ x: number, y: number } | null>(null);
  const [inlineEdit, setInlineEdit] = useState<{ id: string, field: 'title' | 'description' | 'type' } | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [projectName, setProjectName] = useState('Untitled Project');
  const [isOwner, setIsOwner] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState('');
  const [sidebarTab, setSidebarTab] = useState<'differences' | 'review'>('differences');
  const [selectedReviewRound, setSelectedReviewRound] = useState<ReviewRoundWithItems | null>(null);
  const skipNextAutoSave = React.useRef(false);
  const lastSavedDataRef = React.useRef<string>('');
  const isSavingRef = React.useRef(false);
  const currentImageRef = React.useRef<string | null>(null);
  const currentLiveImageRef = React.useRef<string | null>(null);
  const analysisControllerRef = React.useRef<AbortController | null>(null);

  // Use refs for values that change frequently to optimize event listeners
  const positionRef = React.useRef(position);
  const scaleRef = React.useRef(scale);
  const isDraggingRef = React.useRef(isDragging);
  const dragStartRef = React.useRef(dragStart);
  const comparisonModeRef = React.useRef(comparisonMode);
  const editTypeRef = React.useRef(editType);
  const editStartPosRef = React.useRef(editStartPos);
  const editStartRectRef = React.useRef(editStartRect);
  const editingDiffIdRef = React.useRef(editingDiffId);
  const isAddingDiffRef = React.useRef(isAddingDiff);
  const drawingRectRef = React.useRef<DOMRect | null>(null);
  const newDiffStartRef = React.useRef(newDiffStart);
  const imageSizeRef = React.useRef(imageSize);

  useEffect(() => { positionRef.current = position; }, [position]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { isDraggingRef.current = isDragging; }, [isDragging]);
  useEffect(() => { dragStartRef.current = dragStart; }, [dragStart]);
  useEffect(() => { comparisonModeRef.current = comparisonMode; }, [comparisonMode]);
  useEffect(() => { editTypeRef.current = editType; }, [editType]);
  useEffect(() => { editStartPosRef.current = editStartPos; }, [editStartPos]);
  useEffect(() => { editStartRectRef.current = editStartRect; }, [editStartRect]);
  useEffect(() => { editingDiffIdRef.current = editingDiffId; }, [editingDiffId]);
  useEffect(() => { isAddingDiffRef.current = isAddingDiff; }, [isAddingDiff]);
  useEffect(() => { newDiffStartRef.current = newDiffStart; }, [newDiffStart]);
  useEffect(() => { imageSizeRef.current = imageSize; }, [imageSize]);
  useEffect(() => { currentImageRef.current = image; }, [image]);
  useEffect(() => { currentLiveImageRef.current = liveImage; }, [liveImage]);

  useEffect(() => {
    // Load history (analysisResults) once in local dev.
    listAnalysisResults()
      .then((results) => setSavedResults(results))
      .catch((e) => console.error("Error fetching analysis results:", e));
  }, []);

  useEffect(() => {
    // Load project when visiting /checker/:projectId
    const loadProject = async () => {
      if (!projectId) {
        setIsLoading(false);
        setIsOwner(true);
        return;
      }

      setIsLoading(true);
      setIsOwner(true); // Local dev: always editable
      try {
        const data = await getProject(projectId);
        if (data?.name) {
          setProjectName(data.name);
          setTempName(data.name);
        }
        if (data?.analysisData) {
          const ad = data.analysisData;
          if (ad.image) setImage(ad.image);
          if (ad.liveImage) setLiveImage(ad.liveImage);
          if (ad.differences) {
            setDifferences(ad.differences);
            skipNextAutoSave.current = true;
          }
          if (ad.url) setUrl(ad.url);
          if (ad.figmaUrl) setFigmaUrl(ad.figmaUrl);
          if (typeof ad.opacity === "number") setOpacity(ad.opacity);
          if (typeof ad.scale === "number") setScale(ad.scale);
          if (ad.position) setPosition(ad.position);
        }
      } catch (error) {
        console.error("Error loading project:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadProject();
  }, [projectId]);

  const handleNameSave = () => {
    if (!tempName.trim()) return;
    setProjectName(tempName.trim());
    setIsEditingName(false);
  };

  const saveProjectData = async () => {
    if (!user || !projectId || !isOwner || isSavingRef.current) return;
    
    // Create a fingerprint of current state to avoid redundant saves
    const currentState = JSON.stringify({
      image, liveImage, differences, url, figmaUrl, opacity, scale, position, projectName
    });
    
    if (currentState === lastSavedDataRef.current) {
      setSaveStatus('saved');
      return;
    }

    setSaveStatus('saving');
    setIsSaving(true);
    isSavingRef.current = true;
    
    // Capture values at the start of the save operation
    const startingImage = image;
    const startingLiveImage = liveImage;

    try {
      let finalImageUrl = image;
      let finalLiveImageUrl = liveImage;

      // Upload to local uploads folder if it's a data URL
      if (image && image.startsWith('data:image')) {
        const parsed = parseDataUrl(image);
        if (parsed) {
          finalImageUrl = await uploadImageBase64({
            base64: parsed.base64,
            mimeType: parsed.mimeType,
            kind: 'design',
          });
        }
      }

      if (liveImage && liveImage.startsWith('data:image')) {
        const parsed = parseDataUrl(liveImage);
        if (parsed) {
          finalLiveImageUrl = await uploadImageBase64({
            base64: parsed.base64,
            mimeType: parsed.mimeType,
            kind: 'build',
          });
        }
      }

      // Create a small thumbnail for the dashboard
      const thumbnail = finalImageUrl ? await compressImage(finalImageUrl, 400, 0.6) : (finalLiveImageUrl ? await compressImage(finalLiveImageUrl, 400, 0.6) : null);

      const analysisData = {
        image: finalImageUrl,
        liveImage: finalLiveImageUrl,
        differences,
        url,
        figmaUrl,
        opacity,
        scale,
        position,
        timestamp: Date.now()
      };

      await patchProject(projectId, {
        name: projectName,
        analysisData,
        thumbnail: thumbnail || 'https://picsum.photos/seed/' + projectId + '/400/300',
      });
      
      // Update local state with the new URLs ONLY if the user hasn't uploaded a newer image in the meantime
      if (currentImageRef.current === startingImage) {
        if (finalImageUrl !== startingImage) {
          skipNextAutoSave.current = true;
          setImage(finalImageUrl);
        }
      }
      
      if (currentLiveImageRef.current === startingLiveImage) {
        if (finalLiveImageUrl !== startingLiveImage) {
          skipNextAutoSave.current = true;
          setLiveImage(finalLiveImageUrl);
        }
      }

      lastSavedDataRef.current = currentState;
      setSaveStatus('saved');
    } catch (error: any) {
      console.error("Error saving project data:", error);
      setSaveStatus('error');
      let msg = "Failed to save project data.";
      if (error.message?.includes("exceeds the maximum allowed size")) {
        msg = "Project data is too large for Firestore. Using Firebase Storage should have fixed this, please try again.";
      }
      setToast({ message: msg, type: 'error' });
    } finally {
      setIsSaving(false);
      isSavingRef.current = false;
    }
  };

  // Debounced auto-save
  useEffect(() => {
    if (isLoading || isAnalyzing || !projectId || !isOwner || isSaving) return;

    // Skip initial load or manual save updates
    if (skipNextAutoSave.current) {
      skipNextAutoSave.current = false;
      return;
    }

    // Don't trigger if data hasn't changed from last saved
    const currentState = JSON.stringify({
      image, liveImage, differences, url, figmaUrl, opacity, scale, position, projectName
    });
    if (currentState === lastSavedDataRef.current) return;

    setSaveStatus('unsaved');

    const timer = setTimeout(() => {
      saveProjectData();
    }, 2000); // Save after 2 seconds of inactivity

    return () => clearTimeout(timer);
  }, [differences, opacity, scale, position, projectName, url, figmaUrl, image, liveImage, isOwner, isAnalyzing, isLoading, isSaving]);

  // Sync liveStream to video element whenever it changes or video element mounts
  useEffect(() => {
    if (liveStream && videoRef.current) {
      videoRef.current.srcObject = liveStream;
    }
  }, [liveStream, videoRef.current]);

  const stopAnalysis = () => {
    if (analysisControllerRef.current) {
      analysisControllerRef.current.abort();
      analysisControllerRef.current = null;
      setIsAnalyzing(false);
      setError('Analysis stopped by user');
    }
  };

  const analyzeFidelity = async () => {
    if (!image || !liveImage || !isOwner) return;
    
    // Create new AbortController for this analysis
    const controller = new AbortController();
    analysisControllerRef.current = controller;
    
    setIsAnalyzing(true);
    setDifferences([]);
    setSelectedDiffId(null);
    setError(null);
    try {
      const getBase64 = async (url: string): Promise<{ data: string, mimeType: string }> => {
        if (url.startsWith('data:')) {
          const [mime, data] = url.split(',');
          return { 
            data, 
            mimeType: mime.split(':')[1].split(';')[0] 
          };
        }
        
        // Prefer fetching directly in the browser.
        // Some environments cannot reach external hosts from the dev server,
        // but the browser can still fetch (Firebase Storage signed URLs).
        try {
          const directResponse = await fetch(url, { mode: 'cors', signal: controller.signal });
          if (!directResponse.ok) {
            throw new Error(`Direct fetch failed (${directResponse.status}): ${directResponse.statusText}`);
          }

          const blob = await directResponse.blob();
          return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = (reader.result as string).split(',')[1];
              resolve({ data: base64, mimeType: blob.type });
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch (directErr: any) {
          // Fallback to server proxy to bypass CORS when direct fetch is blocked.
          try {
            const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(url)}`;
            console.log(`Direct fetch failed, falling back to proxy: ${proxyUrl}`);
            const response = await fetch(proxyUrl, { signal: controller.signal });
            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`Proxy failed (${response.status}): ${errorText || response.statusText}`);
            }
            const blob = await response.blob();
            return await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64 = (reader.result as string).split(',')[1];
                resolve({ data: base64, mimeType: blob.type });
              };
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          } catch (proxyErr: any) {
            throw new Error(`Failed to fetch image (direct + proxy): ${proxyErr?.message || proxyErr || directErr?.message}`);
          }
        }
      };

      const [designImg, buildImg] = await Promise.all([
        getBase64(image),
        getBase64(liveImage)
      ]);

      const getImageDimensions = (url: string): Promise<{ width: number, height: number }> => {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
          img.onerror = () => resolve({ width: 0, height: 0 });
          img.src = url;
        });
      };

      // Get TRUE natural dimensions for the AI prompt
      const [naturalDesignDims, naturalBuildDims] = await Promise.all([
        getImageDimensions(image),
        getImageDimensions(liveImage)
      ]);

      // Use natural dimensions in the prompt to ensure AI has accurate context
      const prompt = `
        你是一位细致入微的 UI/UX QA 工程师。请以像素级的精度对比这两张图片。
        图片 1 是 设计稿 (DESIGN SOURCE)（预期设计）。
        图片 2 是 开发稿 (BUILD SOURCE)（实际实现）。
        
        识别它们之间的视觉差异。重点关注：
        1. 内容 (CONTENT)：缺失元素、错误文本、缺失图标或文本内容不匹配。
        2. 布局 (LAYOUT)：对齐问题、间距差异（内边距/外边距）、位置错误或尺寸不匹配。
        3. 样式 (STYLE)：颜色不匹配（十六进制代码）、字体粗细/大小差异、边框/阴影问题或透明度差异。
        
        关于坐标的关键指令：
        对于每个差异，你必须提供一个相对于设计稿（图片 1）的精确像素边界框 (rect)。
        - x: 距离设计稿左边缘的距离。
        - y: 距离设计稿顶边缘的距离。
        - width: 受影响区域的宽度。
        - height: 受影响区域的高度。
        
        设计稿的真实尺寸是 ${naturalDesignDims.width}x${naturalDesignDims.height}。
        开发稿的真实尺寸是 ${naturalBuildDims.width}x${naturalBuildDims.height}。
        
        ${selectedModel === 'doubao' ? '【特别注意】：豆包模型在处理坐标时，请务必使用基于原始像素尺寸的绝对值（x 在 0-' + naturalDesignDims.width + ' 之间，y 在 0-' + naturalDesignDims.height + ' 之间）。请检查你的输出，确保它们不是 0-1000 的归一化坐标。如果你的内部视觉系统使用归一化坐标，请务必将其乘以图片尺寸转换为像素后再返回。' : '【特别注意】：请务必确保坐标 (x, y, width, height) 是基于原始像素尺寸的，不要进行归一化或缩放。请仔细核对坐标位置，确保框选区域与视觉差异点完全重合。'}
        
        如果图片没有完美对齐，请在识别差异之前，先根据关键地标（如页眉或徽标）在心理上对齐它们。
        
        以 JSON 对象数组的形式返回结果。将结果限制在最重要的 15 个差异内。
        重要提示：所有文本字段（title, description）必须使用简体中文。
      `;

      let result;
      // All models now use the backend API proxy
      const response = await fetch("/api/analyze/ui", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt,
          designImg,
          buildImg,
          model: selectedModel
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json();
          throw new Error(errorData.error || `${selectedModel} analysis failed`);
        } else {
          const errorText = await response.text();
          throw new Error(`${selectedModel} analysis failed (${response.status}): ${errorText.substring(0, 100)}`);
        }
      }

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        result = await response.json();
      } else {
        const text = await response.text();
        console.error(`Unexpected response format from backend (${response.status}):`, text.substring(0, 500));
        throw new Error(`Unexpected response format from backend (${response.status}): Expected JSON but received ${contentType || "unknown"}. This often happens if the server is restarting or if the API route is not matched.`);
      }

      const diffsWithIds = result.map((d: any, index: number) => {
        // Ensure type is valid and uppercase
        const type = (d.type || 'STYLE').toUpperCase();
        const validTypes = ['CONTENT', 'LAYOUT', 'STYLE'];
        
        let rect = d.rect || { x: 0, y: 0, width: 0, height: 0 };
        
        // 1. First, handle potential normalization (0-1000 or 0-1)
        const isNormalized1000 = rect.x <= 1000 && rect.y <= 1000 && rect.width <= 1000 && rect.height <= 1000 && 
                                 (naturalDesignDims.width > 1200 || naturalDesignDims.height > 1200);
        const isNormalized1 = rect.x <= 1 && rect.y <= 1 && rect.width <= 1 && rect.height <= 1;

        if (isNormalized1000) {
          rect = {
            x: (rect.x / 1000) * naturalDesignDims.width,
            y: (rect.y / 1000) * naturalDesignDims.height,
            width: (rect.width / 1000) * naturalDesignDims.width,
            height: (rect.height / 1000) * naturalDesignDims.height
          };
        } else if (isNormalized1) {
          rect = {
            x: rect.x * naturalDesignDims.width,
            y: rect.y * naturalDesignDims.height,
            width: rect.width * naturalDesignDims.width,
            height: rect.height * naturalDesignDims.height
          };
        }

        // 2. Then, scale from natural pixels to the app's display coordinate system
        // The app uses imageSize.width (usually 390) for coordinates
        const appWidth = imageSize.width || 390;
        const appHeight = imageSize.height || (naturalDesignDims.height * (appWidth / naturalDesignDims.width));
        
        const scaleX = appWidth / naturalDesignDims.width;
        const scaleY = appHeight / naturalDesignDims.height;
        
        rect = {
          x: Math.round(rect.x * scaleX),
          y: Math.round(rect.y * scaleY),
          width: Math.round(rect.width * scaleX),
          height: Math.round(rect.height * scaleY)
        };
        
        return {
          ...d,
          rect,
          id: (index + 1).toString(),
          type: validTypes.includes(type) ? type : 'STYLE',
          status: 'pending'
        };
      });
      
      setDifferences(diffsWithIds);
    } catch (err: any) {
      console.error("Analysis error:", err);
      if (err.name === 'AbortError') {
        // Analysis was stopped by user, error is already set
      } else {
        setError(`Analysis error: ${err.message || 'Unknown error'}`);
      }
    } finally {
      analysisControllerRef.current = null;
      setIsAnalyzing(false);
    }
  };

  const handleSave = async () => {
    if (projectId) {
      await saveProjectData();
      return;
    }

    if (!image || !liveImage) {
      setError("Please upload both design and build images before saving.");
      return;
    }

    setSaveName(`Analysis ${new Date().toLocaleString()}`);
    setShowSaveModal(true);
  };

  const confirmSave = async () => {
    if (!saveName.trim()) return;
    setIsSaving(true);
    try {
      if (!image || !liveImage) throw new Error("Missing images to save");

      let designImageUrl = image;
      let buildImageUrl = liveImage;

      if (image.startsWith('data:image')) {
        const parsed = parseDataUrl(image);
        if (parsed) {
          designImageUrl = await uploadImageBase64({
            base64: parsed.base64,
            mimeType: parsed.mimeType,
            kind: 'design',
          });
        }
      }
      if (liveImage.startsWith('data:image')) {
        const parsed = parseDataUrl(liveImage);
        if (parsed) {
          buildImageUrl = await uploadImageBase64({
            base64: parsed.base64,
            mimeType: parsed.mimeType,
            kind: 'build',
          });
        }
      }

      await createAnalysisResult({
        name: saveName,
        designImage: designImageUrl,
        buildImage: buildImageUrl,
        differences,
        url,
        figmaUrl,
        opacity,
        scale,
        position,
        timestamp: Date.now(),
      });
      setShowSaveModal(false);
      setToast({ message: "Analysis saved successfully!", type: 'success' });
    } catch (err) {
      console.error("Save error:", err);
      setError("Failed to save analysis result.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogin = async () => {
    // Local dev: no login
  };

  const handleLogout = async () => {
    // Local dev: no logout
  };

  const loadResult = (result: any) => {
    setImage(result.designImage);
    setLiveImage(result.buildImage);
    setDifferences(result.differences || []);
    skipNextAutoSave.current = true;
    setUrl(result.url || '');
    setFigmaUrl(result.figmaUrl || '');
    setOpacity(result.opacity ?? 0.5);
    setScale(result.scale ?? 1);
    setPosition(result.position ?? { x: 0, y: 0 });
    setShowHistory(false);
  };

  const deleteResult = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmId(id);
  };

  const confirmDeleteResult = async () => {
    if (!deleteConfirmId || !isOwner) return;
    try {
      await deleteAnalysisResult(deleteConfirmId);
      setDeleteConfirmId(null);
      setToast({ message: "Analysis deleted successfully!", type: 'success' });
      const results = await listAnalysisResults();
      setSavedResults(results);
    } catch (err) {
      console.error("Delete error:", err);
      setError("Failed to delete analysis result.");
    }
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current) {
        setPosition({
          x: e.clientX - dragStartRef.current.x,
          y: e.clientY - dragStartRef.current.y
        });
      }

      if (editingDiffIdRef.current && editTypeRef.current) {
        const dx = (e.clientX - editStartPosRef.current.x) / scaleRef.current;
        const dy = (e.clientY - editStartPosRef.current.y) / scaleRef.current;
        const start = editStartRectRef.current;

        setDifferences(prev => prev.map(d => {
          if (d.id !== editingDiffIdRef.current) return d;
          
          let { x, y, width, height } = start;

          switch (editTypeRef.current) {
            case 'move':
              x += dx;
              y += dy;
              break;
            case 'resize-n':
              y += dy;
              height -= dy;
              break;
            case 'resize-s':
              height += dy;
              break;
            case 'resize-e':
              width += dx;
              break;
            case 'resize-w':
              x += dx;
              width -= dx;
              break;
            case 'resize-nw':
              x += dx;
              y += dy;
              width -= dx;
              height -= dy;
              break;
            case 'resize-ne':
              y += dy;
              width += dx;
              height -= dy;
              break;
            case 'resize-sw':
              x += dx;
              width -= dx;
              height += dy;
              break;
            case 'resize-se':
              width += dx;
              height += dy;
              break;
          }

          // Ensure minimum size
          if (width < 10) width = 10;
          if (height < 10) height = 10;

          return { ...d, rect: { x, y, width, height } };
        }));
      }

      if (isAddingDiffRef.current && newDiffStartRef.current && drawingRectRef.current) {
        const rect = drawingRectRef.current;
        const currentX = (e.clientX - rect.left) / scaleRef.current;
        const currentY = (e.clientY - rect.top) / scaleRef.current;
        
        const x = Math.max(0, Math.min(imageSizeRef.current.width || 10000, Math.min(newDiffStartRef.current.x, currentX)));
        const y = Math.max(0, Math.min(imageSizeRef.current.height || 10000, Math.min(newDiffStartRef.current.y, currentY)));
        const width = Math.min(imageSizeRef.current.width || 10000, Math.abs(currentX - newDiffStartRef.current.x));
        const height = Math.min(imageSizeRef.current.height || 10000, Math.abs(currentY - newDiffStartRef.current.y));

        if (width > 2 && height > 2) {
          setDifferences(prev => {
            const filtered = prev.filter(d => d.id !== 'temp-new');
            return [...filtered, {
              id: 'temp-new',
              title: '手动标记',
              type: 'LAYOUT',
              description: '手动添加的差异区域。',
              rect: { x, y, width, height },
              status: 'pending'
            }];
          });
        }
      }

      if (isResizingSlider) {
        const previewArea = document.getElementById('preview-area');
        if (previewArea) {
          const rect = previewArea.getBoundingClientRect();
          const viewportWidth = rect.width - 20;
          let x = e.clientX - rect.left - 20; // 20px ruler offset

          // Constrain to image width if image exists
          if (image && imageSize.width) {
            const scaledWidth = imageSize.width * scale;
            const centerX = viewportWidth / 2 + position.x;
            const leftBound = centerX - scaledWidth / 2;
            const rightBound = centerX + scaledWidth / 2;
            
            x = Math.max(leftBound, Math.min(rightBound, x));
          }

          const percentage = Math.max(0, Math.min(100, (x / viewportWidth) * 100));
          setSliderPosition(percentage);
        }
      }
    };
    
    const handleGlobalMouseUp = () => {
      setIsDragging(false);
      setIsResizingSlider(false);
      setEditingDiffId(null);
      setEditType(null);

      if (isAddingDiffRef.current && newDiffStartRef.current) {
        setDifferences(prev => {
          const temp = prev.find(d => d.id === 'temp-new');
          if (temp && temp.rect.width > 5 && temp.rect.height > 5) {
            return prev.map(d => {
              if (d.id === 'temp-new') {
                return { ...d, id: (prev.length).toString() };
              }
              return d;
            });
          }
          return prev.filter(d => d.id !== 'temp-new');
        });
        setNewDiffStart(null);
        drawingRectRef.current = null;
      }
    };

    if (isDragging || isResizingSlider || editingDiffId || isAddingDiff) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }

    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      if (inlineEdit) {
        // If clicking outside the editing area, save (set null)
        if (!target.closest('.editing-field')) {
          setInlineEdit(null);
        }
      } else if (selectedDiffId) {
        if (!target.closest('.difference-item')) {
          setSelectedDiffId(null);
        }
      }
    };

    if (selectedDiffId || inlineEdit) {
      window.addEventListener('mousedown', handleGlobalClick);
    }

    const handleWheel = (e: WheelEvent) => {
      // Ignore if scrolling inside the control panels
      const target = e.target as HTMLElement;
      if (target.closest('.control-panel') || target.closest('.comparison-panel')) return;

      if (image && comparisonMode === 'overlay') {
        setOpacity(prev => {
          const delta = -e.deltaY * 0.0005;
          const next = Math.min(1, Math.max(0, prev + delta));
          return next;
        });
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDiffId && isOwner) {
        setDifferences(prev => prev.filter(d => d.id !== selectedDiffId));
        setSelectedDiffId(null);
      }

      if (e.key.toLowerCase() === 'r' && isOwner) {
        setIsAddingDiff(prev => !prev);
      }

      if (e.key === 'Escape') {
        setIsAddingDiff(false);
        setSelectedDiffId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('mousedown', handleGlobalClick);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDragging, isResizingSlider, dragStart, image, imageSize, scale, position, isVisible, comparisonMode, selectedDiffId, editingDiffId, isAddingDiff, inlineEdit, isOwner]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isOwner) return;
    if (isAddingDiff) {
      const rect = e.currentTarget.getBoundingClientRect();
      drawingRectRef.current = rect;
      const x = (e.clientX - rect.left) / scale;
      const y = (e.clientY - rect.top) / scale;
      setNewDiffStart({ x, y });
      return;
    }
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const rawDataUrl = event.target?.result as string;
        // Use higher quality for initial upload
        const dataUrl = await compressImage(rawDataUrl, 4096, 0.95);
        setImage(dataUrl);
        
        // Get natural dimensions
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          const originalWidth = img.naturalWidth;
          const originalHeight = img.naturalHeight;
          const targetWidth = 390;
          const targetHeight = (originalHeight / originalWidth) * targetWidth;
          setImageSize({ width: targetWidth, height: targetHeight });
          setPosition({ x: 0, y: 0 });
          setScale(1);
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLiveImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const rawDataUrl = event.target?.result as string;
        // Use higher quality for initial upload
        const dataUrl = await compressImage(rawDataUrl, 4096, 0.95);
        setLiveImage(dataUrl);
        setLiveStream(null);
        setLiveSourceType('image');

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          const originalWidth = img.naturalWidth;
          const originalHeight = img.naturalHeight;
          const targetWidth = 390;
          const targetHeight = (originalHeight / originalWidth) * targetWidth;
          setLiveImageSize({ width: targetWidth, height: targetHeight });
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    }
  };

  const startLiveCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'window',
        },
        audio: false
      });
      setLiveStream(stream);
      setLiveImage(null); // Clear image if stream is started
      setError(null);
    } catch (err: any) {
      console.error("Error starting screen capture:", err);
      setError(err.message || "Failed to start screen capture. Please check permissions.");
      setTimeout(() => setError(null), 5000);
    }
  };

  const stopLiveCapture = () => {
    if (liveStream) {
      liveStream.getTracks().forEach(track => track.stop());
      setLiveStream(null);
    }
  };

  const captureSnapshot = async () => {
    if (videoRef.current && liveStream) {
      const video = videoRef.current;
      
      // Ensure video has valid dimensions
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        setError("Video stream not ready yet. Please wait a moment.");
        return;
      }

      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          // Use jpeg and compress with very high quality
          const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
          setLiveImage(dataUrl);
          setLiveImageSize({ width: canvas.width, height: canvas.height });
          stopLiveCapture();
          setError(null);
        }
      } catch (err: any) {
        console.error("Snapshot error:", err);
        setError("Failed to capture snapshot: " + err.message);
      }
    }
  };

  const handleFigmaFetch = async () => {
    if (!figmaUrl) return;
    setIsFetchingFigma(true);
    setError(null);
    try {
      const response = await fetch('/api/figma/fetch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: figmaUrl }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch Figma image');
      }

      setImage(data.imageUrl);
      
      // Get natural dimensions
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const originalWidth = img.naturalWidth;
        const originalHeight = img.naturalHeight;
        const targetWidth = 390;
        const targetHeight = (originalHeight / originalWidth) * targetWidth;
        setImageSize({ width: targetWidth, height: targetHeight });
        setPosition({ x: 0, y: 0 });
        setScale(1);
      };
      img.src = data.imageUrl;
    } catch (err: any) {
      console.error("Figma fetch error:", err);
      setError(err.message || "Failed to fetch Figma image. Check your URL and FIGMA_ACCESS_TOKEN.");
    } finally {
      setIsFetchingFigma(false);
    }
  };

  const resetTransform = () => {
    if (!isOwner) return;
    setPosition({ x: 0, y: 0 });
    setScale(1);
  };

  const align = (type: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom') => {
    if (!isOwner || !imageSize.width) return;
    
    const previewArea = document.getElementById('preview-area');
    if (!previewArea) return;

    const viewportW = previewArea.clientWidth - 20;
    const viewportH = previewArea.clientHeight - 20;
    const imgW = imageSize.width * scale;
    const imgH = imageSize.height * scale;

    const newPos = { ...position };

    switch (type) {
      case 'left': newPos.x = -(viewportW - imgW) / 2; break;
      case 'center-h': newPos.x = 0; break;
      case 'right': newPos.x = (viewportW - imgW) / 2; break;
      case 'top': newPos.y = -(viewportH - imgH) / 2; break;
      case 'center-v': newPos.y = 0; break;
      case 'bottom': newPos.y = (viewportH - imgH) / 2; break;
    }
    
    setPosition(newPos);
  };

  const updateDiffStatus = (id: string, status: 'pending' | 'fixed' | 'ignored') => {
    if (!isOwner) return;
    setDifferences(prev => prev.map(d => d.id === id ? { ...d, status } : d));
    if (selectedDiffId === id) setSelectedDiffId(null);
  };

  const renderDifferenceBoxes = (paneType: 'design' | 'build') => {
    return differences.filter(d => d.status === 'pending').map((diff) => {
      const isSelected = selectedDiffId === diff.id;
      const color = diff.type === 'CONTENT' ? '#6366f1' : diff.type === 'LAYOUT' ? '#f59e0b' : '#f43f5e';
      const colorRgb = diff.type === 'CONTENT' ? '99, 102, 241' : diff.type === 'LAYOUT' ? '245, 158, 11' : '244, 63, 94';
      
      return (
        <div
          key={diff.id}
          className={`absolute border-2 transition-all z-[60] difference-item ${
            isSelected ? '' : 'hover:brightness-110'
          }`}
          style={{
            left: `${diff.rect.x}px`,
            top: `${diff.rect.y}px`,
            width: `${diff.rect.width}px`,
            height: `${diff.rect.height}px`,
            cursor: editingDiffId === diff.id ? 'grabbing' : isSelected ? 'move' : 'pointer',
            borderColor: isSelected ? color : `rgba(${colorRgb}, 0.4)`,
            backgroundColor: isSelected ? `rgba(${colorRgb}, 0.1)` : 'transparent',
          }}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedDiffId(diff.id);
          }}
          onMouseDown={(e) => {
            if (e.button !== 0 || !isOwner) return;
            e.stopPropagation();
            setEditingDiffId(diff.id);
            setEditType('move');
            setEditStartPos({ x: e.clientX, y: e.clientY });
            setEditStartRect({ ...diff.rect });
          }}
        >
          {/* Resize Handles */}
          {isSelected && isOwner && (
            <>
              {[
                { type: 'resize-nw', pos: '-top-1 -left-1', cursor: 'nw-resize', isCorner: true },
                { type: 'resize-ne', pos: '-top-1 -right-1', cursor: 'ne-resize', isCorner: true },
                { type: 'resize-sw', pos: '-bottom-1 -left-1', cursor: 'sw-resize', isCorner: true },
                { type: 'resize-se', pos: '-bottom-1 -right-1', cursor: 'se-resize', isCorner: true },
                { type: 'resize-n', pos: '-top-1 left-1 right-1 h-2', cursor: 'n-resize', isCorner: false },
                { type: 'resize-s', pos: '-bottom-1 left-1 right-1 h-2', cursor: 's-resize', isCorner: false },
                { type: 'resize-w', pos: 'top-1 bottom-1 -left-1 w-2', cursor: 'w-resize', isCorner: false },
                { type: 'resize-e', pos: 'top-1 bottom-1 -right-1 w-2', cursor: 'e-resize', isCorner: false },
              ].map((handle) => (
                <div 
                  key={handle.type}
                  className={`absolute ${handle.pos} z-[70] ${
                    handle.isCorner 
                      ? 'w-2 h-2 bg-white border-2 rounded-full' 
                      : ''
                  }`}
                  style={{ 
                    borderColor: handle.isCorner ? color : 'transparent',
                    cursor: handle.cursor 
                  }}
                  onMouseDown={(e) => { 
                    e.stopPropagation(); 
                    setEditingDiffId(diff.id); 
                    setEditType(handle.type as any); 
                    setEditStartPos({ x: e.clientX, y: e.clientY }); 
                    setEditStartRect({ ...diff.rect }); 
                  }}
                />
              ))}
            </>
          )}
          <div 
            className="absolute -top-5 left-0 text-white text-[10px] px-1 rounded font-bold pointer-events-none"
            style={{ backgroundColor: color }}
          >
            {diff.id}
          </div>
        </div>
      );
    });
  };

  const handleSplitMouseMove = (e: React.MouseEvent) => {
    if (!showCrosshair) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const paneWidth = rect.width / 2;
    const xInPane = (e.clientX - rect.left) % paneWidth;
    const yInPane = (e.clientY - rect.top);
    setCrosshairPos({
      x: xInPane,
      y: yInPane
    });
  };

  const toggleCrosshair = () => {
    setShowCrosshair(!showCrosshair);
  };

  const renderDesignSourceSelector = () => {
    if (!isOwner) {
      return (
        <div className="flex flex-col items-center justify-center gap-6 p-8">
          <div className="flex flex-col items-center gap-2">
            <Layers className={`w-12 h-12 ${theme === 'dark' ? 'text-gray-700' : 'text-gray-300'}`} />
            <h3 className={`text-sm font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Design Source</h3>
            <p className={`text-xs ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`}>No design source provided by the owner.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center gap-6 p-8">
        <div className="flex flex-col items-center gap-2">
          <Layers className={`w-12 h-12 ${theme === 'dark' ? 'text-gray-700' : 'text-gray-300'}`} />
          <h3 className={`text-sm font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Design Source</h3>
        </div>
        
        <div className="flex flex-col gap-4 w-80">
          <div className={`flex rounded-xl p-1 ${theme === 'dark' ? 'bg-[#1e1e1e]' : 'bg-gray-100'}`}>
            <button 
              onClick={() => setDesignSourceType('upload')} 
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                designSourceType === 'upload' 
                  ? (theme === 'dark' ? 'bg-[#383838] text-white shadow-lg' : 'bg-white text-black shadow-md') 
                  : (theme === 'dark' ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600')
              }`}
            >
              Upload Image
            </button>
            <button 
              onClick={() => setDesignSourceType('figma')} 
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                designSourceType === 'figma' 
                  ? (theme === 'dark' ? 'bg-[#383838] text-white shadow-lg' : 'bg-white text-black shadow-md') 
                  : (theme === 'dark' ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600')
              }`}
            >
              Figma URL
            </button>
          </div>

          <div className="h-32 flex flex-col justify-center">
            {designSourceType === 'upload' ? (
              <label className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl h-full cursor-pointer transition-all group ${
                theme === 'dark' ? 'bg-[#1e1e1e] hover:bg-[#252525] border-[#383838] hover:border-indigo-500/50' : 'bg-white hover:bg-gray-50 border-gray-200 hover:border-indigo-500/50'
              }`}>
                <Upload className={`w-6 h-6 group-hover:text-indigo-500 transition-colors ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`} />
                <span className={`text-[11px] font-bold uppercase tracking-tight ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Select Image</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <LinkIcon className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`} />
                    <input 
                      type="text" 
                      value={figmaUrl}
                      onChange={(e) => setFigmaUrl(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleFigmaFetch()}
                      className={`w-full border rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all ${
                        theme === 'dark' 
                          ? 'bg-[#1e1e1e] border-[#383838] text-white placeholder-gray-600' 
                          : 'bg-white border-gray-200 text-black placeholder-gray-400'
                      }`}
                      placeholder="Paste Figma URL..."
                    />
                  </div>
                  <button 
                    onClick={handleFigmaFetch}
                    disabled={isFetchingFigma || !figmaUrl}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 disabled:cursor-not-allowed px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all shadow-lg shadow-indigo-500/20"
                  >
                    {isFetchingFigma ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Fetch'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderLiveSourceSelector = () => {
    if (!isOwner) {
      return (
        <div className="flex flex-col items-center justify-center gap-6 p-8">
          <div className="flex flex-col items-center gap-2">
            <Zap className={`w-12 h-12 ${theme === 'dark' ? 'text-gray-700' : 'text-gray-300'}`} />
            <h3 className={`text-sm font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Live Source</h3>
            <p className={`text-xs ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`}>No live source provided by the owner.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center gap-6 p-8">
        <div className="flex flex-col items-center gap-2">
          <Zap className={`w-12 h-12 ${theme === 'dark' ? 'text-gray-700' : 'text-gray-300'}`} />
          <h3 className={`text-sm font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Live Source</h3>
        </div>
        
        <div className="flex flex-col gap-4 w-80">
          <div className={`flex rounded-xl p-1 ${theme === 'dark' ? 'bg-[#1e1e1e]' : 'bg-gray-100'}`}>
            <button 
              onClick={() => setLiveSourceType('image')} 
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                liveSourceType === 'image' 
                  ? (theme === 'dark' ? 'bg-[#383838] text-white shadow-lg' : 'bg-white text-black shadow-md') 
                  : (theme === 'dark' ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600')
              }`}
            >
              Image
            </button>
            <button 
              onClick={() => setLiveSourceType('url')} 
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                liveSourceType === 'url' 
                  ? (theme === 'dark' ? 'bg-[#383838] text-white shadow-lg' : 'bg-white text-black shadow-md') 
                  : (theme === 'dark' ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600')
              }`}
            >
              URL
            </button>
            <button 
              onClick={() => setLiveSourceType('sim')} 
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                liveSourceType === 'sim' 
                  ? (theme === 'dark' ? 'bg-[#383838] text-white shadow-lg' : 'bg-white text-black shadow-md') 
                  : (theme === 'dark' ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600')
              }`}
            >
              SIM
            </button>
          </div>

          <div className="h-32 flex flex-col justify-center">
            {liveSourceType === 'image' ? (
              <label className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl h-full cursor-pointer transition-all group ${
                theme === 'dark' ? 'bg-[#1e1e1e] hover:bg-[#252525] border-[#383838] hover:border-indigo-500/50' : 'bg-white hover:bg-gray-50 border-gray-200 hover:border-indigo-500/50'
              }`}>
                <Upload className={`w-6 h-6 group-hover:text-indigo-500 transition-colors ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`} />
                <span className={`text-[11px] font-bold uppercase tracking-tight ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Upload Build</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleLiveImageUpload} />
              </label>
            ) : liveSourceType === 'url' ? (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && setUrl(inputUrl)}
                    className={`flex-1 border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all ${
                      theme === 'dark' 
                        ? 'bg-[#1e1e1e] border-[#383838] text-white placeholder-gray-600' 
                        : 'bg-white border-gray-200 text-black placeholder-gray-400'
                    }`}
                    placeholder="https://..."
                  />
                  <button 
                    onClick={() => setUrl(inputUrl)}
                    className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all shadow-lg shadow-indigo-500/20"
                  >
                    Go
                  </button>
                </div>
              </div>
            ) : (
              <button 
                onClick={liveStream ? stopLiveCapture : startLiveCapture}
                className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl text-sm font-bold transition-all shadow-lg ${
                  liveStream 
                    ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-500/20' 
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/20'
                }`}
              >
                <Eye className="w-5 h-5" />
                {liveStream ? 'Stop Capture' : 'Start Capture'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {isLoading && (
        <div className="fixed inset-0 z-[200] bg-white dark:bg-[#121212] flex flex-col items-center justify-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm font-medium text-gray-500 animate-pulse">Loading project data...</p>
        </div>
      )}
      <div className={`flex flex-col w-screen h-screen overflow-hidden font-sans transition-colors duration-200 ${theme === 'dark' ? 'bg-[#121212] text-[#e0e0e0]' : 'bg-[#fafafa] text-[#1a1a1a]'}`}>
        {/* Top Header Bar */}
        <header className={`h-16 shrink-0 border-b flex items-center justify-between px-6 z-[150] transition-colors duration-200 ${
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
            <div className="flex items-center gap-2">
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
              
              {/* Save Status Indicator */}
              <div className="flex items-center gap-2 ml-2">
                <div className={`w-1.5 h-1.5 rounded-full ${
                  saveStatus === 'saving' ? 'bg-amber-500 animate-pulse' :
                  saveStatus === 'saved' ? 'bg-emerald-500' :
                  saveStatus === 'unsaved' ? 'bg-gray-400' :
                  'bg-rose-500'
                }`} />
                <span className={`text-[10px] font-medium uppercase tracking-wider ${
                  theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                }`}>
                  {saveStatus === 'saving' ? 'Saving...' :
                   saveStatus === 'saved' ? 'Saved' :
                   saveStatus === 'unsaved' ? 'Unsaved changes' :
                   'Save error'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Comparison Modes in Header - Right Aligned */}
            <div className={`flex items-center gap-1 p-1 rounded-2xl transition-colors duration-200 ${
              theme === 'dark' ? 'bg-[#2c2c2c]' : 'bg-[#f0f0f5]'
            }`}>
              <button 
                onClick={() => setComparisonMode('overlay')}
                className={`px-4 py-1.5 rounded-xl text-[13px] font-semibold transition-all ${
                  comparisonMode === 'overlay' 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : (theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700')
                }`}
              >
                Overlay
              </button>
              <button 
                onClick={() => setComparisonMode('slider')}
                className={`px-4 py-1.5 rounded-xl text-[13px] font-semibold transition-all ${
                  comparisonMode === 'slider' 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : (theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700')
                }`}
              >
                Slider
              </button>
              <button 
                onClick={() => setComparisonMode('split')}
                className={`px-4 py-1.5 rounded-xl text-[13px] font-semibold transition-all ${
                  comparisonMode === 'split' 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : (theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700')
                }`}
              >
                Split
              </button>
              <button 
                onClick={() => setComparisonMode('diff')}
                className={`px-4 py-1.5 rounded-xl text-[13px] font-semibold transition-all ${
                  comparisonMode === 'diff' 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : (theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700')
                }`}
              >
                Diff
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button 
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                className={`p-2 rounded-xl transition-all ${
                  theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-800'
                }`}
                title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
              >
                {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">

        {/* Main Preview Area */}
      <div id="preview-area" className="flex-1 relative overflow-hidden">
        <AnimatePresence>
          {isAddingDiff && isOwner && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-8 left-1/2 -translate-x-1/2 z-[100] bg-indigo-600 text-white px-4 py-2 rounded-full shadow-2xl flex items-center gap-3 border border-indigo-400/30 backdrop-blur-md"
            >
              <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-widest">Drawing Mode</span>
              <div className="h-4 w-px bg-white/20" />
              <span className="text-[10px] opacity-80 font-medium">Click & Drag to mark difference • Press <kbd className="bg-white/20 px-1 rounded">Esc</kbd> or <kbd className="bg-white/20 px-1 rounded">R</kbd> to exit</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Rulers */}
        <div className={`absolute top-0 left-0 w-full h-5 z-40 border-b transition-colors duration-200 flex items-end overflow-hidden ${theme === 'dark' ? 'bg-[#1e1e1e] border-[#383838]' : 'bg-white border-gray-200'}`}>
          <div className="w-5 h-full border-r shrink-0" />
          <div className="flex-1 relative h-full">
            {Array.from({ length: 50 }).map((_, i) => (
              <div key={i} className="absolute h-full flex items-end" style={{ left: `${i * 100}px` }}>
                <div className={`w-px h-full ${theme === 'dark' ? 'bg-[#383838]' : 'bg-gray-200'}`} />
                <span className="text-[8px] ml-1 mb-0.5 opacity-40 select-none">{i * 100}</span>
                {Array.from({ length: 9 }).map((_, j) => (
                  <div key={j} className={`absolute bottom-0 w-px ${theme === 'dark' ? 'bg-[#383838]' : 'bg-gray-200'} ${(j + 1) % 5 === 0 ? 'h-2' : 'h-1'}`} style={{ left: `${(j + 1) * 10}px` }} />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className={`absolute top-0 left-0 h-full w-5 z-40 border-r transition-colors duration-200 flex flex-col items-end overflow-hidden ${theme === 'dark' ? 'bg-[#1e1e1e] border-[#383838]' : 'bg-white border-gray-200'}`}>
          <div className="h-5 w-full border-b shrink-0" />
          <div className="flex-1 relative w-full">
            {Array.from({ length: 50 }).map((_, i) => (
              <div key={i} className="absolute w-full flex justify-end" style={{ top: `${i * 100}px` }}>
                <div className={`h-px w-full ${theme === 'dark' ? 'bg-[#383838]' : 'bg-gray-200'}`} />
                <span className="text-[8px] mr-0.5 mt-1 opacity-40 select-none [writing-mode:vertical-rl]">{i * 100}</span>
                {Array.from({ length: 9 }).map((_, j) => (
                  <div key={j} className={`absolute right-0 h-px ${theme === 'dark' ? 'bg-[#383838]' : 'bg-gray-200'} ${(j + 1) % 5 === 0 ? 'w-2' : 'w-1'}`} style={{ top: `${(j + 1) * 10}px` }} />
                ))}
              </div>
            ))}
          </div>
        </div>

        {comparisonMode === 'split' ? (
          <div 
            className="absolute right-0 bottom-0 flex z-50" 
            style={{ top: '20px', left: '20px' }}
            onMouseMove={handleSplitMouseMove}
            onDoubleClick={toggleCrosshair}
          >
            <div id="design-pane" className="flex-1 relative border-r border-indigo-500/30">
              <div className="absolute top-2 left-2 z-30 bg-indigo-500 text-white text-[10px] px-2 py-1 rounded uppercase font-bold tracking-widest flex items-center gap-2">
                Design
                {isOwner && image && (
                  <button onClick={() => setImage(null)} className="hover:text-rose-400 transition-colors">
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
                    <img src={image} className="max-w-none" style={{ width: '390px' }} draggable={false} />
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
              <div className="absolute top-2 left-2 z-30 bg-black/50 text-white text-[10px] px-2 py-1 rounded uppercase font-bold tracking-widest flex items-center gap-2">
                Build
                {isOwner && (url || liveImage || (liveSourceType === 'sim' && liveStream)) && (
                  <button 
                    onClick={() => {
                      setUrl('');
                      setLiveImage(null);
                      if (liveStream) stopLiveCapture();
                    }} 
                    className="hover:text-rose-400 transition-colors"
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
                        <video ref={videoRef} autoPlay playsInline className="max-w-none" style={{ width: '390px' }} />
                        {renderDifferenceBoxes('build')}
                      </>
                    ) : liveImage ? (
                      <>
                        <img src={liveImage} className="max-h-none max-w-none" style={{ width: '390px' }} />
                        {renderDifferenceBoxes('build')}
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
        ) : comparisonMode === 'slider' ? (
          <div className="w-full h-full relative">
            {/* Background (Build) */}
            <div className="absolute right-0 bottom-0" style={{ top: '20px', left: '20px' }}>
              <div className="absolute top-2 left-2 z-30 bg-black/50 text-white text-[10px] px-2 py-1 rounded uppercase font-bold tracking-widest flex items-center gap-2">
                Build
                {isOwner && (url || liveImage || (liveSourceType === 'sim' && liveStream)) && (
                  <button 
                    onClick={() => {
                      setUrl('');
                      setLiveImage(null);
                      if (liveStream) stopLiveCapture();
                    }} 
                    className="hover:text-rose-400 transition-colors"
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
                        <video ref={videoRef} autoPlay playsInline className="max-w-none" style={{ width: '390px' }} />
                        {renderDifferenceBoxes('build')}
                      </>
                    ) : liveImage ? (
                      <>
                        <img src={liveImage} className="max-h-none max-w-none" style={{ width: '390px' }} />
                        {renderDifferenceBoxes('build')}
                      </>
                    ) : (
                      renderLiveSourceSelector()
                    )}
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
              <div className="w-full h-full flex items-center justify-center overflow-hidden">
                {image ? (
                  <div 
                    className="origin-center"
                    style={{
                      transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                    }}
                  >
                    <img src={image} className="max-w-none" style={{ width: '390px' }} draggable={false} />
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
        ) : (
          <div className="absolute right-0 bottom-0 overflow-hidden" style={{ top: '20px', left: '20px' }}>
            <div className="absolute top-2 left-2 z-[70] flex gap-2">
              <div className="bg-indigo-500 text-white text-[10px] px-2 py-1 rounded uppercase font-bold tracking-widest flex items-center gap-2">
                Design
                {isOwner && image && (
                  <button onClick={() => setImage(null)} className="hover:text-rose-400 transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="bg-black/50 text-white text-[10px] px-2 py-1 rounded uppercase font-bold tracking-widest flex items-center gap-2">
                Build
                {isOwner && (url || liveImage || (liveSourceType === 'sim' && liveStream)) && (
                  <button 
                    onClick={() => {
                      setUrl('');
                      setLiveImage(null);
                      if (liveStream) stopLiveCapture();
                    }} 
                    className="hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
            {/* Background Layer & Overlay Container */}
            <div className={`w-full h-full flex items-center justify-center overflow-auto relative ${theme === 'dark' ? 'bg-[#0a0a0a]' : 'bg-[#e5e5e5]'}`} style={{ isolation: 'isolate' }}>
              {liveSourceType === 'url' && url ? (
                <div className="w-full h-full relative">
                  <iframe 
                    src={url} 
                    className="w-full h-full border-none bg-white"
                    title="Live Website"
                    style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}
                  />
                  {/* Iframe Warning Overlay */}
                  {comparisonMode === 'diff' && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-amber-500/90 text-white px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 shadow-lg backdrop-blur-sm">
                      <Zap className="w-3 h-3" />
                      Browser limitation: Iframe blending may be inaccurate
                    </div>
                  )}
                </div>
              ) : (liveSourceType === 'url' && !url) || (liveSourceType === 'image' && !liveImage) || (liveSourceType === 'sim' && !liveStream) ? (
                <div className="relative z-50">
                  {renderLiveSourceSelector()}
                </div>
              ) : null}

              {liveSourceType === 'image' && liveImage && (
                <div 
                  className={`relative inline-block ${isAddingDiff && isOwner ? 'cursor-crosshair' : ''}`} 
                  style={{ transform: `scale(${scale})`, transformOrigin: 'center' }} 
                  onMouseDown={handleMouseDown}
                >
                  <img 
                    src={liveImage} 
                    alt="Live Screenshot" 
                    draggable={false}
                    className={`max-h-none max-w-none rounded border ${theme === 'dark' ? 'border-white/5' : 'border-black/5'}`}
                    style={{ width: '390px' }}
                  />
                </div>
              )}

              {liveSourceType === 'sim' && liveStream && (
                <div 
                  className={`relative inline-block ${isAddingDiff && isOwner ? 'cursor-crosshair' : ''}`} 
                  style={{ transform: `scale(${scale})`, transformOrigin: 'center' }} 
                  onMouseDown={handleMouseDown}
                >
                  <video ref={videoRef} autoPlay playsInline className="max-w-none rounded border border-white/10" style={{ width: '390px' }} />
                </div>
              )}

              {/* Overlay Layer */}
              {image && isVisible && (
                <div 
                  className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
                  style={{ 
                    mixBlendMode: comparisonMode === 'diff' ? 'difference' : 'normal',
                    opacity: comparisonMode === 'diff' ? 1 : opacity,
                    filter: comparisonMode === 'diff' ? 'invert(1)' : 'none'
                  }}
                >
                  <div 
                    className="cursor-move origin-center pointer-events-auto"
                    style={{
                      transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                    }}
                    onMouseDown={handleMouseDown}
                  >
                    <img 
                      src={image} 
                      alt="Design Overlay" 
                      className="max-w-none pointer-events-none"
                      style={{ width: '390px' }}
                      draggable={false}
                    />
                  </div>
                </div>
              )}

              {/* Marks Layer (Difference Boxes) - Always on top in Overlay mode */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[60]">
                <div 
                  className="relative inline-block" 
                  style={{ 
                    transform: `scale(${scale})`, 
                    transformOrigin: 'center',
                    width: liveSourceType === 'image' ? (liveImageSize.width || 'auto') : 'auto',
                    height: liveSourceType === 'image' ? (liveImageSize.height || 'auto') : 'auto'
                  }}
                >
                  {renderDifferenceBoxes('build')}
                </div>
              </div>

              {/* Design Selector if no image */}
              {!image && ((liveSourceType === 'url' && url) || (liveSourceType === 'image' && liveImage) || (liveSourceType === 'sim' && liveStream)) && (
                <div className="absolute inset-0 flex items-center justify-center z-50">
                  {renderDesignSourceSelector()}
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Marks Layer for Non-Split Modes */}
        {comparisonMode !== 'split' && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-[100]" style={{ top: '20px', left: '20px' }}>
            <div 
              className="relative inline-block" 
              style={{ 
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                width: liveSourceType === 'image' && liveImageSize.width ? `${liveImageSize.width}px` : (image && imageSize.width ? `${imageSize.width}px` : '100%'),
                height: liveSourceType === 'image' && liveImageSize.height ? `${liveImageSize.height}px` : (image && imageSize.height ? `${imageSize.height}px` : '100%'),
              }}
            >
            </div>
          </div>
        )}

        {/* Dragging Overlay to prevent iframe from stealing mouse events */}
        {(isDragging || isResizingSlider) && (
          <div className="fixed inset-0 z-40 cursor-move" />
        )}
      </div>

      {/* Sidebar (Control Panel) - Now on the Right */}
      <div className={`w-96 h-full border-l flex flex-col z-50 overflow-hidden transition-colors duration-200 ${
        theme === 'dark' 
          ? 'bg-[#1e1e1e] border-[#383838] text-[#e0e0e0]' 
          : 'bg-white border-[#e0e0e0] text-[#1a1a1a]'
      }`}>
        {/* Tab Header */}
        <div className={`flex border-b ${theme === 'dark' ? 'border-white/10' : 'border-black/5'}`}>
          <button
            onClick={() => setSidebarTab('differences')}
            className={`flex-1 py-3 text-xs font-bold transition-colors flex items-center justify-center gap-2 ${
              sidebarTab === 'differences'
                ? 'text-indigo-500 border-b-2 border-indigo-500'
                : theme === 'dark' ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            差异列表
            {differences.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 text-[10px]">
                {differences.filter(d => d.status === 'pending').length}
              </span>
            )}
          </button>
          <button
            onClick={() => setSidebarTab('review')}
            className={`flex-1 py-3 text-xs font-bold transition-colors flex items-center justify-center gap-2 ${
              sidebarTab === 'review'
                ? 'text-indigo-500 border-b-2 border-indigo-500'
                : theme === 'dark' ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            验收历史
          </button>
        </div>

        {/* Tab Content */}
        {sidebarTab === 'review' ? (
          selectedReviewRound ? (
            <ReviewDetail
              roundId={selectedReviewRound.id}
              theme={theme}
              onBack={() => setSelectedReviewRound(null)}
              onRoundUpdate={() => {}}
            />
          ) : (
            <ReviewHistory
              projectId={projectId || ''}
              theme={theme}
              onSelectRound={(round) => setSelectedReviewRound(round)}
              onNewRound={() => {
                fetch(`${API_BASE}/api/projects/${projectId}/review-rounds`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    designImage: image,
                    buildImage: liveImage
                  })
                })
                  .then(res => res.json())
                  .then(data => {
                    if (data.id) {
                      setToast({ message: `已创建第 ${data.roundNumber} 轮验收`, type: 'success' });
                    }
                  })
                  .catch(e => console.error('Failed to create round:', e));
              }}
            />
          )
        ) : differences.length > 0 ? (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className={`p-4 border-b flex items-center justify-between ${theme === 'dark' ? 'border-white/10' : 'border-black/5'}`}>
              <h2 className="text-sm font-bold">差异列表</h2>
              <button 
                onClick={() => {
                  setDifferences([]);
                  setSelectedDiffId(null);
                }}
                className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded transition-colors ${
                  theme === 'dark' ? 'text-gray-500 hover:text-rose-500 hover:bg-rose-500/10' : 'text-gray-400 hover:text-rose-600 hover:bg-rose-50'
                }`}
              >
                Clear
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {differences.filter(d => d.status === 'pending').map((diff, idx) => (
                <div 
                  key={diff.id}
                  onClick={() => {
                    if (selectedDiffId !== diff.id) {
                      setSelectedDiffId(diff.id);
                    }
                  }}
                  className={`p-4 rounded-xl border transition-all cursor-pointer group relative difference-item ${
                    selectedDiffId === diff.id 
                      ? 'bg-indigo-500/10 border-indigo-500/30' 
                      : 'bg-transparent border-transparent hover:bg-indigo-500/10 hover:border-indigo-500/30'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`w-5 h-5 shrink-0 rounded-full text-[10px] flex items-center justify-center font-bold transition-colors ${
                      selectedDiffId === diff.id ? 'bg-indigo-500/20 text-indigo-400' : 'bg-white/10 text-gray-500'
                    }`}>
                      {diff.id}
                    </span>
                    <div className="flex-1 min-w-0">
                      {/* Title Section */}
                      <div className="flex items-center justify-between mb-1 group/field">
                        {inlineEdit?.id === diff.id && inlineEdit?.field === 'title' ? (
                          <div className="flex-1 flex items-center gap-2 editing-field" onClick={e => e.stopPropagation()}>
                            <input 
                              autoFocus
                              type="text"
                              value={diff.title}
                              onChange={(e) => {
                                setDifferences(prev => prev.map(d => d.id === diff.id ? { ...d, title: e.target.value } : d));
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') setInlineEdit(null);
                              }}
                              className="flex-1 bg-white/5 border border-indigo-500/50 rounded px-2 py-0.5 text-[12px] font-bold focus:outline-none"
                            />
                            <select 
                              value={diff.type}
                              onChange={(e) => {
                                setDifferences(prev => prev.map(d => d.id === diff.id ? { ...d, type: e.target.value as any } : d));
                              }}
                              className="bg-white/5 border border-white/10 rounded px-1 py-0.5 text-[9px] font-bold focus:outline-none focus:border-indigo-500"
                            >
                              <option value="CONTENT">CONTENT</option>
                              <option value="LAYOUT">LAYOUT</option>
                              <option value="STYLE">STYLE</option>
                            </select>
                            <button onClick={() => setInlineEdit(null)} className="text-indigo-400 hover:text-indigo-300">
                              <Check className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex-1 flex items-center justify-between min-w-0">
                            <h3 
                              className={`text-[12px] font-bold truncate pr-2 transition-colors ${
                                selectedDiffId === diff.id && isOwner ? 'cursor-text hover:text-indigo-400' : 'cursor-pointer'
                              }`}
                              onDoubleClick={(e) => {
                                if (selectedDiffId === diff.id && isOwner) {
                                  e.stopPropagation();
                                  setInlineEdit({ id: diff.id, field: 'title' });
                                }
                              }}
                            >
                              {diff.title}
                            </h3>
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!isOwner) return;
                                  const types: Difference['type'][] = ['CONTENT', 'LAYOUT', 'STYLE'];
                                  const currentIndex = types.indexOf(diff.type);
                                  const nextType = types[(currentIndex + 1) % types.length];
                                  setDifferences(prev => prev.map(d => d.id === diff.id ? { ...d, type: nextType } : d));
                                }}
                                title={isOwner ? "点击切换类型" : ""}
                                className={`text-[9px] px-2 py-0.5 rounded font-bold tracking-tighter transition-colors min-w-[48px] text-center ${isOwner ? 'hover:brightness-110' : 'cursor-default'} ${
                                  diff.type === 'CONTENT' ? 'bg-indigo-500/20 text-indigo-400' : 
                                  diff.type === 'LAYOUT' ? 'bg-amber-500/20 text-amber-400' :
                                  'bg-rose-500/20 text-rose-400'
                                }`}
                              >
                                {diff.type}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Description Section */}
                      <div className="group/field relative">
                        {inlineEdit?.id === diff.id && inlineEdit?.field === 'description' ? (
                          <div className="mt-1 editing-field" onClick={e => e.stopPropagation()}>
                            <textarea 
                              autoFocus
                              value={diff.description}
                              onChange={(e) => {
                                setDifferences(prev => prev.map(d => d.id === diff.id ? { ...d, description: e.target.value } : d));
                              }}
                              className="w-full bg-white/5 border border-indigo-500/50 rounded px-2 py-1 text-[11px] focus:outline-none h-20 resize-none"
                            />
                            <div className="flex justify-end mt-1">
                              <button onClick={() => setInlineEdit(null)} className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 font-bold">
                                <Check className="w-3 h-3" /> 保存
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="relative">
                            <p 
                              className={`text-[11px] text-gray-400 leading-relaxed line-clamp-3 group-hover:line-clamp-none transition-all pr-6 ${
                                selectedDiffId === diff.id && isOwner ? 'cursor-text hover:text-gray-300' : 'cursor-pointer'
                              }`}
                              onDoubleClick={(e) => {
                                if (selectedDiffId === diff.id && isOwner) {
                                  e.stopPropagation();
                                  setInlineEdit({ id: diff.id, field: 'description' });
                                }
                              }}
                            >
                              {diff.description}
                            </p>
                            {diff.imageUrl && (
                              <div className="mt-2">
                                <a 
                                  href={diff.imageUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-indigo-500/10 text-indigo-400 text-[10px] font-bold hover:bg-indigo-500/20 transition-colors"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Sparkles className="w-3 h-3" /> 查看对比图 (View Comparison)
                                </a>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      
                      {selectedDiffId === diff.id && isOwner && (
                        <div className="flex gap-2 mt-3 animate-in fade-in slide-in-from-top-1">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              updateDiffStatus(diff.id, 'fixed');
                            }}
                            className="flex-1 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-[10px] font-bold hover:bg-emerald-500/30 transition-colors"
                          >
                            Mark Fixed
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              updateDiffStatus(diff.id, 'ignored');
                            }}
                            className="flex-1 py-1.5 rounded-lg bg-white/5 text-gray-400 text-[10px] font-bold hover:bg-white/10 transition-colors"
                          >
                            Ignore
                          </button>
                        </div>
                      )}
                    </div>
                    <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${
                      diff.type === 'CONTENT' ? 'bg-indigo-500' : 
                      diff.type === 'LAYOUT' ? 'bg-amber-500' : 
                      'bg-rose-500'
                    }`} />
                  </div>
                </div>
              ))}
              
              {differences.some(d => d.status !== 'pending') && (
                <div className="pt-4 px-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Resolved</h4>
                  <div className="space-y-1 opacity-50">
                    {differences.filter(d => d.status !== 'pending').map(diff => (
                      <div key={diff.id} className="flex items-center justify-between p-2 rounded bg-white/5 text-[11px] group/resolved">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="truncate">{diff.title}</span>
                          <span className={`text-[8px] uppercase font-bold px-1 rounded ${
                            diff.status === 'fixed' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-gray-500/20 text-gray-400'
                          }`}>
                            {diff.status}
                          </span>
                        </div>
                        {isOwner && (
                          <button 
                            onClick={() => updateDiffStatus(diff.id, 'pending')}
                            className="opacity-0 group-hover/resolved:opacity-100 p-1 hover:bg-white/10 rounded text-indigo-400 transition-all"
                            title="恢复"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-8 pt-6 border-t border-white/5 text-center px-4 pb-4">
                <p className={`text-[10px] leading-relaxed ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                  本回答由 AI（{
                    selectedModel === 'gemini' ? 'Gemini 2.0 Flash' : 
                    selectedModel === 'kimi' ? 'Kimi Vision' : 
                    selectedModel === 'qwen' ? 'Qwen VL Max' : 
                    selectedModel === 'claude' ? 'Claude Sonnet 4' : 
                    selectedModel === 'gpt' ? 'GPT-4o' : 'Doubao'
                  }）生成，内容仅供参考
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4">
              {isAnalyzing ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Analyzing Fidelity...</p>
              </div>
            ) : showHistory ? (
              <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Saved Analyses</h3>
                  <button onClick={() => setShowHistory(false)} className="text-[10px] text-indigo-500 hover:underline">Back</button>
                </div>
                <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-120px)] pr-1">
                  {savedResults.length === 0 ? (
                    <div className="py-10 text-center">
                      <p className="text-[11px] text-gray-500">No saved analyses found.</p>
                    </div>
                  ) : (
                    savedResults.map(result => (
                      <div 
                        key={result.id}
                        onClick={() => loadResult(result)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer group ${
                          theme === 'dark' ? 'bg-[#2c2c2c] border-[#383838] hover:border-indigo-500/50' : 'bg-gray-50 border-gray-200 hover:border-indigo-500/50'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="text-[12px] font-bold truncate flex-1">{result.name}</h4>
                          {isOwner && (
                            <button 
                              onClick={(e) => deleteResult(result.id, e)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-rose-500 hover:bg-rose-500/10 rounded transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <div className="w-12 h-12 rounded border border-white/10 overflow-hidden shrink-0">
                            <img src={result.designImage} className="w-full h-full object-cover" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] text-gray-500">
                              {new Date(result.timestamp).toLocaleDateString()}
                            </p>
                            <p className="text-[10px] text-gray-400 truncate">
                              {result.differences?.length || 0} Diffs
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <>
                {error && (
                  <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 text-[11px] text-rose-500 leading-relaxed mb-4">
                    <div className="flex items-center gap-2 font-bold mb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                      Error
                    </div>
                    {error}
                  </div>
                )}

                {image && isOwner && (
                  <div className={`flex flex-col gap-6 pt-4 ${theme === 'dark' ? '' : ''}`}>
                    {/* Position & Alignment */}
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-3">
                        <label className={`text-[10px] uppercase tracking-widest font-bold ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                          Position
                        </label>
                        <div className="flex items-center gap-2">
                          <div className={`flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${theme === 'dark' ? 'bg-[#1e1e1e]' : 'bg-gray-100'}`}>
                            <span className="text-[10px] font-mono text-gray-400 w-3">X</span>
                            <input 
                              type="number" 
                              value={Math.round(position.x)} 
                              onChange={(e) => setPosition(prev => ({ ...prev, x: parseInt(e.target.value) || 0 }))}
                              className="w-full bg-transparent text-[11px] font-mono outline-none dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>
                          <div className={`flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${theme === 'dark' ? 'bg-[#1e1e1e]' : 'bg-gray-100'}`}>
                            <span className="text-[10px] font-mono text-gray-400 w-3">Y</span>
                            <input 
                              type="number" 
                              value={Math.round(position.y)} 
                              onChange={(e) => setPosition(prev => ({ ...prev, y: parseInt(e.target.value) || 0 }))}
                              className="w-full bg-transparent text-[11px] font-mono outline-none dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>
                          <button 
                            onClick={() => { align('center-h'); align('center-v'); }}
                            className={`p-2 rounded-lg transition-colors ${theme === 'dark' ? 'bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}
                            title="Center Image"
                          >
                            <Focus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3">
                        <label className={`text-[10px] uppercase tracking-widest font-bold ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                          Alignment
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                        <div className={`flex rounded p-0.5 gap-0.5 ${theme === 'dark' ? 'bg-[#1e1e1e]' : 'bg-gray-100'}`}>
                          <button onClick={() => align('left')} className={`flex-1 p-1.5 rounded transition-colors flex justify-center ${theme === 'dark' ? 'hover:bg-[#383838] text-gray-400 hover:text-white' : 'hover:bg-white text-gray-500 hover:text-black hover:shadow-sm'}`} title="Align Left">
                            <AlignStartVertical className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => align('center-h')} className={`flex-1 p-1.5 rounded transition-colors flex justify-center ${theme === 'dark' ? 'hover:bg-[#383838] text-gray-400 hover:text-white' : 'hover:bg-white text-gray-500 hover:text-black hover:shadow-sm'}`} title="Center Horizontal">
                            <AlignCenterVertical className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => align('right')} className={`flex-1 p-1.5 rounded transition-colors flex justify-center ${theme === 'dark' ? 'hover:bg-[#383838] text-gray-400 hover:text-white' : 'hover:bg-white text-gray-500 hover:text-black hover:shadow-sm'}`} title="Align Right">
                            <AlignEndVertical className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className={`flex rounded p-0.5 gap-0.5 ${theme === 'dark' ? 'bg-[#1e1e1e]' : 'bg-gray-100'}`}>
                          <button onClick={() => align('top')} className={`flex-1 p-1.5 rounded transition-colors flex justify-center ${theme === 'dark' ? 'hover:bg-[#383838] text-gray-400 hover:text-white' : 'hover:bg-white text-gray-500 hover:text-black hover:shadow-sm'}`} title="Align Top">
                            <AlignStartHorizontal className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => align('center-v')} className={`flex-1 p-1.5 rounded transition-colors flex justify-center ${theme === 'dark' ? 'hover:bg-[#383838] text-gray-400 hover:text-white' : 'hover:bg-white text-gray-500 hover:text-black hover:shadow-sm'}`} title="Center Vertical">
                            <AlignCenterHorizontal className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => align('bottom')} className={`flex-1 p-1.5 rounded transition-colors flex justify-center ${theme === 'dark' ? 'hover:bg-[#383838] text-gray-400 hover:text-white' : 'hover:bg-white text-gray-500 hover:text-black hover:shadow-sm'}`} title="Align Bottom">
                            <AlignEndHorizontal className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Opacity & Blending */}
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                          <label className={`text-[10px] uppercase tracking-widest font-bold ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                            Opacity
                          </label>
                          <span className={`text-[10px] font-mono ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>{Math.round(opacity * 100)}%</span>
                        </div>
                        <input 
                          type="range" 
                          min="0" max="1" step="0.01" 
                          value={opacity} 
                          onChange={(e) => setOpacity(parseFloat(e.target.value))}
                          className={`w-full accent-indigo-500 h-1 rounded-lg appearance-none cursor-pointer ${theme === 'dark' ? 'bg-[#1e1e1e]' : 'bg-gray-200'}`}
                        />
                      </div>
                    </div>

                    {/* Scale */}
                    <div className="flex flex-col gap-3">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <label className={`text-[10px] uppercase tracking-widest font-bold ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                            Scale
                          </label>
                          <button onClick={resetTransform} className="text-indigo-500 hover:text-indigo-600 transition-colors" title="Reset">
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        </div>
                        <span className={`text-[10px] font-mono ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>{Math.round(scale * 100)}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0.1" max="3" step="0.01" 
                        value={scale} 
                        onChange={(e) => setScale(parseFloat(e.target.value))}
                        className={`w-full accent-indigo-500 h-1 rounded-lg appearance-none cursor-pointer ${theme === 'dark' ? 'bg-[#1e1e1e]' : 'bg-gray-200'}`}
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        {isOwner && image && liveImage && (
          <div className={`p-0 border-t shrink-0 ${theme === 'dark' ? 'bg-[#1e1e1e] border-white/10' : 'bg-white border-black/5'}`}>
            <div className="flex items-center">
              <div className="w-1/4">
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value as any)}
                  className={`w-full text-[11px] font-bold px-2 py-3 border-r transition-colors focus:outline-none ${
                    theme === 'dark' 
                      ? 'bg-[#2c2c2c] border-[#383838] text-gray-300 focus:border-indigo-500' 
                      : 'bg-gray-50 border-gray-200 text-gray-600 focus:border-indigo-500'
                  }`}
                >
                  <option value="gemini">Gemini 2.0 Flash</option>
                  <option value="claude">Claude Sonnet 4</option>
                  <option value="gpt">GPT-4o</option>
                  <option value="qwen">Qwen VL Max</option>
                  <option value="kimi">Kimi Vision</option>
                  <option value="doubao">Doubao</option>
                </select>
              </div>
              {isAnalyzing ? (
                <button 
                  onClick={stopAnalysis}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white text-[12px] font-bold transition-all flex items-center justify-center gap-2"
                >
                  <X className="w-4 h-4" />
                  <span>Stop Analysis</span>
                </button>
              ) : (
                <button 
                  onClick={() => analyzeFidelity()}
                  disabled={!image || !liveImage}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-[12px] font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{differences.length > 0 ? 'Re-generate Analysis' : 'Start Analysis'}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    )}
    </div>
  </div>
</div>

    {/* Auth Modal removed (local dev: no login) */}

    {/* Save Analysis Modal */}
    <AnimatePresence>
      {showSaveModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200 dark:border-white/10"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold dark:text-white">Save Analysis</h2>
                <button onClick={() => setShowSaveModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full dark:text-gray-400">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Analysis Name</label>
                  <input 
                    type="text" 
                    maxLength={100}
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    autoFocus
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-white/5 border border-transparent focus:border-indigo-500 rounded-xl outline-none transition-all dark:text-white"
                    placeholder="e.g. Homepage Review"
                  />
                </div>
              </div>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-white/5 flex gap-3">
              <button 
                onClick={() => setShowSaveModal(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmSave}
                disabled={isSaving}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-lg shadow-indigo-500/20 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Analysis'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>

    {/* Delete Confirmation Modal */}
    <AnimatePresence>
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-gray-200 dark:border-white/10"
          >
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-rose-50 dark:bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold mb-2 dark:text-white">Delete Analysis?</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                This action cannot be undone. This saved analysis will be permanently removed.
              </p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-white/5 flex gap-3">
              <button 
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDeleteResult}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-rose-500 hover:bg-rose-600 rounded-xl transition-colors shadow-lg shadow-rose-500/20"
              >
                Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>

    {/* Toast Notification */}
    <AnimatePresence>
      {toast && (
        <motion.div 
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          onAnimationComplete={() => setTimeout(() => setToast(null), 3000)}
          className={`fixed bottom-24 right-8 z-[400] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border ${
            toast.type === 'success' 
              ? 'bg-emerald-500 text-white border-emerald-400' 
              : 'bg-rose-500 text-white border-rose-400'
          }`}
        >
          {toast.type === 'success' ? <Zap className="w-5 h-5" /> : <X className="w-5 h-5" />}
          <span className="text-sm font-medium">{toast.message}</span>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<ProjectManagement />} />
        <Route path="/checker" element={<DesignChecker />} />
        <Route path="/checker/:projectId" element={<DesignChecker />} />
      </Routes>
    </>
  );
}
