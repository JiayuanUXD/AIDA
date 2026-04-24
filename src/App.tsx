import React, { useState, useEffect, Component, ErrorInfo } from "react";
import { analyzeUiDifferences } from "./services/aiAnalyzerService";
import { Header } from "./components/workspace/Header";
import { DifferencesPanel } from "./components/workspace/DifferencesPanel";
import { SplitView } from "./components/workspace/SplitView";
import { SliderView } from "./components/workspace/SliderView";
import { OverlayDiffView } from "./components/workspace/OverlayDiffView";
import {
  Upload,
  Eye,
  EyeOff,
  Layers,
  RotateCcw,
  Link as LinkIcon,
  Loader2,
  Focus,
  Sun,
  Moon,
  Split,
  Columns2,
  Zap,
  X,
  MessageSquare,
  Trash2,
  Save,
  History,
  LogIn,
  LogOut,
  ArrowLeft,
  Check,
  Edit3,
  ChevronLeft,
  Plus,
  Sparkles,
  Layout,
  Palette,
  Type,
} from "lucide-react";
import { auth, db, storage } from "./lib/firebase";
import {
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  User,
  signOut,
} from "firebase/auth";
import {
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  orderBy,
  deleteDoc,
  doc,
  getDocFromServer,
  getDoc,
  updateDoc,
  setDoc,
} from "firebase/firestore";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { Routes, Route, useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import ProjectManagement from "./pages/ProjectManagement";
import AuthModal from "./components/AuthModal";

import { Difference } from "./types";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
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
              The application encountered an unexpected error. Please try
              refreshing the page.
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

const compressImage = (
  base64: string,
  maxWidth = 4096,
  quality = 0.95,
): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    // Set crossOrigin to anonymous to avoid tainted canvas when loading from URLs (like Firebase Storage)
    if (!base64.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (maxWidth / width) * height;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        // Use jpeg for better compression
        resolve(canvas.toDataURL("image/jpeg", quality));
      } else {
        resolve(base64);
      }
    };
    img.onerror = () => resolve(base64);
  });
};

function DesignChecker({ resolvedTheme }: { resolvedTheme: "light" | "dark" }) {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [savedResults, setSavedResults] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "saved" | "saving" | "unsaved" | "error"
  >("saved");
  const [showHistory, setShowHistory] = useState(false);

  const theme = resolvedTheme;

  const [comparisonMode, setComparisonMode] = useState<
    "overlay" | "slider" | "split" | "diff"
  >("split");
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isResizingSlider, setIsResizingSlider] = useState(false);
  const [url, setUrl] = useState("");
  const [inputUrl, setInputUrl] = useState("");
  const [liveSourceType, setLiveSourceType] = useState<"url" | "sim" | "image">(
    "image",
  );
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
  const [designSourceType, setDesignSourceType] = useState<"upload" | "figma">(
    "upload",
  );
  const [figmaUrl, setFigmaUrl] = useState("");
  const [isFetchingFigma, setIsFetchingFigma] = useState(false);
  const [showCrosshair, setShowCrosshair] = useState(false);
  const [crosshairPos, setCrosshairPos] = useState({ x: 0, y: 0 });
  const [differences, setDifferences] = useState<Difference[]>([]);
  const [severityFilter, setSeverityFilter] = useState<
    "all" | "high" | "medium" | "low"
  >("all");
  const [selectedModel, setSelectedModel] = useState<
    "gemini" | "kimi" | "doubao"
  >("gemini");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedDiffId, setSelectedDiffId] = useState<string | null>(null);
  const [editingDiffId, setEditingDiffId] = useState<string | null>(null);
  const [editType, setEditType] = useState<
    | "move"
    | "resize-nw"
    | "resize-ne"
    | "resize-sw"
    | "resize-se"
    | "resize-n"
    | "resize-s"
    | "resize-e"
    | "resize-w"
    | null
  >(null);
  const [editStartPos, setEditStartPos] = useState({ x: 0, y: 0 });
  const [editStartRect, setEditStartRect] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const [isAddingDiff, setIsAddingDiff] = useState(false);
  const [newDiffStart, setNewDiffStart] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [inlineEdit, setInlineEdit] = useState<{
    id: string;
    field: "title" | "description" | "type";
  } | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [confirmingDeleteRoundId, setConfirmingDeleteRoundId] = useState<
    string | null
  >(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [projectName, setProjectName] = useState("Untitled Project");
  const [isOwner, setIsOwner] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [rounds, setRounds] = useState<any[]>([]);
  const [currentRoundId, setCurrentRoundId] = useState<string | null>(null);
  const [isCreatingRound, setIsCreatingRound] = useState(false);
  const [showRoundsPanel, setShowRoundsPanel] = useState(false);
  const [tempName, setTempName] = useState("");
  const skipNextAutoSave = React.useRef(false);
  const lastSavedDataRef = React.useRef<string>("");
  const isSavingRef = React.useRef(false);
  const currentImageRef = React.useRef<string | null>(null);
  const currentLiveImageRef = React.useRef<string | null>(null);

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
  const isEmptyProjectRef = React.useRef(false);

  useEffect(() => {
    if (!isLoading) {
      isEmptyProjectRef.current = !!(
        projectId &&
        isOwner &&
        projectName === "New Project" &&
        !image &&
        !liveImage &&
        differences.length === 0 &&
        rounds.length === 0
      );
    }
  }, [projectId, isOwner, projectName, image, liveImage, differences.length, rounds.length, isLoading]);

  useEffect(() => {
    return () => {
      if (isEmptyProjectRef.current && projectId) {
        deleteDoc(doc(db, "projects", projectId)).catch(e => console.error(e));
      }
    };
  }, [projectId]);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);
  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);
  useEffect(() => {
    dragStartRef.current = dragStart;
  }, [dragStart]);
  useEffect(() => {
    comparisonModeRef.current = comparisonMode;
  }, [comparisonMode]);
  useEffect(() => {
    editTypeRef.current = editType;
  }, [editType]);
  useEffect(() => {
    editStartPosRef.current = editStartPos;
  }, [editStartPos]);
  useEffect(() => {
    editStartRectRef.current = editStartRect;
  }, [editStartRect]);
  useEffect(() => {
    editingDiffIdRef.current = editingDiffId;
  }, [editingDiffId]);
  useEffect(() => {
    isAddingDiffRef.current = isAddingDiff;
  }, [isAddingDiff]);
  useEffect(() => {
    newDiffStartRef.current = newDiffStart;
  }, [newDiffStart]);
  useEffect(() => {
    imageSizeRef.current = imageSize;
  }, [imageSize]);
  useEffect(() => {
    currentImageRef.current = image;
  }, [image]);
  useEffect(() => {
    currentLiveImageRef.current = liveImage;
  }, [liveImage]);

  useEffect(() => {
    if (user) {
      const q = query(
        collection(db, "analysisResults"),
        orderBy("timestamp", "desc"),
      );
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const results = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          setSavedResults(results);
        },
        (error) => {
          console.error("Error fetching analysis results:", error);
        },
      );
      return () => unsubscribe();
    } else {
      setSavedResults([]);
    }
  }, [user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;

    if (user && projectId) {
      const loadProject = async () => {
        setIsLoading(true);
        try {
          const docSnap = await getDoc(doc(db, "projects", projectId));
          if (docSnap.exists()) {
            const data = docSnap.data();
            // Ownership logic: unowned or matching UID
            const hasOwnership = !data.userId || data.userId === user.uid;
            setIsOwner(hasOwnership);

            if (data.name) {
              setProjectName(data.name);
              setTempName(data.name);
            }
            if (data.analysisData) {
              const ad = data.analysisData;
              if (ad.image) setImage(ad.image);
              if (ad.liveImage) setLiveImage(ad.liveImage);
              if (ad.differences) {
                setDifferences(ad.differences);
                skipNextAutoSave.current = true;
              }
              if (ad.url) setUrl(ad.url);
              if (ad.figmaUrl) setFigmaUrl(ad.figmaUrl);
              if (ad.opacity) setOpacity(ad.opacity);
              if (ad.scale) setScale(ad.scale);
              if (ad.position) setPosition(ad.position);
            }
          } else {
            // New project with active ID (if created via nav)
            setIsOwner(true);
          }
        } catch (error) {
          console.error("Error loading project:", error);
        } finally {
          setIsLoading(false);
        }
      };
      loadProject();
    } else if (!projectId) {
      setIsLoading(false);
      setIsOwner(true);
    } else if (!user && isAuthReady) {
      // Trigger anonymous login instead of showing modal
      signInAnonymously(auth).catch((err) => {
        console.error("Anonymous auth failed:", err);
        setIsLoading(false);
        setShowAuthModal(true); // Fallback
      });
    }
  }, [user, projectId, isAuthReady]);

  useEffect(() => {
    if (user && projectId) {
      const q = query(
        collection(db, "projects", projectId, "rounds"),
        orderBy("timestamp", "desc"),
      );
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const fetchedRounds = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          setRounds(fetchedRounds);
        },
        (error) => {
          console.error("Error fetching rounds:", error);
        },
      );
      return () => unsubscribe();
    } else {
      setRounds([]);
    }
  }, [user, projectId]);

  const initiateDeleteRound = (roundId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmingDeleteRoundId(roundId);
    setTimeout(() => {
      setConfirmingDeleteRoundId((current) =>
        current === roundId ? null : current,
      );
    }, 3000);
  };

  const executeDeleteRound = async (roundId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!projectId || !isOwner) return;

    try {
      await deleteDoc(doc(db, "projects", projectId, "rounds", roundId));
      setToast({ message: "Round deleted successfully", type: "success" });
      if (currentRoundId === roundId) setCurrentRoundId(null);
      setConfirmingDeleteRoundId(null);
    } catch (error) {
      console.error("Error deleting round:", error);
      setToast({ message: "Failed to delete round", type: "error" });
    }
  };

  const createNewRound = async (notes: string = "") => {
    if (!user || !projectId || !isOwner) return;
    setIsCreatingRound(true);
    try {
      const roundNumber = rounds.length + 1;
      const roundData = {
        projectId,
        roundNumber,
        status: "Pending",
        designImage: image,
        buildImage: liveImage,
        differences,
        notes,
        timestamp: Date.now(),
        userId: user.uid,
      };
      const docRef = await addDoc(
        collection(db, "projects", projectId, "rounds"),
        roundData,
      );
      setToast({
        message: `Round ${roundNumber} created successfully`,
        type: "success",
      });
      setCurrentRoundId(docRef.id);
    } catch (error) {
      console.error("Error creating round:", error);
      setToast({ message: "Failed to create round", type: "error" });
    } finally {
      setIsCreatingRound(false);
    }
  };

  const loadRound = (round: any) => {
    if (round.designImage) setImage(round.designImage);
    if (round.buildImage) setLiveImage(round.buildImage);
    if (round.differences) setDifferences(round.differences);
    setCurrentRoundId(round.id);
  };

  const updateRoundStatus = async (roundId: string, newStatus: string) => {
    if (!user || !projectId || !isOwner) return;
    try {
      await updateDoc(doc(db, "projects", projectId, "rounds", roundId), {
        status: newStatus,
        updatedAt: Date.now(),
      });
      setToast({
        message: `Round status updated to ${newStatus}`,
        type: "success",
      });
    } catch (error) {
      console.error("Error updating round status:", error);
      setToast({ message: "Failed to update status", type: "error" });
    }
  };

  const handleNameSave = () => {
    if (!tempName.trim()) return;
    setProjectName(tempName.trim());
    setIsEditingName(false);
  };

  const saveProjectData = async () => {
    if (!user || !projectId || !isOwner || isSavingRef.current) return;

    // Create a fingerprint of current state to avoid redundant saves
    const currentState = JSON.stringify({
      image,
      liveImage,
      differences,
      url,
      figmaUrl,
      opacity,
      scale,
      position,
      projectName,
      currentRoundId,
    });

    if (currentState === lastSavedDataRef.current) {
      setSaveStatus("saved");
      return;
    }

    setSaveStatus("saving");
    setIsSaving(true);
    isSavingRef.current = true;

    // Capture values at the start of the save operation
    const startingImage = image;
    const startingLiveImage = liveImage;

    try {
      let finalImageUrl = image;
      let finalLiveImageUrl = liveImage;

      // Upload to Firebase Storage if it's a base64 string
      if (image && image.startsWith("data:image")) {
        const imageRef = ref(
          storage,
          `projects/${projectId}/design_${Date.now()}.jpg`,
        );
        await uploadString(imageRef, image, "data_url");
        finalImageUrl = await getDownloadURL(imageRef);
      }

      if (liveImage && liveImage.startsWith("data:image")) {
        const liveImageRef = ref(
          storage,
          `projects/${projectId}/build_${Date.now()}.jpg`,
        );
        await uploadString(liveImageRef, liveImage, "data_url");
        finalLiveImageUrl = await getDownloadURL(liveImageRef);
      }

      // Create a small thumbnail for the dashboard
      const thumbnail = finalImageUrl
        ? await compressImage(finalImageUrl, 400, 0.6)
        : finalLiveImageUrl
          ? await compressImage(finalLiveImageUrl, 400, 0.6)
          : null;

      const analysisData = {
        image: finalImageUrl,
        liveImage: finalLiveImageUrl,
        differences,
        url,
        figmaUrl,
        opacity,
        scale,
        position,
        timestamp: Date.now(),
      };

      try {
        await setDoc(
          doc(db, "projects", projectId),
          {
            name: projectName,
            userId: user.uid,
            analysisData,
            updatedAt: Date.now(),
            thumbnail:
              thumbnail ||
              "https://picsum.photos/seed/" + projectId + "/400/300",
          },
          { merge: true },
        );
      } catch (e: any) {
        console.error("Error saving projects/projectId doc:", e);
        throw e;
      }

      if (currentRoundId) {
        try {
          await updateDoc(
            doc(db, "projects", projectId, "rounds", currentRoundId),
            {
              differences,
              updatedAt: Date.now(),
            },
          );
        } catch (e: any) {
          console.error("Error saving nested round doc:", e);
          throw e;
        }
      }

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
      setSaveStatus("saved");
    } catch (error: any) {
      console.error("Error saving project data:", error);
      setSaveStatus("error");
      let msg = "Failed to save project data.";
      if (error.message?.includes("exceeds the maximum allowed size")) {
        msg =
          "Project data is too large for Firestore. Using Firebase Storage should have fixed this, please try again.";
      }
      setToast({ message: msg, type: "error" });
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
      image,
      liveImage,
      differences,
      url,
      figmaUrl,
      opacity,
      scale,
      position,
      projectName,
      currentRoundId,
    });
    if (currentState === lastSavedDataRef.current) return;

    setSaveStatus("unsaved");

    const timer = setTimeout(() => {
      saveProjectData();
    }, 2000); // Save after 2 seconds of inactivity

    return () => clearTimeout(timer);
  }, [
    differences,
    opacity,
    scale,
    position,
    projectName,
    url,
    figmaUrl,
    image,
    liveImage,
    isOwner,
    isAnalyzing,
    isLoading,
    isSaving,
    currentRoundId,
  ]);

  // Test connection
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, "test", "connection"));
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("the client is offline")
        ) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();
  }, []);

  // Sync liveStream to video element whenever it changes or video element mounts
  useEffect(() => {
    if (liveStream && videoRef.current) {
      videoRef.current.srcObject = liveStream;
    }
  }, [liveStream, videoRef.current]);

  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const analyzeFidelity = async () => {
    if (!image || !liveImage || !isOwner) return;
    setIsAnalyzing(true);
    setDifferences([]);
    setSelectedDiffId(null);
    setError(null);
    
    const controller = new AbortController();
    setAbortController(controller);
    
    try {
      const diffsWithIds = await analyzeUiDifferences({
        designImageStr: image,
        buildImageStr: liveImage,
        selectedModel,
        liveImageSize,
        abortSignal: controller.signal
      });

      setDifferences(diffsWithIds);
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        console.log('Analysis was cancelled');
        return;
      }
      console.error("Analysis error:", err);
      setError(`Analysis error: ${err.message || "Unknown error"}`);
    } finally {
      setIsAnalyzing(false);
      setAbortController(null);
    }
  };

  const cancelAnalysis = () => {
    if (abortController) {
      abortController.abort();
    }
  };

  const forkProject = async () => {
    if (!user || !projectId) return;
    setIsSaving(true);
    setSaveStatus("saving");
    try {
      const newProjectRef = doc(collection(db, "projects"));
      const newId = newProjectRef.id;

      const analysisData = {
        image,
        liveImage,
        differences,
        url,
        figmaUrl,
        opacity,
        scale,
        position,
        timestamp: Date.now(),
      };

      await setDoc(newProjectRef, {
        name: `${projectName} (Forked)`,
        userId: user.uid,
        analysisData,
        updatedAt: Date.now(),
        thumbnail: "https://picsum.photos/seed/" + newId + "/400/300",
      });

      setToast({ message: "Project forked successfully!", type: "success" });
      navigate(`/checker/${newId}`);
    } catch (error) {
      console.error("Error forking project:", error);
      setToast({ message: "Failed to fork project", type: "error" });
    } finally {
      setIsSaving(false);
      setSaveStatus("saved");
    }
  };

  const handleSave = async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }

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
    if (!user || !saveName.trim()) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, "analysisResults"), {
        name: saveName,
        designImage: image,
        buildImage: liveImage,
        differences,
        url,
        figmaUrl,
        opacity,
        scale,
        position,
        timestamp: Date.now(),
        userId: user.uid,
      });
      setShowSaveModal(false);
      setToast({ message: "Analysis saved successfully!", type: "success" });
    } catch (err) {
      console.error("Save error:", err);
      setError("Failed to save analysis result.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogin = async () => {
    setShowAuthModal(true);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const loadResult = (result: any) => {
    setImage(result.designImage);
    setLiveImage(result.buildImage);
    setDifferences(result.differences || []);
    skipNextAutoSave.current = true;
    setUrl(result.url || "");
    setFigmaUrl(result.figmaUrl || "");
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
      await deleteDoc(doc(db, "analysisResults", deleteConfirmId));
      setDeleteConfirmId(null);
      setToast({ message: "Analysis deleted successfully!", type: "success" });
    } catch (err) {
      console.error("Delete error:", err);
      setError("Failed to delete analysis result.");
    }
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current) {
        let newX = e.clientX - dragStartRef.current.x;
        let newY = e.clientY - dragStartRef.current.y;

        // Snap to center/0 if close enough (edges of build layout)
        const SNAP_THRESHOLD = 15;
        if (Math.abs(newX) < SNAP_THRESHOLD) newX = 0;
        if (Math.abs(newY) < SNAP_THRESHOLD) newY = 0;

        setPosition({ x: newX, y: newY });
      }

      if (editingDiffIdRef.current && editTypeRef.current) {
        const dx = (e.clientX - editStartPosRef.current.x) / scaleRef.current;
        const dy = (e.clientY - editStartPosRef.current.y) / scaleRef.current;
        const start = editStartRectRef.current;

        setDifferences((prev) =>
          prev.map((d) => {
            if (d.id !== editingDiffIdRef.current) return d;

            let { x, y, width, height } = start;

            switch (editTypeRef.current) {
              case "move":
                x += dx;
                y += dy;
                break;
              case "resize-n":
                y += dy;
                height -= dy;
                break;
              case "resize-s":
                height += dy;
                break;
              case "resize-e":
                width += dx;
                break;
              case "resize-w":
                x += dx;
                width -= dx;
                break;
              case "resize-nw":
                x += dx;
                y += dy;
                width -= dx;
                height -= dy;
                break;
              case "resize-ne":
                y += dy;
                width += dx;
                height -= dy;
                break;
              case "resize-sw":
                x += dx;
                width -= dx;
                height += dy;
                break;
              case "resize-se":
                width += dx;
                height += dy;
                break;
            }

            // Ensure minimum size
            if (width < 10) width = 10;
            if (height < 10) height = 10;

            return { ...d, rect: { x, y, width, height } };
          }),
        );
      }

      if (
        isAddingDiffRef.current &&
        newDiffStartRef.current &&
        drawingRectRef.current
      ) {
        const rect = drawingRectRef.current;
        const currentX = (e.clientX - rect.left) / scaleRef.current;
        const currentY = (e.clientY - rect.top) / scaleRef.current;

        const x = Math.max(
          0,
          Math.min(
            imageSizeRef.current.width || 10000,
            Math.min(newDiffStartRef.current.x, currentX),
          ),
        );
        const y = Math.max(
          0,
          Math.min(
            imageSizeRef.current.height || 10000,
            Math.min(newDiffStartRef.current.y, currentY),
          ),
        );
        const width = Math.min(
          imageSizeRef.current.width || 10000,
          Math.abs(currentX - newDiffStartRef.current.x),
        );
        const height = Math.min(
          imageSizeRef.current.height || 10000,
          Math.abs(currentY - newDiffStartRef.current.y),
        );

        if (width > 2 && height > 2) {
          setDifferences((prev) => {
            const filtered = prev.filter((d) => d.id !== "temp-new");
            return [
              ...filtered,
              {
                id: "temp-new",
                title: "手动标记",
                type: "layout",
                description: "手动添加的差异区域。",
                rect: { x, y, width, height },
                status: "pending",
                severity: "medium",
              },
            ];
          });
        }
      }

      if (isResizingSlider) {
        const previewArea = document.getElementById("preview-area");
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

          const percentage = Math.max(
            0,
            Math.min(100, (x / viewportWidth) * 100),
          );
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
        setDifferences((prev) => {
          const temp = prev.find((d) => d.id === "temp-new");
          if (temp && temp.rect.width > 5 && temp.rect.height > 5) {
            return prev.map((d) => {
              if (d.id === "temp-new") {
                return { ...d, id: prev.length.toString() };
              }
              return d;
            });
          }
          return prev.filter((d) => d.id !== "temp-new");
        });
        setNewDiffStart(null);
        drawingRectRef.current = null;
      }
    };

    if (isDragging || isResizingSlider || editingDiffId || isAddingDiff) {
      window.addEventListener("mousemove", handleGlobalMouseMove);
      window.addEventListener("mouseup", handleGlobalMouseUp);
    }

    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      if (inlineEdit) {
        // If clicking outside the editing area, save (set null)
        if (!target.closest(".editing-field")) {
          setInlineEdit(null);
        }
      } else if (selectedDiffId) {
        if (!target.closest(".difference-item")) {
          setSelectedDiffId(null);
        }
      }
    };

    if (selectedDiffId || inlineEdit) {
      window.addEventListener("mousedown", handleGlobalClick);
    }

    const handleWheel = (e: WheelEvent) => {
      // Ignore if scrolling inside the control panels
      const target = e.target as HTMLElement;
      if (
        target.closest(".control-panel") ||
        target.closest(".comparison-panel")
      )
        return;
      if (target.closest(".w-96")) return; // Right sidebar
      if (target.closest("header")) return; // Top header

      // Prevent default to disable native page scrolling via mouse wheel across all 4 modes
      e.preventDefault();

      if (image && comparisonMode === "overlay") {
        setOpacity((prev) => {
          const delta = -e.deltaY * 0.0005;
          const next = Math.min(1, Math.max(0, prev + delta));
          return next;
        });
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: false });

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedDiffId &&
        isOwner
      ) {
        setDifferences((prev) => prev.filter((d) => d.id !== selectedDiffId));
        setSelectedDiffId(null);
      }

      if (e.key.toLowerCase() === "r" && isOwner) {
        setIsAddingDiff((prev) => !prev);
      }

      if (e.key === "Escape") {
        setIsAddingDiff(false);
        setSelectedDiffId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
      window.removeEventListener("mousedown", handleGlobalClick);
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    isDragging,
    isResizingSlider,
    dragStart,
    image,
    imageSize,
    scale,
    position,
    isVisible,
    comparisonMode,
    selectedDiffId,
    editingDiffId,
    isAddingDiff,
    inlineEdit,
    isOwner,
  ]);

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
      y: e.clientY - position.y,
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
        setLiveSourceType("image");

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
          displaySurface: "window",
        },
        audio: false,
      });
      setLiveStream(stream);
      setLiveImage(null); // Clear image if stream is started
      setError(null);
    } catch (err: any) {
      console.error("Error starting screen capture:", err);
      setError(
        err.message ||
          "Failed to start screen capture. Please check permissions.",
      );
      setTimeout(() => setError(null), 5000);
    }
  };

  const stopLiveCapture = () => {
    if (liveStream) {
      liveStream.getTracks().forEach((track) => track.stop());
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
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          // Use jpeg and compress with very high quality
          const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
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
      const response = await fetch("/api/figma/fetch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: figmaUrl }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch Figma image");
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
      setError(
        err.message ||
          "Failed to fetch Figma image. Check your URL and FIGMA_ACCESS_TOKEN.",
      );
    } finally {
      setIsFetchingFigma(false);
    }
  };

  const updateDiffStatus = (
    id: string,
    status: "pending" | "fixed" | "ignored",
  ) => {
    if (!isOwner) return;
    setDifferences((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status } : d)),
    );
    if (selectedDiffId === id) setSelectedDiffId(null);
  };

  const renderDifferenceBoxes = (paneType: "design" | "build") => {
    return differences
      .filter((d) => d.status === "pending")
      .map((diff) => {
        const isSelected = selectedDiffId === diff.id;
        const color =
          diff.type === "content"
            ? "#6366f1"
            : diff.type === "layout"
              ? "#f59e0b"
              : "#f43f5e";
        const colorRgb =
          diff.type === "content"
            ? "99, 102, 241"
            : diff.type === "layout"
              ? "245, 158, 11"
              : "244, 63, 94";

        return (
          <div
            key={diff.id}
            className={`absolute border-2 transition-all z-[60] difference-item ${
              isSelected ? "" : "hover:brightness-110"
            }`}
            style={{
              left: `${diff.rect.x}px`,
              top: `${diff.rect.y}px`,
              width: `${diff.rect.width}px`,
              height: `${diff.rect.height}px`,
              cursor:
                editingDiffId === diff.id
                  ? "grabbing"
                  : isSelected
                    ? "move"
                    : "pointer",
              borderColor: isSelected ? color : `rgba(${colorRgb}, 0.4)`,
              backgroundColor: isSelected
                ? `rgba(${colorRgb}, 0.1)`
                : "transparent",
            }}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedDiffId(diff.id);
            }}
            onMouseDown={(e) => {
              if (e.button !== 0 || !isOwner) return;
              e.stopPropagation();
              setEditingDiffId(diff.id);
              setEditType("move");
              setEditStartPos({ x: e.clientX, y: e.clientY });
              setEditStartRect({ ...diff.rect });
            }}
          >
            {/* Resize Handles */}
            {isSelected && isOwner && (
              <>
                {[
                  {
                    type: "resize-nw",
                    pos: "-top-1 -left-1",
                    cursor: "nw-resize",
                    isCorner: true,
                  },
                  {
                    type: "resize-ne",
                    pos: "-top-1 -right-1",
                    cursor: "ne-resize",
                    isCorner: true,
                  },
                  {
                    type: "resize-sw",
                    pos: "-bottom-1 -left-1",
                    cursor: "sw-resize",
                    isCorner: true,
                  },
                  {
                    type: "resize-se",
                    pos: "-bottom-1 -right-1",
                    cursor: "se-resize",
                    isCorner: true,
                  },
                  {
                    type: "resize-n",
                    pos: "-top-1 left-1 right-1 h-2",
                    cursor: "n-resize",
                    isCorner: false,
                  },
                  {
                    type: "resize-s",
                    pos: "-bottom-1 left-1 right-1 h-2",
                    cursor: "s-resize",
                    isCorner: false,
                  },
                  {
                    type: "resize-w",
                    pos: "top-1 bottom-1 -left-1 w-2",
                    cursor: "w-resize",
                    isCorner: false,
                  },
                  {
                    type: "resize-e",
                    pos: "top-1 bottom-1 -right-1 w-2",
                    cursor: "e-resize",
                    isCorner: false,
                  },
                ].map((handle) => (
                  <div
                    key={handle.type}
                    className={`absolute ${handle.pos} z-[70] ${
                      handle.isCorner
                        ? "w-2 h-2 bg-white border-2 rounded-full"
                        : ""
                    }`}
                    style={{
                      borderColor: handle.isCorner ? color : "transparent",
                      cursor: handle.cursor,
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
    const yInPane = e.clientY - rect.top;
    setCrosshairPos({
      x: xInPane,
      y: yInPane,
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
            <Layers
              className={`w-12 h-12 ${theme === "dark" ? "text-gray-700" : "text-gray-300"}`}
            />
            <h3
              className={`text-sm font-bold uppercase tracking-widest ${theme === "dark" ? "text-gray-500" : "text-gray-400"}`}
            >
              Design Source
            </h3>
            <p
              className={`text-xs ${theme === "dark" ? "text-gray-600" : "text-gray-400"}`}
            >
              No design source provided by the owner.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center gap-6 p-8">
        <div className="flex flex-col items-center gap-2">
          <Layers
            className={`w-12 h-12 ${theme === "dark" ? "text-gray-700" : "text-gray-300"}`}
          />
          <h3
            className={`text-sm font-bold uppercase tracking-widest ${theme === "dark" ? "text-gray-500" : "text-gray-400"}`}
          >
            Design Source
          </h3>
        </div>

        <div className="flex flex-col gap-4 w-80">
          <div
            className={`flex rounded-xl p-1 ${theme === "dark" ? "bg-[#1e1e1e]" : "bg-gray-100"}`}
          >
            <button
              onClick={() => setDesignSourceType("upload")}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                designSourceType === "upload"
                  ? theme === "dark"
                    ? "bg-[#383838] text-white shadow-lg"
                    : "bg-white text-black shadow-md"
                  : theme === "dark"
                    ? "text-gray-500 hover:text-gray-300"
                    : "text-gray-400 hover:text-gray-600"
              }`}
            >
              Upload Image
            </button>
            <button
              onClick={() => setDesignSourceType("figma")}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                designSourceType === "figma"
                  ? theme === "dark"
                    ? "bg-[#383838] text-white shadow-lg"
                    : "bg-white text-black shadow-md"
                  : theme === "dark"
                    ? "text-gray-500 hover:text-gray-300"
                    : "text-gray-400 hover:text-gray-600"
              }`}
            >
              Figma URL
            </button>
          </div>

          <div className="h-32 flex flex-col justify-center">
            {designSourceType === "upload" ? (
              <label
                className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl h-full cursor-pointer transition-all group ${
                  theme === "dark"
                    ? "bg-[#1e1e1e] hover:bg-[#252525] border-[#383838] hover:border-indigo-500/50"
                    : "bg-white hover:bg-gray-50 border-gray-200 hover:border-indigo-500/50"
                }`}
              >
                <Upload
                  className={`w-6 h-6 group-hover:text-indigo-500 transition-colors ${theme === "dark" ? "text-gray-600" : "text-gray-400"}`}
                />
                <span
                  className={`text-[11px] font-bold uppercase tracking-tight ${theme === "dark" ? "text-gray-500" : "text-gray-400"}`}
                >
                  Select Image
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />
              </label>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <LinkIcon
                      className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${theme === "dark" ? "text-gray-600" : "text-gray-400"}`}
                    />
                    <input
                      type="text"
                      value={figmaUrl}
                      onChange={(e) => setFigmaUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleFigmaFetch()}
                      className={`w-full border rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all ${
                        theme === "dark"
                          ? "bg-[#1e1e1e] border-[#383838] text-white placeholder-gray-600"
                          : "bg-white border-gray-200 text-black placeholder-gray-400"
                      }`}
                      placeholder="Paste Figma URL..."
                    />
                  </div>
                  <button
                    onClick={handleFigmaFetch}
                    disabled={isFetchingFigma || !figmaUrl}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 disabled:cursor-not-allowed px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all shadow-lg shadow-indigo-500/20"
                  >
                    {isFetchingFigma ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Fetch"
                    )}
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
            <Zap
              className={`w-12 h-12 ${theme === "dark" ? "text-gray-700" : "text-gray-300"}`}
            />
            <h3
              className={`text-sm font-bold uppercase tracking-widest ${theme === "dark" ? "text-gray-500" : "text-gray-400"}`}
            >
              Live Source
            </h3>
            <p
              className={`text-xs ${theme === "dark" ? "text-gray-600" : "text-gray-400"}`}
            >
              No live source provided by the owner.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center gap-6 p-8">
        <div className="flex flex-col items-center gap-2">
          <Zap
            className={`w-12 h-12 ${theme === "dark" ? "text-gray-700" : "text-gray-300"}`}
          />
          <h3
            className={`text-sm font-bold uppercase tracking-widest ${theme === "dark" ? "text-gray-500" : "text-gray-400"}`}
          >
            Live Source
          </h3>
        </div>

        <div className="flex flex-col gap-4 w-80">
          <div
            className={`flex rounded-xl p-1 ${theme === "dark" ? "bg-[#1e1e1e]" : "bg-gray-100"}`}
          >
            <button
              onClick={() => setLiveSourceType("image")}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                liveSourceType === "image"
                  ? theme === "dark"
                    ? "bg-[#383838] text-white shadow-lg"
                    : "bg-white text-black shadow-md"
                  : theme === "dark"
                    ? "text-gray-500 hover:text-gray-300"
                    : "text-gray-400 hover:text-gray-600"
              }`}
            >
              Image
            </button>
            <button
              onClick={() => setLiveSourceType("url")}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                liveSourceType === "url"
                  ? theme === "dark"
                    ? "bg-[#383838] text-white shadow-lg"
                    : "bg-white text-black shadow-md"
                  : theme === "dark"
                    ? "text-gray-500 hover:text-gray-300"
                    : "text-gray-400 hover:text-gray-600"
              }`}
            >
              URL
            </button>
            <button
              onClick={() => setLiveSourceType("sim")}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                liveSourceType === "sim"
                  ? theme === "dark"
                    ? "bg-[#383838] text-white shadow-lg"
                    : "bg-white text-black shadow-md"
                  : theme === "dark"
                    ? "text-gray-500 hover:text-gray-300"
                    : "text-gray-400 hover:text-gray-600"
              }`}
            >
              SIM
            </button>
          </div>

          <div className="h-32 flex flex-col justify-center">
            {liveSourceType === "image" ? (
              <label
                className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl h-full cursor-pointer transition-all group ${
                  theme === "dark"
                    ? "bg-[#1e1e1e] hover:bg-[#252525] border-[#383838] hover:border-indigo-500/50"
                    : "bg-white hover:bg-gray-50 border-gray-200 hover:border-indigo-500/50"
                }`}
              >
                <Upload
                  className={`w-6 h-6 group-hover:text-indigo-500 transition-colors ${theme === "dark" ? "text-gray-600" : "text-gray-400"}`}
                />
                <span
                  className={`text-[11px] font-bold uppercase tracking-tight ${theme === "dark" ? "text-gray-500" : "text-gray-400"}`}
                >
                  Upload Build
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLiveImageUpload}
                />
              </label>
            ) : liveSourceType === "url" ? (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && setUrl(inputUrl)}
                    className={`flex-1 border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all ${
                      theme === "dark"
                        ? "bg-[#1e1e1e] border-[#383838] text-white placeholder-gray-600"
                        : "bg-white border-gray-200 text-black placeholder-gray-400"
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
                    ? "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-500/20"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/20"
                }`}
              >
                <Eye className="w-5 h-5" />
                {liveStream ? "Stop Capture" : "Start Capture"}
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
          <p className="text-sm font-medium text-gray-500 animate-pulse">
            Loading project data...
          </p>
        </div>
      )}
      <div
        className={`flex flex-col w-screen h-screen overflow-hidden font-sans transition-colors duration-200 ${theme === "dark" ? "bg-[#121212] text-[#e0e0e0]" : "bg-[#fafafa] text-[#1a1a1a]"}`}
      >
        <Header
          theme={theme}
          navigate={(path: string) => navigate(path)}
          projectName={projectName}
          isEditingName={isEditingName}
          setIsEditingName={setIsEditingName}
          tempName={tempName}
          setTempName={setTempName}
          handleNameSave={handleNameSave}
          isOwner={isOwner}
          saveStatus={saveStatus}
          comparisonMode={comparisonMode}
          setComparisonMode={setComparisonMode}
          isSaving={isSaving}
          showRoundsPanel={showRoundsPanel}
          setShowRoundsPanel={setShowRoundsPanel}
          roundsLength={rounds.length}
          createNewRound={createNewRound}
          isCreatingRound={isCreatingRound}
          canSubmitRound={!(!image || !liveImage || differences.length === 0)}
          image={image}
          liveImage={liveImage}
          differencesLength={differences.length}
          user={user}
          forkProject={forkProject}
          setShowAuthModal={setShowAuthModal}
        />

        <div className="flex-1 flex overflow-hidden relative">
          <div className="flex-1 flex flex-col overflow-hidden relative">
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
                    <span className="text-xs font-bold uppercase tracking-widest">
                      Drawing Mode
                    </span>
                    <div className="h-4 w-px bg-white/20" />
                    <span className="text-[10px] opacity-80 font-medium">
                      Click & Drag to mark difference • Press{" "}
                      <kbd className="bg-white/20 px-1 rounded">Esc</kbd> or{" "}
                      <kbd className="bg-white/20 px-1 rounded">R</kbd> to exit
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Rulers */}
              <div
                className={`absolute top-0 left-0 w-full h-5 z-40 border-b transition-colors duration-200 flex items-end overflow-hidden ${theme === "dark" ? "bg-[#1e1e1e] border-[#383838]" : "bg-white border-gray-200"}`}
              >
                <div className="w-5 h-full border-r shrink-0" />
                <div className="flex-1 relative h-full">
                  {Array.from({ length: 50 }).map((_, i) => (
                    <div
                      key={i}
                      className="absolute h-full flex items-end"
                      style={{ left: `${i * 100}px` }}
                    >
                      <div
                        className={`w-px h-full ${theme === "dark" ? "bg-[#383838]" : "bg-gray-200"}`}
                      />
                      <span className="text-[8px] ml-1 mb-0.5 opacity-40 select-none">
                        {i * 100}
                      </span>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <div
                          key={j}
                          className={`absolute bottom-0 w-px ${theme === "dark" ? "bg-[#383838]" : "bg-gray-200"} ${(j + 1) % 5 === 0 ? "h-2" : "h-1"}`}
                          style={{ left: `${(j + 1) * 10}px` }}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              <div
                className={`absolute top-0 left-0 h-full w-5 z-40 border-r transition-colors duration-200 flex flex-col items-end overflow-hidden ${theme === "dark" ? "bg-[#1e1e1e] border-[#383838]" : "bg-white border-gray-200"}`}
              >
                <div className="h-5 w-full border-b shrink-0" />
                <div className="flex-1 relative w-full">
                  {Array.from({ length: 50 }).map((_, i) => (
                    <div
                      key={i}
                      className="absolute w-full flex justify-end"
                      style={{ top: `${i * 100}px` }}
                    >
                      <div
                        className={`h-px w-full ${theme === "dark" ? "bg-[#383838]" : "bg-gray-200"}`}
                      />
                      <span className="text-[8px] mr-0.5 mt-1 opacity-40 select-none [writing-mode:vertical-rl]">
                        {i * 100}
                      </span>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <div
                          key={j}
                          className={`absolute right-0 h-px ${theme === "dark" ? "bg-[#383838]" : "bg-gray-200"} ${(j + 1) % 5 === 0 ? "w-2" : "w-1"}`}
                          style={{ top: `${(j + 1) * 10}px` }}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {comparisonMode === "split" ? (
                <SplitView
                  theme={theme}
                  isOwner={isOwner}
                  image={image}
                  liveImage={liveImage}
                  liveStream={liveStream}
                  liveSourceType={liveSourceType}
                  url={url}
                  scale={scale}
                  showCrosshair={showCrosshair}
                  crosshairPos={crosshairPos}
                  isAddingDiff={isAddingDiff}
                  liveImageSize={liveImageSize}
                  videoRef={videoRef}
                  isAnalyzing={isAnalyzing}
                  setImage={setImage}
                  setUrl={setUrl}
                  setLiveImage={setLiveImage}
                  stopLiveCapture={stopLiveCapture}
                  handleMouseDown={handleMouseDown}
                  handleSplitMouseMove={handleSplitMouseMove}
                  toggleCrosshair={toggleCrosshair}
                  renderDifferenceBoxes={renderDifferenceBoxes}
                  renderDesignSourceSelector={renderDesignSourceSelector}
                  renderLiveSourceSelector={renderLiveSourceSelector}
                />
              ) : comparisonMode === "slider" ? (
                <SliderView
                  theme={theme}
                  isOwner={isOwner}
                  image={image}
                  liveImage={liveImage}
                  liveStream={liveStream}
                  liveSourceType={liveSourceType}
                  url={url}
                  scale={scale}
                  sliderPosition={sliderPosition}
                  opacity={opacity}
                  position={position}
                  videoRef={videoRef}
                  isAnalyzing={isAnalyzing}
                  setImage={setImage}
                  setUrl={setUrl}
                  setLiveImage={setLiveImage}
                  stopLiveCapture={stopLiveCapture}
                  setIsResizingSlider={setIsResizingSlider}
                  renderDifferenceBoxes={renderDifferenceBoxes}
                  renderDesignSourceSelector={renderDesignSourceSelector}
                  renderLiveSourceSelector={renderLiveSourceSelector}
                />
              ) : (
                <OverlayDiffView
                  theme={theme}
                  isOwner={isOwner}
                  image={image}
                  liveImage={liveImage}
                  liveStream={liveStream}
                  liveSourceType={liveSourceType}
                  url={url}
                  scale={scale}
                  opacity={opacity}
                  position={position}
                  isVisible={isVisible}
                  comparisonMode={comparisonMode}
                  isAddingDiff={isAddingDiff}
                  videoRef={videoRef}
                  isAnalyzing={isAnalyzing}
                  setImage={setImage}
                  setUrl={setUrl}
                  setLiveImage={setLiveImage}
                  stopLiveCapture={stopLiveCapture}
                  handleMouseDown={handleMouseDown}
                  renderDifferenceBoxes={renderDifferenceBoxes}
                  renderDesignSourceSelector={renderDesignSourceSelector}
                  renderLiveSourceSelector={renderLiveSourceSelector}
                />
              )}

              {/* Dragging Overlay to prevent iframe from stealing mouse events */}
              {(isDragging || isResizingSlider) && (
                <div className="fixed inset-0 z-40 cursor-move" />
              )}
            </div>
          </div>
          <DifferencesPanel
            theme={theme}
            differences={differences}
            setDifferences={setDifferences}
            selectedDiffId={selectedDiffId}
            setSelectedDiffId={setSelectedDiffId}
            severityFilter={severityFilter}
            setSeverityFilter={setSeverityFilter}
            isAnalyzing={isAnalyzing}
            isOwner={isOwner}
            inlineEdit={inlineEdit}
            setInlineEdit={setInlineEdit}
            updateDiffStatus={updateDiffStatus}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            analyzeFidelity={analyzeFidelity}
            cancelAnalysis={cancelAnalysis}
            image={image}
            liveImage={liveImage}
          />
        </div>

        {/* Rounds History Panel */}
        <AnimatePresence>
          {showRoundsPanel && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 150, opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className={`relative w-full z-[160] shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.1)] flex flex-col overflow-hidden shrink-0 scrollbar-hide ${
                theme === "dark" ? "bg-[#1e1e1e]" : "bg-white"
              }`}
            >
              <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 flex gap-4 items-center scrollbar-hide">
                {rounds.length === 0 ? (
                  <div className="flex items-center justify-center w-full text-center gap-4">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${theme === "dark" ? "bg-[#2c2c2c]" : "bg-gray-50"}`}
                    >
                      <History className="w-5 h-5 text-gray-400" />
                    </div>
                    <div className="text-left">
                      <p
                        className={`text-sm font-medium ${theme === "dark" ? "text-gray-500" : "text-gray-400"}`}
                      >
                        No verification rounds yet.
                      </p>
                      <p className="text-xs text-gray-500">
                        Submit your first round to start tracking progress.
                      </p>
                    </div>
                  </div>
                ) : (
                  rounds.map((round) => {
                    const cardWidth = 240;

                    return (
                      <div
                        key={round.id}
                        onClick={() => loadRound(round)}
                        style={{ width: cardWidth }}
                        className={`shrink-0 cursor-pointer text-left p-2 rounded-xl border transition-all group overflow-hidden ${
                          currentRoundId === round.id
                            ? "border-indigo-500 bg-indigo-500/5 ring-1 ring-indigo-500"
                            : theme === "dark"
                              ? "border-[#383838] bg-[#252525] hover:border-gray-600"
                              : "border-gray-100 bg-gray-50 hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className={`text-[9px] font-bold uppercase tracking-tighter whitespace-nowrap px-1.5 py-0.5 rounded-full shrink-0 ${
                                currentRoundId === round.id
                                  ? "bg-indigo-500 text-white"
                                  : theme === "dark"
                                    ? "bg-[#383838] text-gray-400"
                                    : "bg-white text-gray-500 border border-gray-200"
                              }`}
                            >
                              Round {round.roundNumber}
                            </span>
                            <span className="text-[8px] text-gray-500 truncate hidden sm:inline">
                              {new Date(round.timestamp).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            {isOwner &&
                              (confirmingDeleteRoundId === round.id ? (
                                <div className="flex items-center gap-0.5 shrink-0 opacity-100 transition-all mr-0.5">
                                  <button
                                    onClick={(e) =>
                                      executeDeleteRound(round.id, e)
                                    }
                                    className="px-1.5 py-0.5 bg-rose-500 hover:bg-rose-600 text-white rounded text-[9px] font-bold uppercase transition-colors"
                                  >
                                    确认
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmingDeleteRoundId(null);
                                    }}
                                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded flex items-center justify-center shrink-0"
                                  >
                                    <svg
                                      className="w-3 h-3"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M6 18L18 6M6 6l12 12"
                                      />
                                    </svg>
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={(e) =>
                                    initiateDeleteRound(round.id, e)
                                  }
                                  className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-rose-500 hover:bg-rose-500/10 rounded transition-all flex items-center justify-center h-5 w-5 mr-0.5"
                                  title="Delete Round"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              ))}
                            {["Pending", "Verified", "Rejected"].map(
                              (status) => (
                                <button
                                  key={status}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateRoundStatus(round.id, status);
                                  }}
                                  className={`px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase transition-all ${
                                    round.status === status
                                      ? status === "Verified"
                                        ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                                        : status === "Rejected"
                                          ? "bg-rose-500 text-white shadow-lg shadow-rose-500/20"
                                          : "bg-amber-500 text-white shadow-lg shadow-amber-500/20"
                                      : theme === "dark"
                                        ? "bg-[#383838] text-gray-500 hover:text-gray-300"
                                        : "bg-white text-gray-400 border border-gray-200 hover:border-gray-300"
                                  }`}
                                >
                                  {status.charAt(0)}
                                </button>
                              ),
                            )}
                          </div>
                        </div>

                        <div className="flex gap-2 mb-2">
                          <div className="flex-1 aspect-video rounded-lg bg-black/5 overflow-hidden border border-black/5">
                            <img
                              src={round.designImage}
                              alt="Design"
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                          <div className="flex-1 aspect-video rounded-lg bg-black/5 overflow-hidden border border-black/5">
                            <img
                              src={round.buildImage}
                              alt="Build"
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <MessageSquare className="w-3 h-3 text-gray-400" />
                              <span className="text-[10px] text-gray-500 truncate">
                                {round.differences?.length || 0} Issues
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                round.status === "Verified"
                                  ? "text-emerald-500"
                                  : round.status === "Rejected"
                                    ? "text-rose-500"
                                    : "text-amber-500"
                              }`}
                            >
                              {round.status}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Auth Modal */}
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
        />

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
                    <h2 className="text-xl font-bold dark:text-white">
                      Save Analysis
                    </h2>
                    <button
                      onClick={() => setShowSaveModal(false)}
                      className="p-1 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full dark:text-gray-400"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">
                        Analysis Name
                      </label>
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
                    {isSaving ? "Saving..." : "Save Analysis"}
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
                  <h2 className="text-xl font-bold mb-2 dark:text-white">
                    Delete Analysis?
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    This action cannot be undone. This saved analysis will be
                    permanently removed.
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
                toast.type === "success"
                  ? "bg-emerald-500 text-white border-emerald-400"
                  : "bg-rose-500 text-white border-rose-400"
              }`}
            >
              {toast.type === "success" ? (
                <Zap className="w-5 h-5" />
              ) : (
                <X className="w-5 h-5" />
              )}
              <span className="text-sm font-medium">{toast.message}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

export default function App() {
  const [theme, setTheme] = useState<"light" | "dark" | "system">(() => {
    return (
      (localStorage.getItem("theme") as "light" | "dark" | "system") || "system"
    );
  });

  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() => {
    if (theme === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    return theme as "light" | "dark";
  });

  useEffect(() => {
    localStorage.setItem("theme", theme);
    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = (e: MediaQueryListEvent) =>
        setResolvedTheme(e.matches ? "dark" : "light");
      setResolvedTheme(mediaQuery.matches ? "dark" : "light");
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    } else {
      setResolvedTheme(theme as "light" | "dark");
    }
  }, [theme]);

  useEffect(() => {
    if (resolvedTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [resolvedTheme]);

  return (
    <>
      <Routes>
        <Route
          path="/"
          element={
            <ProjectManagement
              theme={theme}
              setTheme={setTheme}
              resolvedTheme={resolvedTheme}
            />
          }
        />
        <Route
          path="/checker"
          element={<DesignChecker resolvedTheme={resolvedTheme} />}
        />
        <Route
          path="/checker/:projectId"
          element={<DesignChecker resolvedTheme={resolvedTheme} />}
        />
      </Routes>
    </>
  );
}
