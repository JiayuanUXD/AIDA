import React, { useState, useEffect } from 'react';
import { 
  Upload, Eye, Layers, RotateCcw,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical, Link as LinkIcon, Loader2, Focus,
  Split, Zap, X, MessageSquare, Trash2, History, Check, ChevronLeft, Sparkles,
  Type as TypeIcon, LayoutTemplate, Palette, Settings
} from 'lucide-react';

import { Routes, Route, useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import ProjectManagement from './pages/ProjectManagement';
import ModelSettings from './pages/ModelSettings';
import AnalyzeActionBar, { type AiModelOption } from './components/AnalyzeActionBar';
import DifferenceListItemV2 from './components/DifferenceListItemV2';
import { 
  collection, 
  addDoc, 
  query, 
  onSnapshot, 
  orderBy, 
  deleteDoc, 
  doc,
  getDoc,
  updateDoc,
  setDoc
} from './lib/localStorageService';
import { 
  ref, 
  uploadString, 
  getDownloadURL 
} from './lib/localStorageStorage';
import { compressImage } from './lib/image';
import { usePreferences, useStableTranslator } from './lib/preferences';
import { UNTITLED_PROJECT_NAME, errorText, localizeProjectName } from './lib/i18n';
import {
  dedupeAndMergeSliceDiffs,
  prepareComparisonSlices,
  type RawAnalysisDiff,
} from './lib/analysisSlices';
import type { Difference, DifferenceSeverity, DifferenceType } from './types/analysis';

const inferSeverityByType = (type: DifferenceType): DifferenceSeverity => {
  if (type === 'CONTENT') return 'high';
  if (type === 'LAYOUT') return 'medium';
  return 'low';
};

const normalizeSeverity = (severity: unknown, type: DifferenceType): DifferenceSeverity => {
  if (severity === 'high' || severity === 'medium' || severity === 'low') {
    return severity;
  }
  return inferSeverityByType(type);
};

const nextSeverity = (severity: DifferenceSeverity): DifferenceSeverity => {
  if (severity === 'high') return 'medium';
  if (severity === 'medium') return 'low';
  return 'high';
};

const getSeverityColor = (severity: DifferenceSeverity): { hex: string; rgb: string } => {
  if (severity === 'high') return { hex: '#f43f5e', rgb: '244, 63, 94' };
  if (severity === 'medium') return { hex: '#f59e0b', rgb: '245, 158, 11' };
  return { hex: '#34d399', rgb: '52, 211, 153' };
};

const getDifferenceTypeIcon = (type: DifferenceType) => {
  if (type === 'CONTENT') return TypeIcon;
  if (type === 'LAYOUT') return LayoutTemplate;
  return Palette;
};

type PaneType = 'design' | 'build';
type RectBox = { x: number; y: number; width: number; height: number };

function DesignChecker() {
  const { resolvedTheme, t, locale } = usePreferences();
  const stableT = useStableTranslator();
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const useNewDiffListUI =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('newDiffUI') === '1';


  const [savedResults, setSavedResults] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [, setSaveStatusTick] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [aiModels, setAiModels] = useState<AiModelOption[]>([]);
  const [aiModelId, setAiModelId] = useState('');

  const theme = resolvedTheme;

  useEffect(() => {
    document.title = t('AIDA · 设计走查 Checker');
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const models: AiModelOption[] = Array.isArray(data?.models)
          ? data.models.filter(
              (model: any) =>
                typeof model?.id === 'string' &&
                typeof model?.label === 'string' &&
                typeof model?.configured === 'boolean'
            )
          : [];
        setAiModels(models);
        const stored = window.localStorage.getItem('aida:ai-model');
        const preferred =
          models.find((model: AiModelOption) => model.id === stored && model.configured) ||
          models.find((model: AiModelOption) => model.id === data?.defaultModelId) ||
          models.find((model: AiModelOption) => model.configured) ||
          models[0];
        setAiModelId(preferred?.id || '');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectAiModel = (id: string) => {
    setAiModelId(id);
    try {
      window.localStorage.setItem('aida:ai-model', id);
    } catch {
      // localStorage can be unavailable in private mode; selection still works for this session.
    }
  };

  const aiModelLabel = aiModels.find((model) => model.id === aiModelId)?.label || '';

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
  const [isVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [designSourceType, setDesignSourceType] = useState<'upload' | 'figma'>('upload');
  const [figmaUrl, setFigmaUrl] = useState('');
  const [isFetchingFigma, setIsFetchingFigma] = useState(false);
  const [showCrosshair, setShowCrosshair] = useState(false);
  const [crosshairPos, setCrosshairPos] = useState({ x: 0, y: 0 });
  const [differences, setDifferences] = useState<Difference[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedDiffId, setSelectedDiffId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<'all' | DifferenceSeverity>('all');
  const [editingDiffId, setEditingDiffId] = useState<string | null>(null);
  const [editingPaneType, setEditingPaneType] = useState<PaneType | null>(null);
  const [editType, setEditType] = useState<'move' | 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se' | 'resize-n' | 'resize-s' | 'resize-e' | 'resize-w' | null>(null);
  const [editStartPos, setEditStartPos] = useState({ x: 0, y: 0 });
  const [editStartRect, setEditStartRect] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [isAddingDiff, setIsAddingDiff] = useState(false);
  const [newDiffPaneType, setNewDiffPaneType] = useState<PaneType | null>(null);
  const [newDiffStart, setNewDiffStart] = useState<{ x: number, y: number } | null>(null);
  const [inlineEdit, setInlineEdit] = useState<{ id: string, field: 'title' | 'description' | 'type' } | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);

  const [saveName, setSaveName] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [roundDeleteConfirmId, setRoundDeleteConfirmId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [projectName, setProjectName] = useState(UNTITLED_PROJECT_NAME);
  const isOwner = true;
  const [isEditingName, setIsEditingName] = useState(false);
  const [rounds, setRounds] = useState<any[]>([]);
  const [currentRoundId, setCurrentRoundId] = useState<string | null>(null);
  const [isCreatingRound, setIsCreatingRound] = useState(false);
  const [showRoundsPanel, setShowRoundsPanel] = useState(false);
  const [roundsPanelHeight, setRoundsPanelHeight] = useState(150);
  const [isResizingRoundsPanel, setIsResizingRoundsPanel] = useState(false);
  const [activePanel, setActivePanel] = useState<'controls' | 'differences'>('controls');
  const [tempName, setTempName] = useState('');
  const skipNextAutoSave = React.useRef(false);
  const skipNextRoundAutoSave = React.useRef(false);
  const lastSavedDataRef = React.useRef<string>('');
  const lastSavedRoundDataRef = React.useRef<string>('');
  const isSavingRef = React.useRef(false);
  const isSavingRoundRef = React.useRef(false);
  const currentImageRef = React.useRef<string | null>(null);
  const currentLiveImageRef = React.useRef<string | null>(null);

  // Auto-switch to controls panel when there are no differences
  useEffect(() => {
    if (differences.length === 0 && activePanel === 'differences') {
      setActivePanel('controls');
    }
  }, [differences.length, activePanel]);

  const buildSaveFingerprint = () => JSON.stringify({
    image,
    liveImage,
    differences,
    url,
    figmaUrl,
    opacity,
    scale,
    position,
    projectName
  });

  const buildRoundPayload = () => ({
    designImage: image,
    buildImage: liveImage,
    differences,
    updatedAt: Date.now()
  });

  const buildRoundFingerprintFromValues = (
    designImageValue: string | null,
    buildImageValue: string | null,
    differencesValue: Difference[]
  ) => {
    const normalizedDifferences = normalizeDifferenceRects(differencesValue || []);
    return JSON.stringify({
      designImage: designImageValue ?? null,
      buildImage: buildImageValue ?? null,
      differences: normalizedDifferences
    });
  };

  const buildRoundFingerprint = () => buildRoundFingerprintFromValues(image, liveImage, differences);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const hasPendingChanges = saveStatus === 'saving' || saveStatus === 'unsaved';

  const getLeaveWarningMessage = () => {
    if (saveStatus === 'saving') {
      return t('项目仍在保存中，确定要离开吗？');
    }

    if (saveStatus === 'unsaved') {
      return t('项目有未保存的修改，确定要离开吗？');
    }

    return '';
  };

  useEffect(() => {
    if (!hasPendingChanges) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasPendingChanges]);

  const handleBackToProjects = () => {
    if (hasPendingChanges && !window.confirm(getLeaveWarningMessage())) {
      return;
    }

    navigate('/');
  };

  const formatSaveTime = (timestamp: number | null) => {
    if (!timestamp) return t('尚未保存');

    const diffMs = Date.now() - timestamp;
    const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));

    if (diffSeconds < 5) return t('刚刚保存');
    if (diffSeconds < 60) return t('已保存 {n} 秒前', { n: diffSeconds });

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return t('已保存 {n} 分钟前', { n: diffMinutes });

    return t('已保存 {time}', {
      time: new Date(timestamp).toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      })
    });
  };

  // Use refs for values that change frequently to optimize event listeners
  const positionRef = React.useRef(position);
  const scaleRef = React.useRef(scale);
  const isDraggingRef = React.useRef(isDragging);
  const dragStartRef = React.useRef(dragStart);
  const comparisonModeRef = React.useRef(comparisonMode);
  const editTypeRef = React.useRef(editType);
  const editingPaneTypeRef = React.useRef(editingPaneType);
  const editStartPosRef = React.useRef(editStartPos);
  const editStartRectRef = React.useRef(editStartRect);
  const editingDiffIdRef = React.useRef(editingDiffId);
  const isAddingDiffRef = React.useRef(isAddingDiff);
  const drawingRectRef = React.useRef<DOMRect | null>(null);
  const newDiffPaneTypeRef = React.useRef(newDiffPaneType);
  const newDiffStartRef = React.useRef(newDiffStart);
  const imageSizeRef = React.useRef(imageSize);
  const liveImageSizeRef = React.useRef(liveImageSize);

  useEffect(() => { positionRef.current = position; }, [position]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { isDraggingRef.current = isDragging; }, [isDragging]);
  useEffect(() => { dragStartRef.current = dragStart; }, [dragStart]);
  useEffect(() => { comparisonModeRef.current = comparisonMode; }, [comparisonMode]);
  useEffect(() => { editTypeRef.current = editType; }, [editType]);
  useEffect(() => { editingPaneTypeRef.current = editingPaneType; }, [editingPaneType]);
  useEffect(() => { editStartPosRef.current = editStartPos; }, [editStartPos]);
  useEffect(() => { editStartRectRef.current = editStartRect; }, [editStartRect]);
  useEffect(() => { editingDiffIdRef.current = editingDiffId; }, [editingDiffId]);
  useEffect(() => { isAddingDiffRef.current = isAddingDiff; }, [isAddingDiff]);
  useEffect(() => { newDiffPaneTypeRef.current = newDiffPaneType; }, [newDiffPaneType]);
  useEffect(() => { newDiffStartRef.current = newDiffStart; }, [newDiffStart]);
  useEffect(() => { imageSizeRef.current = imageSize; }, [imageSize]);
  useEffect(() => { liveImageSizeRef.current = liveImageSize; }, [liveImageSize]);
  useEffect(() => { currentImageRef.current = image; }, [image]);
  useEffect(() => { currentLiveImageRef.current = liveImage; }, [liveImage]);

  const getPaneSize = (pane: PaneType) => {
    const size = pane === 'design' ? imageSizeRef.current : liveImageSizeRef.current;
    return {
      width: size.width || 390,
      height: size.height || 844,
    };
  };

  const mapRectBetweenPanes = (rect: RectBox, fromPane: PaneType, toPane: PaneType): RectBox => {
    const from = getPaneSize(fromPane);
    const to = getPaneSize(toPane);
    const sx = to.width / (from.width || 1);
    const sy = to.height / (from.height || 1);
    return {
      x: Math.round(rect.x * sx),
      y: Math.round(rect.y * sy),
      width: Math.max(1, Math.round(rect.width * sx)),
      height: Math.max(1, Math.round(rect.height * sy)),
    };
  };

  const getRectForPane = (diff: Difference, pane: PaneType): RectBox => {
    if (pane === 'design') {
      return (diff.rectDesign || diff.rect || mapRectBetweenPanes(diff.rectBuild || diff.rect, 'build', 'design'));
    }
    return (diff.rectBuild || mapRectBetweenPanes(diff.rectDesign || diff.rect, 'design', 'build'));
  };

  const normalizeDifferenceRects = (items: Difference[]): Difference[] => {
    return items.map((d) => {
      const rectDesign = d.rectDesign || d.rect || mapRectBetweenPanes(d.rectBuild || { x: 0, y: 0, width: 1, height: 1 }, 'build', 'design');
      const rectBuild = d.rectBuild || mapRectBetweenPanes(rectDesign, 'design', 'build');
      return {
        ...d,
        rect: rectDesign,
        rectDesign,
        rectBuild,
        severity: normalizeSeverity(d.severity, d.type),
      };
    });
  };
  useEffect(() => {
    if (!lastSavedAt || saveStatus !== 'saved') return;

    const interval = window.setInterval(() => {
      setSaveStatusTick((prev) => prev + 1);
    }, 15000);

    return () => window.clearInterval(interval);
  }, [lastSavedAt, saveStatus]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRoundsPanel) return;
      const newHeight = window.innerHeight - e.clientY;
      if (newHeight >= 60 && newHeight <= 800) {
        setRoundsPanelHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      setIsResizingRoundsPanel(false);
      document.body.style.cursor = 'default';
    };

    if (isResizingRoundsPanel) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'row-resize';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingRoundsPanel]);

  useEffect(() => {
    const q = query(
      collection('analysisResults'),
      orderBy('timestamp', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const results = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSavedResults(results);
    }, (err) => {
      setError(stableT('加载分析历史失败: {error}', { error: errorText(err, stableT) }));
    });

    return () => unsubscribe();
  }, [stableT]);

  useEffect(() => {
    if (projectId) {
      const loadProject = async () => {
        setIsLoading(true);
        try {
          const docSnap = await getDoc(doc('projects', projectId));
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.name) {
              setProjectName(data.name);
              setTempName(data.name);
            }
            if (data.analysisData) {
              const ad = data.analysisData;
              if (ad.image) setImage(ad.image);
              if (ad.liveImage) setLiveImage(ad.liveImage);
              if (ad.differences) {
                setDifferences(normalizeDifferenceRects(ad.differences));
                skipNextAutoSave.current = true;
              }
              if (ad.url) setUrl(ad.url);
              if (ad.figmaUrl) setFigmaUrl(ad.figmaUrl);
              if (typeof ad.opacity === 'number') setOpacity(ad.opacity);
              if (ad.scale) setScale(ad.scale);
              if (ad.position) setPosition(ad.position);
            }
            const loadedFingerprint = JSON.stringify({
              image: data.analysisData?.image ?? null,
              liveImage: data.analysisData?.liveImage ?? null,
              differences: data.analysisData?.differences ?? [],
              url: data.analysisData?.url ?? '',
              figmaUrl: data.analysisData?.figmaUrl ?? '',
              opacity: data.analysisData?.opacity ?? 0.5,
              scale: data.analysisData?.scale ?? 1,
              position: data.analysisData?.position ?? { x: 0, y: 0 },
              projectName: data.name ?? UNTITLED_PROJECT_NAME
            });
            lastSavedDataRef.current = loadedFingerprint;
            setLastSavedAt(data.updatedAt ?? data.analysisData?.timestamp ?? null);
            setSaveStatus('saved');
          } else {
            setSaveStatus('unsaved');
          }
        } catch (error) {
          console.error("Error loading project:", error);
        } finally {
          setIsLoading(false);
        }
      };
      loadProject();
    } else {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the route's project changes; helpers are recreated each render
  }, [projectId]);

  useEffect(() => {
    if (projectId) {
      const q = query(
        collection(`projects_${projectId}_rounds`),
        orderBy('timestamp', 'desc')
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedRounds = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        const normalizedRounds = normalizeRoundNumbers(fetchedRounds);
        setRounds(sortRoundsForDisplay(normalizedRounds));
      }, (err) => {
        setError(stableT('加载轮次数据失败: {error}', { error: errorText(err, stableT) }));
      });
      return () => unsubscribe();
    } else {
      setRounds([]);
    }
  }, [projectId, stableT]);

  const createNewRound = async (notes: string = '') => {
    if (!projectId || !isOwner) return;
    setIsCreatingRound(true);
    try {
      const roundNumber = rounds.length + 1;
      const timestamp = Date.now();
      const roundData = {
        projectId,
        roundNumber,
        status: 'Pending',
        designImage: image,
        buildImage: liveImage,
        differences,
        notes,
        timestamp
      };
      const docRef = await addDoc(collection(`projects_${projectId}_rounds`), roundData);
      const newRound = {
        id: docRef.id,
        ...roundData
      };

      setRounds((prev) => [newRound, ...prev.filter((round) => round.id !== newRound.id)]);
      setShowRoundsPanel(true);
      setToast({ message: t('已创建轮次 {n}', { n: roundNumber }), type: 'success' });
      lastSavedRoundDataRef.current = buildRoundFingerprintFromValues(
        roundData.designImage ?? null,
        roundData.buildImage ?? null,
        roundData.differences ?? []
      );
      setCurrentRoundId(docRef.id);
    } catch (error) {
      console.error("Error creating round:", error);
      setToast({ message: t('创建轮次失败'), type: 'error' });
    } finally {
      setIsCreatingRound(false);
    }
  };

  const saveCurrentRoundData = async (roundId: string) => {
    if (!projectId || !isOwner || !roundId || isSavingRoundRef.current) return;

    const currentState = buildRoundFingerprint();
    if (currentState === lastSavedRoundDataRef.current) {
      return;
    }

    isSavingRoundRef.current = true;
    const payload = buildRoundPayload();

    setRounds((prev) =>
      prev.map((round) =>
        round.id === roundId
          ? { ...round, ...payload }
          : round
      )
    );

    try {
      await updateDoc(doc(`projects_${projectId}_rounds`, roundId), payload);
      lastSavedRoundDataRef.current = currentState;
    } catch (error) {
      console.error("Error saving round data:", error);
      setToast({ message: t('保存轮次失败'), type: 'error' });
    } finally {
      isSavingRoundRef.current = false;
    }
  };

  const loadRound = async (round: any) => {
    if (currentRoundId && currentRoundId !== round.id) {
      await saveCurrentRoundData(currentRoundId);
    }

    const normalizedDifferences = normalizeDifferenceRects(round.differences || []);
    skipNextRoundAutoSave.current = true;
    setImage(round.designImage ?? null);
    setLiveImage(round.buildImage ?? null);
    setDifferences(normalizedDifferences);
    lastSavedRoundDataRef.current = buildRoundFingerprintFromValues(
      round.designImage ?? null,
      round.buildImage ?? null,
      normalizedDifferences
    );
    setCurrentRoundId(round.id);
  };

  const updateRoundStatus = async (roundId: string, newStatus: string) => {
    if (!projectId || !isOwner) return;
    setRounds((prev) =>
      prev.map((round) =>
        round.id === roundId
          ? { ...round, status: newStatus, updatedAt: Date.now() }
          : round
      )
    );

    try {
      await updateDoc(doc(`projects_${projectId}_rounds`, roundId), {
        status: newStatus,
        updatedAt: Date.now()
      });
      const statusLabel = newStatus === 'Verified' ? t('已通过') : newStatus === 'Rejected' ? t('已驳回') : t('待验收');
      setToast({ message: t('轮次状态已更新：{status}', { status: statusLabel }), type: 'success' });
    } catch (error) {
      console.error("Error updating round status:", error);
      setToast({ message: t('更新状态失败'), type: 'error' });
    }
  };

  const normalizeRoundNumbers = (items: any[]) => {
    const getRoundTime = (round: any) => {
      const candidates = [round?.timestamp, round?.createdAt, round?.updatedAt];
      for (const value of candidates) {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string') {
          const parsed = Date.parse(value);
          if (!Number.isNaN(parsed)) return parsed;
        }
      }
      return 0;
    };

    const sortedByTime = [...items].sort((a, b) => getRoundTime(a) - getRoundTime(b));
    const roundNumberMap = new Map<string, number>();

    sortedByTime.forEach((round, index) => {
      roundNumberMap.set(round.id, index + 1);
    });

    return items.map((round) => ({
      ...round,
      timestamp: getRoundTime(round),
      roundNumber: roundNumberMap.get(round.id) ?? round.roundNumber
    }));
  };

  const sortRoundsForDisplay = (items: any[]) => {
    return [...items].sort((a, b) => {
      const aRound = typeof a.roundNumber === 'number' ? a.roundNumber : 0;
      const bRound = typeof b.roundNumber === 'number' ? b.roundNumber : 0;
      if (aRound !== bRound) return bRound - aRound;
      return (b.timestamp ?? 0) - (a.timestamp ?? 0);
    });
  };

  const formatRoundDate = (round: any) => {
    const time = round?.timestamp;
    if (!time || !Number.isFinite(time)) return '--';
    return new Date(time).toLocaleDateString(locale);
  };

  const normalizeDifferenceIds = (items: Difference[]) => {
    return items.map((diff, index) => ({
      ...diff,
      id: String(index + 1)
    }));
  };

  const requestDeleteRound = (roundId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRoundDeleteConfirmId(roundId);
  };

  const confirmDeleteRound = async () => {
    if (!projectId || !isOwner || !roundDeleteConfirmId) return;

    const roundIdToDelete = roundDeleteConfirmId;
    const previousRounds = rounds;
    const remainingRounds = normalizeRoundNumbers(
      rounds.filter((round) => round.id !== roundIdToDelete)
    );

    setRoundDeleteConfirmId(null);
    setRounds(sortRoundsForDisplay(remainingRounds));
    if (currentRoundId === roundIdToDelete) {
      setCurrentRoundId(null);
    }

    try {
      await deleteDoc(doc(`projects_${projectId}_rounds`, roundIdToDelete));
      await Promise.all(
        remainingRounds.map((round) =>
          updateDoc(doc(`projects_${projectId}_rounds`, round.id), {
            roundNumber: round.roundNumber
          })
        )
      );
      setToast({ message: t('轮次已删除'), type: 'success' });
    } catch (error) {
      console.error("Error deleting round:", error);
      setRounds(previousRounds);
      setToast({ message: t('删除轮次失败'), type: 'error' });
    }
  };

  const deleteDifference = (differenceId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!isOwner) return;
    const nextDifferences = normalizeDifferenceIds(
      differences.filter((diff) => diff.id !== differenceId)
    );

    setDifferences(nextDifferences);
    if (selectedDiffId === differenceId) {
      setSelectedDiffId(null);
    }
    if (inlineEdit?.id === differenceId) {
      setInlineEdit(null);
    }
    setToast({ message: t('差异项已删除'), type: 'success' });
  };

  const handleNameSave = () => {
    if (!tempName.trim()) return;
    setProjectName(tempName.trim());
    setIsEditingName(false);
  };

  const saveProjectData = async () => {
    if (!projectId || !isOwner || isSavingRef.current) return;
    
    // Create a fingerprint of current state to avoid redundant saves
    const currentState = buildSaveFingerprint();
    
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

      // Upload to storage if it's a base64 string (stable filename, overwritten on change)
      if (image && image.startsWith('data:image')) {
          const imageRef = ref(null, `projects/${projectId}/design.jpg`);
          await uploadString(imageRef, image, 'data_url');
          finalImageUrl = await getDownloadURL(imageRef);
        }

        if (liveImage && liveImage.startsWith('data:image')) {
          const liveImageRef = ref(null, `projects/${projectId}/build.jpg`);
          await uploadString(liveImageRef, liveImage, 'data_url');
          finalLiveImageUrl = await getDownloadURL(liveImageRef);
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

      await setDoc(doc('projects', projectId), {
        name: projectName,
        analysisData,
        updatedAt: Date.now(),
        thumbnail: thumbnail || ''
      }, { merge: true });
      
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
      setLastSavedAt(Date.now());
      setSaveStatus('saved');
    } catch (error: any) {
      console.error("Error saving project data:", error);
      setSaveStatus('error');
      let msg = t('保存项目数据失败。');
      if (error.message?.includes("exceeds the maximum allowed size")) {
        msg = t('项目数据超出服务端大小限制，请压缩图片后重试。');
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
    const currentState = buildSaveFingerprint();
    if (currentState === lastSavedDataRef.current) return;

    setSaveStatus('unsaved');

    const timer = setTimeout(() => {
      saveProjectData();
    }, 2000); // Save after 2 seconds of inactivity

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fingerprint inputs only; adding save helpers would restart the debounce every render
  }, [figmaUrl, image, isAnalyzing, isLoading, isOwner, isSaving, liveImage, differences, opacity, position, projectName, scale, url]);

  useEffect(() => {
    if (isLoading || !projectId || !isOwner || !currentRoundId) return;

    if (skipNextRoundAutoSave.current) {
      skipNextRoundAutoSave.current = false;
      return;
    }

    if (isSavingRoundRef.current) return;

    const currentState = buildRoundFingerprint();
    if (currentState === lastSavedRoundDataRef.current) return;

    const timer = setTimeout(() => {
      saveCurrentRoundData(currentRoundId);
    }, 800);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fingerprint inputs only; adding save helpers would restart the debounce every render
  }, [currentRoundId, differences, image, isLoading, isOwner, liveImage, projectId]);



  // Sync liveStream to video element whenever it changes or video element mounts
  useEffect(() => {
    if (liveStream && videoRef.current) {
      videoRef.current.srcObject = liveStream;
    }
  }, [liveStream]);

  useEffect(() => {
    if (!image) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const originalWidth = img.naturalWidth || 390;
      const originalHeight = img.naturalHeight || 844;
      const targetWidth = 390;
      const targetHeight = (originalHeight / originalWidth) * targetWidth;
      setImageSize({ width: targetWidth, height: targetHeight });
    };
    img.src = image;
  }, [image]);

  useEffect(() => {
    if (!liveImage) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const originalWidth = img.naturalWidth || 390;
      const originalHeight = img.naturalHeight || 844;
      const targetWidth = 390;
      const targetHeight = (originalHeight / originalWidth) * targetWidth;
      setLiveImageSize({ width: targetWidth, height: targetHeight });
    };
    img.src = liveImage;
  }, [liveImage]);

  const analyzeFidelity = async () => {
    if (!image || !liveImage || !isOwner) return;
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
        
        const isLocalApi = url.startsWith('/api/');
        try {
          const fetchUrl = isLocalApi ? url : `/api/proxy-image?url=${encodeURIComponent(url)}`;
          console.log(`Fetching image ${isLocalApi ? 'directly' : 'via proxy'}: ${fetchUrl}`);
          const response = await fetch(fetchUrl);
          if (!response.ok) {
            const responseBody = await response.text();
            throw new Error(`Proxy failed (${response.status}): ${responseBody || response.statusText}`);
          }
          const blob = await response.blob();
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = (reader.result as string).split(',')[1];
              resolve({ data: base64, mimeType: blob.type });
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch (e: any) {
          throw new Error(t('通过代理获取图片失败：{error}', { error: e.message }), { cause: e });
        }
      };

      const [designImg, buildImg] = await Promise.all([
        getBase64(image),
        getBase64(liveImage)
      ]);

      const designDataUrl = `data:${designImg.mimeType};base64,${designImg.data}`;
      const buildDataUrl = `data:${buildImg.mimeType};base64,${buildImg.data}`;

      const prepared = await prepareComparisonSlices(designDataUrl, buildDataUrl);

      const postSlice = async (sliceItem: (typeof prepared.slices)[number]): Promise<RawAnalysisDiff[]> => {
        const response = await fetch("/api/analyze/ui", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            prompt: sliceItem.prompt,
            comparisonImage: sliceItem.comparisonImage,
            modelId: aiModelId || undefined,
            temperature: 0.3
          })
        });

        if (!response.ok) {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Analysis failed");
          } else {
            const responseBody = await response.text();
            throw new Error(`Analysis failed (${response.status}): ${responseBody.substring(0, 100)}`);
          }
        }

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          const text = await response.text();
          console.error(`Unexpected response format from backend (${response.status}):`, text.substring(0, 500));
          throw new Error(`Unexpected response format from backend (${response.status}): Expected JSON but received ${contentType || "unknown"}.`);
        }

        const sliceResult = await response.json();
        return Array.isArray(sliceResult) ? sliceResult : [];
      };

      const sliceDiffLists = await Promise.all(prepared.slices.map(postSlice));
      const result = dedupeAndMergeSliceDiffs(
        sliceDiffLists.flat(),
        prepared.designWidth,
        prepared.designHeight,
        15
      );

      const diffsWithIds = result.map((d, index: number) => {
        const type = (d.type || 'STYLE').toUpperCase();
        const validTypes = ['CONTENT', 'LAYOUT', 'STYLE'];
        const normalizedType = (validTypes.includes(type) ? type : 'STYLE') as DifferenceType;

        const designW = prepared.designWidth || imageSize.width || 390;
        const designH = prepared.designHeight || designW;
        const appWidth = imageSize.width || 390;
        const appHeight = imageSize.height || (designH * (appWidth / designW));

        const scaleX = appWidth / designW;
        const scaleY = appHeight / designH;

        const rect = {
          x: Math.round(d.rect.x * scaleX),
          y: Math.round(d.rect.y * scaleY),
          width: Math.round(d.rect.width * scaleX),
          height: Math.round(d.rect.height * scaleY)
        };

        return {
          ...d,
          title: typeof d.title === 'string' ? d.title : t('未命名差异'),
          description: typeof d.description === 'string' ? d.description : t('暂无描述'),
          rect,
          rectDesign: rect,
          rectBuild: mapRectBetweenPanes(rect, 'design', 'build'),
          id: (index + 1).toString(),
          type: normalizedType,
          severity: normalizeSeverity(d.severity, normalizedType),
          status: 'pending' as const
        };
      });
      
      setDifferences(diffsWithIds);
    } catch (err: any) {
      console.error("Analysis error:", err);
      setError(t('分析失败：{error}', { error: errorText(err, t, t('未知错误')) }));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const confirmSave = async () => {
    if (!saveName.trim()) return;
    setIsSaving(true);
    try {
      await addDoc(collection('analysisResults'), {
        name: saveName,
        designImage: image,
        buildImage: liveImage,
        differences,
        url,
        figmaUrl,
        opacity,
        scale,
        position,
        timestamp: Date.now()
      });
      setShowSaveModal(false);
      setToast({ message: t('分析已保存'), type: 'success' });
    } catch (err) {
      console.error("Save error:", err);
      setError(t('保存分析失败。'));
    } finally {
      setIsSaving(false);
    }
  };



  const loadResult = (result: any) => {
    setImage(result.designImage);
    setLiveImage(result.buildImage);
    setDifferences(normalizeDifferenceRects(result.differences || []));
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
      await deleteDoc(doc('analysisResults', deleteConfirmId));
      setDeleteConfirmId(null);
      setToast({ message: t('分析已删除'), type: 'success' });
    } catch (err) {
      console.error("Delete error:", err);
      setError(t('删除分析失败。'));
    }
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current && !isAddingDiffRef.current && comparisonMode !== 'split') {
        setPosition({
          x: e.clientX - dragStartRef.current.x,
          y: e.clientY - dragStartRef.current.y
        });
      }

      if (editingDiffIdRef.current && editTypeRef.current) {
        const dx = (e.clientX - editStartPosRef.current.x) / scaleRef.current;
        const dy = (e.clientY - editStartPosRef.current.y) / scaleRef.current;
        const start = editStartRectRef.current;
        const editingPane = editingPaneTypeRef.current || 'design';

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

          const updatedRect = { x, y, width, height };
          if (editingPane === 'design') {
            return { ...d, rect: updatedRect, rectDesign: updatedRect };
          }
          return { ...d, rectBuild: updatedRect };
        }));
      }

      if (isAddingDiffRef.current && newDiffStartRef.current && drawingRectRef.current) {
        const rect = drawingRectRef.current;
        const currentX = (e.clientX - rect.left) / scaleRef.current;
        const currentY = (e.clientY - rect.top) / scaleRef.current;
        const pane = newDiffPaneTypeRef.current || 'design';
        const paneSize = getPaneSize(pane);
        
        const x = Math.max(0, Math.min(paneSize.width || 10000, Math.min(newDiffStartRef.current.x, currentX)));
        const y = Math.max(0, Math.min(paneSize.height || 10000, Math.min(newDiffStartRef.current.y, currentY)));
        const width = Math.min(paneSize.width || 10000, Math.abs(currentX - newDiffStartRef.current.x));
        const height = Math.min(paneSize.height || 10000, Math.abs(currentY - newDiffStartRef.current.y));

        if (width > 2 && height > 2) {
          setDifferences(prev => {
            const filtered = prev.filter(d => d.id !== 'temp-new');
            const paneRect = { x, y, width, height };
            const rectDesign = pane === 'design' ? paneRect : mapRectBetweenPanes(paneRect, 'build', 'design');
            const rectBuild = pane === 'build' ? paneRect : mapRectBetweenPanes(paneRect, 'design', 'build');
            return [...filtered, {
              id: 'temp-new',
              title: t('手动标记'),
              type: 'LAYOUT',
              severity: 'medium',
              description: t('手动添加的差异区域。'),
              rect: rectDesign,
              rectDesign,
              rectBuild,
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
      setEditingPaneType(null);
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
        setNewDiffPaneType(null);
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
        deleteDifference(selectedDiffId);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers read refs/latest state via closures; drag helpers are recreated each render
  }, [isDragging, isResizingSlider, dragStart, image, imageSize, scale, position, isVisible, comparisonMode, selectedDiffId, editingDiffId, isAddingDiff, inlineEdit, isOwner]);

  const handleMouseDown = (e: React.MouseEvent, paneType: PaneType = 'design') => {
    if (!isOwner) return;
    if (isAddingDiff) {
      const rect = e.currentTarget.getBoundingClientRect();
      drawingRectRef.current = rect;
      const x = (e.clientX - rect.left) / scale;
      const y = (e.clientY - rect.top) / scale;
      setNewDiffPaneType(paneType);
      setNewDiffStart({ x, y });
      return;
    }
    if (comparisonMode === 'slider' && paneType === 'build') return;
    if (comparisonMode === 'split') return;
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
      setError(errorText(err, t, t('启动屏幕捕获失败，请检查权限。')));
      setTimeout(() => setError(null), 5000);
    }
  };

  const stopLiveCapture = () => {
    if (liveStream) {
      liveStream.getTracks().forEach(track => track.stop());
      setLiveStream(null);
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
        throw new Error(data.error || t('获取 Figma 图片失败'));
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
      setError(errorText(err, t, t('获取 Figma 图片失败，请检查链接与 FIGMA_ACCESS_TOKEN。')));
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

    setPosition(prev => {
      const newPos = { ...prev };

      switch (type) {
        case 'left': newPos.x = -(viewportW - imgW) / 2; break;
        case 'center-h': newPos.x = 0; break;
        case 'right': newPos.x = (viewportW - imgW) / 2; break;
        case 'top': newPos.y = -(viewportH - imgH) / 2; break;
        case 'center-v': newPos.y = 0; break;
        case 'bottom': newPos.y = (viewportH - imgH) / 2; break;
      }

      return newPos;
    });
  };

  const updateDiffStatus = (id: string, status: 'pending' | 'fixed' | 'ignored') => {
    if (!isOwner) return;
    setDifferences(prev => prev.map(d => d.id === id ? { ...d, status } : d));
    if (selectedDiffId === id) setSelectedDiffId(null);
  };

  const severityMeta: Record<DifferenceSeverity, { label: string; dotClass: string }> = {
    high: { label: t('高严重'), dotClass: 'bg-rose-400' },
    medium: { label: t('中严重'), dotClass: 'bg-amber-400' },
    low: { label: t('低严重'), dotClass: 'bg-emerald-400' },
  };

  const pendingDiffs = differences.filter((d) => d.status === 'pending');
  const severityFilteredPendingDiffs = pendingDiffs.filter((d) => {
    if (severityFilter === 'all') return true;
    return normalizeSeverity(d.severity, d.type) === severityFilter;
  });

  const renderDifferenceBoxes = (paneType: 'design' | 'build') => {
    return differences.filter(d => d.status === 'pending').map((diff) => {
      const isSelected = selectedDiffId === diff.id;
      const severity = normalizeSeverity(diff.severity, diff.type);
      const severityColor = getSeverityColor(severity);
      const paneRect = getRectForPane(diff, paneType);
      
      return (
        <div
          key={diff.id}
          className={`absolute border-2 transition-all z-[60] difference-item ${
            isSelected ? '' : 'hover:brightness-110'
          }`}
          style={{
            left: `${paneRect.x}px`,
            top: `${paneRect.y}px`,
            width: `${paneRect.width}px`,
            height: `${paneRect.height}px`,
            cursor: editingDiffId === diff.id ? 'grabbing' : isSelected ? 'move' : 'pointer',
            borderColor: isSelected ? severityColor.hex : `rgba(${severityColor.rgb}, 0.4)`,
            backgroundColor: isSelected ? `rgba(${severityColor.rgb}, 0.1)` : 'transparent',
          }}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedDiffId(diff.id);
          }}
          onMouseDown={(e) => {
            if (e.button !== 0 || !isOwner) return;
            e.stopPropagation();
            setEditingDiffId(diff.id);
            setEditingPaneType(paneType);
            setEditType('move');
            setEditStartPos({ x: e.clientX, y: e.clientY });
            setEditStartRect({ ...paneRect });
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
                    borderColor: handle.isCorner ? severityColor.hex : 'transparent',
                    cursor: handle.cursor 
                  }}
                  onMouseDown={(e) => { 
                    e.stopPropagation(); 
                    setEditingDiffId(diff.id); 
                    setEditingPaneType(paneType);
                    setEditType(handle.type as any); 
                    setEditStartPos({ x: e.clientX, y: e.clientY }); 
                    setEditStartRect({ ...paneRect }); 
                  }}
                />
              ))}
            </>
          )}
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
            <h3 className={`text-sm font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>{t('设计稿来源')}</h3>
            <p className={`text-xs ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`}>{t('暂无设计稿，等待负责人上传。')}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center gap-6 p-8">
        <div className="flex flex-col items-center gap-2">
          <Layers className={`w-12 h-12 ${theme === 'dark' ? 'text-gray-700' : 'text-gray-300'}`} />
          <h3 className={`text-sm font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>{t('设计稿来源')}</h3>
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
              {t('上传图片')}</button>
            <button 
              onClick={() => setDesignSourceType('figma')} 
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                designSourceType === 'figma' 
                  ? (theme === 'dark' ? 'bg-[#383838] text-white shadow-lg' : 'bg-white text-black shadow-md') 
                  : (theme === 'dark' ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600')
              }`}
            >
              {t('Figma 链接')}</button>
          </div>

          <div className="h-32 flex flex-col justify-center">
            {designSourceType === 'upload' ? (
              <label className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl h-full cursor-pointer transition-all group ${
                theme === 'dark' ? 'bg-[#1e1e1e] hover:bg-[#252525] border-[#383838] hover:border-indigo-500/50' : 'bg-white hover:bg-gray-50 border-gray-200 hover:border-indigo-500/50'
              }`}>
                <Upload className={`w-6 h-6 group-hover:text-indigo-500 transition-colors ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`} />
                <span className={`text-[11px] font-bold uppercase tracking-tight ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>{t('选择图片')}</span>
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
                      placeholder={t('粘贴 Figma 链接...')}
                    />
                  </div>
                  <button 
                    onClick={handleFigmaFetch}
                    disabled={isFetchingFigma || !figmaUrl}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 disabled:cursor-not-allowed px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all shadow-lg shadow-indigo-500/20"
                  >
                    {isFetchingFigma ? <Loader2 className="w-4 h-4 animate-spin" /> : t('获取')}
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
            <h3 className={`text-sm font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>{t('实现稿来源')}</h3>
            <p className={`text-xs ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`}>{t('暂无实现稿，等待负责人上传。')}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center gap-6 p-8">
        <div className="flex flex-col items-center gap-2">
          <Zap className={`w-12 h-12 ${theme === 'dark' ? 'text-gray-700' : 'text-gray-300'}`} />
          <h3 className={`text-sm font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>{t('实现稿来源')}</h3>
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
              {t('图片')}</button>
            <button 
              onClick={() => setLiveSourceType('url')} 
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                liveSourceType === 'url' 
                  ? (theme === 'dark' ? 'bg-[#383838] text-white shadow-lg' : 'bg-white text-black shadow-md') 
                  : (theme === 'dark' ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600')
              }`}
            >
              {t('网址')}</button>
            <button 
              onClick={() => setLiveSourceType('sim')} 
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                liveSourceType === 'sim' 
                  ? (theme === 'dark' ? 'bg-[#383838] text-white shadow-lg' : 'bg-white text-black shadow-md') 
                  : (theme === 'dark' ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600')
              }`}
            >
              {t('模拟')}</button>
          </div>

          <div className="h-32 flex flex-col justify-center">
            {liveSourceType === 'image' ? (
              <label className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl h-full cursor-pointer transition-all group ${
                theme === 'dark' ? 'bg-[#1e1e1e] hover:bg-[#252525] border-[#383838] hover:border-indigo-500/50' : 'bg-white hover:bg-gray-50 border-gray-200 hover:border-indigo-500/50'
              }`}>
                <Upload className={`w-6 h-6 group-hover:text-indigo-500 transition-colors ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`} />
                <span className={`text-[11px] font-bold uppercase tracking-tight ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>{t('上传实现稿')}</span>
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
          <p className="text-sm font-medium text-gray-500 animate-pulse">{t('正在加载项目数据…')}</p>
        </div>
      )}
      <div className={`flex flex-col w-screen h-screen overflow-hidden font-sans transition-colors duration-200 ${theme === 'dark' ? 'bg-[#121212] text-[#e0e0e0]' : 'bg-[#fafafa] text-[#1a1a1a]'}`}>
        <div className="lg:hidden shrink-0 bg-amber-500 px-3 py-1.5 text-center text-[11px] font-medium text-white">
          {t('检查器为桌面端工具，建议使用宽度 1024px 以上的屏幕以获得完整体验')}</div>
        {/* Top Header Bar */}
        <header className={`h-16 shrink-0 border-b flex items-center justify-between px-6 z-[150] transition-colors duration-200 relative ${
          theme === 'dark' ? 'bg-[#1e1e1e] border-[#383838]' : 'bg-white border-gray-200 shadow-sm'
        }`}>
          <div className="flex items-center gap-1">
            <button 
              onClick={handleBackToProjects}
              className={`p-1 rounded-xl transition-all flex items-center group ${
                theme === 'dark' 
                  ? 'text-gray-400 hover:text-white hover:bg-[#2c2c2c]' 
                  : 'text-gray-500 hover:text-indigo-600 hover:bg-gray-50'
              }`}
              title={t('返回项目列表')}
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
                  title={!isOwner ? t('无权修改项目名称') : t('双击编辑项目名称')}
                >
                  <span className="text-sm font-bold tracking-tight">{localizeProjectName(projectName, t)}</span>
                  {!isOwner && (
                    <span className="px-1.5 py-0.5 rounded bg-gray-500/10 text-gray-500 text-[10px] font-bold uppercase tracking-wider border border-gray-500/20">
                      {t('只读')}</span>
                  )}
                  {isOwner && <span className="sr-only">{t('编辑')}</span>}
                </button>
              )}
              
              {/* Save Status Indicator */}
              <div className="flex items-center gap-2 ml-2 min-w-[132px]">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  saveStatus === 'saving' ? 'bg-amber-500 animate-pulse' :
                  saveStatus === 'saved' ? 'bg-emerald-500' :
                  saveStatus === 'unsaved' ? 'bg-gray-400' :
                  'bg-rose-500'
                }`} />
                <div className="flex flex-col leading-none">
                  <span className={`text-[10px] font-medium uppercase tracking-wider ${
                    theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                  }`}>
                    {saveStatus === 'saving' ? t('保存中…') :
                     saveStatus === 'saved' ? t('所有修改已保存') :
                     saveStatus === 'unsaved' ? t('有未保存修改') :
                     t('保存失败')}
                  </span>
                  <span className={`text-[10px] ${
                    theme === 'dark' ? 'text-gray-600' : 'text-gray-400'
                  }`}>
                    {saveStatus === 'saved'
                      ? formatSaveTime(lastSavedAt)
                      : saveStatus === 'saving'
                        ? t('正在同步项目更新')
                        : saveStatus === 'unsaved'
                          ? t('即将自动保存')
                          : t('修改尚未同步')}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Centered Comparison Modes - Full Width */}
          <div className="absolute left-0 right-0 flex justify-center pointer-events-none">
            <div className={`flex items-center gap-1 p-1 rounded-2xl transition-colors duration-200 pointer-events-auto ${
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
                {t('叠加')}</button>
              <button 
                onClick={() => setComparisonMode('slider')}
                className={`px-4 py-1.5 rounded-xl text-[13px] font-semibold transition-all ${
                  comparisonMode === 'slider' 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : (theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700')
                }`}
              >
                {t('滑块')}</button>
              <button 
                onClick={() => setComparisonMode('split')}
                className={`px-4 py-1.5 rounded-xl text-[13px] font-semibold transition-all ${
                  comparisonMode === 'split' 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : (theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700')
                }`}
              >
                {t('分屏')}</button>
              <button 
                onClick={() => setComparisonMode('diff')}
                className={`px-4 py-1.5 rounded-xl text-[13px] font-semibold transition-all ${
                  comparisonMode === 'diff' 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : (theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700')
                }`}
              >
                {t('差分')}</button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/settings')}
                title={t('模型设置')}
                aria-label={t('模型设置')}
                className={`p-1.5 rounded-lg transition-all ${
                  theme === 'dark'
                    ? 'text-gray-400 hover:text-white hover:bg-[#2c2c2c]'
                    : 'text-gray-500 hover:text-indigo-600 hover:bg-gray-100'
                }`}
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowRoundsPanel(!showRoundsPanel)}
                title={t('轮次')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  showRoundsPanel 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' 
                    : (theme === 'dark' ? 'bg-[#2c2c2c] text-gray-400 hover:text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')
                }`}
              >
                <History className="w-4 h-4" />
                {rounds.length > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                    showRoundsPanel ? 'bg-white/20' : 'bg-indigo-100 text-indigo-600'
                  }`}>
                    {rounds.length}
                  </span>
                )}
              </button>

              {isOwner && (
                <button 
                  onClick={() => createNewRound()}
                  disabled={isCreatingRound || !image || !liveImage || differences.length === 0}
                  title={
                    isCreatingRound 
                      ? t('正在创建轮次…') 
                      : !image || !liveImage 
                        ? t('请先上传设计稿并生成实现稿截图。') 
                        : differences.length === 0 
                          ? t('没有可提交的差异，请先标注或分析差异。') 
                          : t('提交轮次')
                  }
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    theme === 'dark' 
                      ? 'bg-[#2c2c2c] text-gray-400 hover:text-white border border-white/5' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'
                  }`}
                >
                  {isCreatingRound && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{t('提交')}</span>
                </button>
              )}
            </div>
          </div>
        </header>

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
              <span className="text-xs font-bold uppercase tracking-widest">{t('标注模式')}</span>
              <div className="h-4 w-px bg-white/20" />
              <span className="text-[10px] opacity-80 font-medium">{t('按住拖拽标注差异 · 按')} <kbd className="bg-white/20 px-1 rounded">Esc</kbd> {t('或')} <kbd className="bg-white/20 px-1 rounded">R</kbd> {t('退出')}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Rulers */}
        <div aria-hidden="true" className={`absolute top-0 left-0 w-full h-5 z-40 border-b transition-colors duration-200 flex items-end overflow-hidden ${theme === 'dark' ? 'bg-[#1e1e1e] border-[#383838]' : 'bg-white border-gray-200'}`}>
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
        <div aria-hidden="true" className={`absolute top-0 left-0 h-full w-5 z-40 border-r transition-colors duration-200 flex flex-col items-end overflow-hidden ${theme === 'dark' ? 'bg-[#1e1e1e] border-[#383838]' : 'bg-white border-gray-200'}`}>
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
                  <button onClick={() => setImage(null)} aria-label={t('清除设计稿')} className="hover:text-rose-400 transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className={`w-full h-full flex items-center justify-center overflow-auto ${theme === 'dark' ? 'bg-[#0a0a0a]' : 'bg-[#e5e5e5]'}`}>
                {image ? (
                  <div 
                    className={`relative inline-block ${isAddingDiff ? 'cursor-crosshair' : ''}`} 
                    style={{ transform: `scale(${scale})`, transformOrigin: 'center' }} 
                    onMouseDown={(e) => handleMouseDown(e, 'design')}
                  >
                    <img src={image} alt={t('设计稿')} className="max-w-none" style={{ width: '390px' }} draggable={false} />
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
                    aria-label={t('清除构建源')}
                    className="hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
              {liveSourceType === 'url' && url ? (
                <div className="w-full h-full relative overflow-hidden">
                  <iframe src={url} title={t('构建页面预览')} className="w-full h-full border-none bg-white" style={{ transform: `scale(${scale})`, transformOrigin: 'center' }} />
                </div>
              ) : (
                <div className={`w-full h-full flex items-center justify-center overflow-auto ${theme === 'dark' ? 'bg-[#0a0a0a]' : 'bg-[#e5e5e5]'}`}>
                  <div 
                    className={`relative inline-block ${isAddingDiff ? 'cursor-crosshair' : ''}`} 
                    style={{ transform: `scale(${scale})`, transformOrigin: 'center' }} 
                    onMouseDown={(e) => handleMouseDown(e, 'build')}
                  >
                    {liveSourceType === 'sim' && liveStream ? (
                      <>
                        <video ref={videoRef} autoPlay playsInline className="max-w-none" style={{ width: '390px' }} />
                        {renderDifferenceBoxes('build')}
                      </>
                    ) : liveImage ? (
                      <>
                        <div 
                          style={{ transform: `scale(${scale})`, transformOrigin: 'center' }} 
                          onMouseDown={(e) => handleMouseDown(e, 'build')}
                        >
                          <img src={liveImage} alt={t('构建截图')} className="max-h-none max-w-none" style={{ width: '390px' }} draggable={false} />
                        </div>
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
                    aria-label={t('清除构建源')}
                    className="hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
              {liveSourceType === 'url' && url ? (
                <div className="w-full h-full relative overflow-hidden">
                  <iframe src={url} title={t('构建页面预览')} className="w-full h-full border-none bg-white" style={{ transform: `scale(${scale})`, transformOrigin: 'center' }} />
                </div>
              ) : (
                <div className={`w-full h-full flex items-center justify-center overflow-auto ${theme === 'dark' ? 'bg-[#0a0a0a]' : 'bg-[#e5e5e5]'}`}>
                  <div 
                    className="relative inline-block" 
                    style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}
                    onMouseDown={(e) => handleMouseDown(e, 'build')}
                  >
                    {liveSourceType === 'sim' && liveStream ? (
                      <>
                        <video ref={videoRef} autoPlay playsInline className="max-w-none" style={{ width: '390px' }} />
                        {renderDifferenceBoxes('build')}
                      </>
                    ) : liveImage ? (
                      <>
                        <img src={liveImage} alt={t('构建截图')} className="max-h-none max-w-none pointer-events-none" style={{ width: '390px' }} draggable={false} />
                        {renderDifferenceBoxes('build')}
                      </>
                    ) : (
                      <div className="pointer-events-auto" onMouseDown={(e) => e.stopPropagation()}>
                        {renderLiveSourceSelector()}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            {/* Foreground (Design) - Clipped using clip-path to maintain alignment */}
            <div 
              className="absolute z-10"
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
                    className="origin-center cursor-move pointer-events-auto"
                    style={{
                      transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                    }}
                    onMouseDown={(e) => handleMouseDown(e, 'design')}
                  >
                    <img src={image} alt={t('设计稿')} className="max-w-none pointer-events-none" style={{ width: '390px' }} draggable={false} />
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
                  <button onClick={() => setImage(null)} aria-label={t('清除设计稿')} className="hover:text-rose-400 transition-colors">
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
                    aria-label={t('清除构建源')}
                    className="hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
            {/* Background Layer & Overlay Container */}
            <div className={`w-full h-full flex items-center justify-center overflow-auto relative ${theme === 'dark' ? 'bg-[#0a0a0a]' : 'bg-[#e5e5e5]'}`} style={{ isolation: 'isolate' }}>
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
                    <div className="w-full h-full relative">
                      <iframe 
                        src={url} 
                        className="w-full h-full border-none bg-white"
                        title={t('实时页面')}
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
                  )}

                  {liveSourceType === 'image' && liveImage && (
                    <div 
                      className={`relative inline-block ${isAddingDiff && isOwner ? 'cursor-crosshair' : ''}`} 
                      style={{ transform: `scale(${scale})`, transformOrigin: 'center' }} 
                      onMouseDown={(e) => handleMouseDown(e, 'build')}
                    >
                      <img 
                        src={liveImage} 
                        alt={t('实现稿截图')} 
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
                      onMouseDown={(e) => handleMouseDown(e, 'build')}
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
                        onMouseDown={(e) => handleMouseDown(e, 'design')}
                      >
                        <img 
                          src={image} 
                          alt={t('设计稿叠加')} 
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

                  {/* Removed redundant selectors as they are now handled above */}
                </>
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
    </div>
    <div className={`w-96 h-full border-l flex flex-col z-50 overflow-hidden transition-colors duration-200 ${
        theme === 'dark' 
          ? 'bg-[#1e1e1e] border-[#383838] text-[#e0e0e0]' 
          : 'bg-white border-[#e0e0e0] text-[#1a1a1a]'
      }`}>
        {differences.length > 0 && (
          <>
            {/* Tab Header */}
            <div className={`flex border-b ${theme === 'dark' ? 'border-white/10' : 'border-black/5'}`}>
              <button 
                onClick={() => setActivePanel('controls')}
                className={`flex-1 py-3 text-center text-xs font-semibold transition-colors ${
                  activePanel === 'controls'
                    ? (theme === 'dark' ? 'text-white border-b-2 border-indigo-500' : 'text-indigo-600 border-b-2 border-indigo-500')
                    : (theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700')
                }`}
              >
                {t('控制面板')}</button>
              <button 
                onClick={() => setActivePanel('differences')}
                className={`flex-1 py-3 text-center text-xs font-semibold transition-colors relative ${
                  activePanel === 'differences'
                    ? (theme === 'dark' ? 'text-white border-b-2 border-indigo-500' : 'text-indigo-600 border-b-2 border-indigo-500')
                    : (theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700')
                }`}
              >
                {t('差异列表')}<span className={`ml-1 text-[10px] px-2 py-0.5 rounded-full ${
                  activePanel === 'differences'
                    ? (theme === 'dark' ? 'bg-indigo-500/30 text-indigo-400' : 'bg-indigo-100 text-indigo-600')
                    : (theme === 'dark' ? 'bg-gray-700/50 text-gray-400' : 'bg-gray-200 text-gray-600')
                }`}>
                  {differences.length}
                </span>
              </button>
            </div>
          </>
        )}

        {differences.length > 0 && activePanel === 'differences' ? (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className={`p-4 border-b flex items-center justify-between ${theme === 'dark' ? 'border-white/10' : 'border-black/5'}`}>
              <h2 className="text-sm font-bold uppercase tracking-wider">{t('差异列表')}</h2>
              <button 
                onClick={() => {
                  setDifferences([]);
                  setSelectedDiffId(null);
                }}
                className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded transition-colors ${
                  theme === 'dark' ? 'text-gray-500 hover:text-rose-500 hover:bg-rose-500/10' : 'text-gray-400 hover:text-rose-600 hover:bg-rose-50'
                }`}
              >
                {t('清空')}</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              <div className="px-1 pb-1 flex items-center gap-1.5">
                {(['all', 'high', 'medium', 'low'] as Array<'all' | DifferenceSeverity>).map((filterValue) => {
                  const isActive = severityFilter === filterValue;
                  const count = filterValue === 'all'
                    ? pendingDiffs.length
                    : pendingDiffs.filter((d) => normalizeSeverity(d.severity, d.type) === filterValue).length;
                  const label = filterValue === 'all'
                    ? t('全部')
                    : severityMeta[filterValue].label;
                  return (
                    <button
                      key={filterValue}
                      onClick={() => setSeverityFilter(filterValue)}
                      className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                        isActive
                          ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-400'
                          : (theme === 'dark' ? 'bg-white/5 border-white/10 text-gray-400 hover:text-gray-200' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-700')
                      }`}
                    >
                      {label} {count}
                    </button>
                  );
                })}
              </div>

              {severityFilteredPendingDiffs.length > 0 ? (
                <div className="space-y-2">
                  {useNewDiffListUI ? (
                    severityFilteredPendingDiffs.map((diff) => {
                      const severity = normalizeSeverity(diff.severity, diff.type);
                      return (
                        <DifferenceListItemV2
                          key={diff.id}
                          diff={diff}
                          severity={severity}
                          isSelected={selectedDiffId === diff.id}
                          isOwner={isOwner}
                          theme={theme === 'dark' ? 'dark' : 'light'}
                          inlineEditField={inlineEdit?.id === diff.id && (inlineEdit.field === 'title' || inlineEdit.field === 'description') ? inlineEdit.field : null}
                          onSelect={() => {
                            if (selectedDiffId !== diff.id) {
                              setSelectedDiffId(diff.id);
                            }
                          }}
                          onStartEdit={(field) => {
                            setInlineEdit({ id: diff.id, field });
                          }}
                          onStopEdit={() => setInlineEdit(null)}
                          onTitleChange={(value) => {
                            setDifferences(prev => prev.map(d => d.id === diff.id ? { ...d, title: value } : d));
                          }}
                          onDescriptionChange={(value) => {
                            setDifferences(prev => prev.map(d => d.id === diff.id ? { ...d, description: value } : d));
                          }}
                          onCycleType={() => {
                            const types: Difference['type'][] = ['CONTENT', 'LAYOUT', 'STYLE'];
                            const currentIndex = types.indexOf(diff.type);
                            const nextType = types[(currentIndex + 1) % types.length];
                            setDifferences(prev => prev.map(d => d.id === diff.id ? { ...d, type: nextType } : d));
                          }}
                          onSetSeverity={(value) => {
                            setDifferences(prev => prev.map(d => d.id === diff.id ? { ...d, severity: value } : d));
                          }}
                          onMarkFixed={() => updateDiffStatus(diff.id, 'fixed')}
                          onIgnore={() => updateDiffStatus(diff.id, 'ignored')}
                        />
                      );
                    })
                  ) : (
                    severityFilteredPendingDiffs.map((diff) => (
                          <div
                            key={diff.id}
                            onClick={() => {
                              if (selectedDiffId !== diff.id) {
                                setSelectedDiffId(diff.id);
                              }
                            }}
                            role="button"
                            tabIndex={0}
                            aria-pressed={selectedDiffId === diff.id}
                            aria-label={t('差异：{title}', { title: diff.title || t('未命名差异') })}
                            onKeyDown={(e) => {
                              if (e.target !== e.currentTarget) return;
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSelectedDiffId(diff.id);
                              }
                            }}
                            className={`p-4 rounded-xl transition-all cursor-pointer group relative difference-item ${
                              selectedDiffId === diff.id
                                ? 'bg-indigo-500/10'
                                : 'bg-transparent hover:bg-indigo-500/10'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              {(() => {
                                const Icon = getDifferenceTypeIcon(diff.type);
                                return (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!isOwner) return;
                                      const types: Difference['type'][] = ['CONTENT', 'LAYOUT', 'STYLE'];
                                      const currentIndex = types.indexOf(diff.type);
                                      const nextType = types[(currentIndex + 1) % types.length];
                                      setDifferences(prev => prev.map(d => d.id === diff.id ? { ...d, type: nextType } : d));
                                    }}
                                    title={isOwner ? t('点击切换类型') : ""}
                                    className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center transition-colors ${
                                      selectedDiffId === diff.id ? 'text-indigo-400' : 'text-gray-500'
                                    }`}
                                  >
                                    <Icon className="w-3 h-3" />
                                  </button>
                                );
                              })()}
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
                                        <option value="CONTENT">{t('内容')}</option>
                                        <option value="LAYOUT">{t('布局')}</option>
                                        <option value="STYLE">{t('样式')}</option>
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
                                        {(() => {
                                          const severity = normalizeSeverity(diff.severity, diff.type);
                                          return (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (!isOwner) return;
                                                const updated = nextSeverity(severity);
                                                setDifferences(prev => prev.map(d => d.id === diff.id ? { ...d, severity: updated } : d));
                                              }}
                                              title={isOwner
                                                ? t('严重等级：{level}（点击切换）', { level: t(severity === 'high' ? '高' : severity === 'medium' ? '中' : '低') })
                                                : t('严重等级：{level}', { level: t(severity === 'high' ? '高' : severity === 'medium' ? '中' : '低') })}
                                              aria-label={`severity-${severity}`}
                                              className={`w-2.5 h-2.5 rounded-full transition-all ${
                                                severity === 'high'
                                                  ? 'bg-rose-400 shadow-[0_0_0_2px_rgba(251,113,133,0.18)]'
                                                  : severity === 'medium'
                                                    ? 'bg-amber-400 shadow-[0_0_0_2px_rgba(251,191,36,0.18)]'
                                                    : 'bg-emerald-400 shadow-[0_0_0_2px_rgba(52,211,153,0.18)]'
                                              }`}
                                            />
                                          );
                                        })()}
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
                                          <Check className="w-3 h-3" /> {t('保存')}</button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="relative">
                                      <p
                                        className={`text-[11px] leading-relaxed line-clamp-3 group-hover:line-clamp-none transition-all pr-6 ${
                                          theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                                        } ${
                                          selectedDiffId === diff.id && isOwner
                                            ? (theme === 'dark' ? 'cursor-text hover:text-gray-200' : 'cursor-text hover:text-gray-700')
                                            : 'cursor-pointer'
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
                                            <Sparkles className="w-3 h-3" /> {t('查看对比图 (View Comparison)')}</a>
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
                                      {t('标记已修复')}</button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        updateDiffStatus(diff.id, 'ignored');
                                      }}
                                      className="flex-1 py-1.5 rounded-lg bg-white/5 text-gray-400 text-[10px] font-bold hover:bg-white/10 transition-colors"
                                    >
                                      {t('忽略')}</button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                    ))
                  )}
                </div>
              ) : null}
              
              {differences.some(d => d.status !== 'pending') && (
                <div className="pt-4 px-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">{t('已解决')}</h4>
                  <div className="space-y-1 opacity-50">
                    {differences.filter(d => d.status !== 'pending').map(diff => (
                      <div key={diff.id} className="flex items-center justify-between p-2 rounded bg-white/5 text-[11px] group/resolved">
                        <div className="flex items-center gap-2 min-w-0">
                          {(() => {
                            const severity = normalizeSeverity(diff.severity, diff.type);
                            return (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!isOwner) return;
                                  const updated = nextSeverity(severity);
                                  setDifferences(prev => prev.map(d => d.id === diff.id ? { ...d, severity: updated } : d));
                                }}
                                title={isOwner
                                  ? t('严重等级：{level}（点击切换）', { level: t(severity === 'high' ? '高' : severity === 'medium' ? '中' : '低') })
                                  : t('严重等级：{level}', { level: t(severity === 'high' ? '高' : severity === 'medium' ? '中' : '低') })}
                                aria-label={`resolved-severity-${severity}`}
                                className={`w-2.5 h-2.5 rounded-full transition-all shrink-0 ${
                                  severity === 'high'
                                    ? 'bg-rose-400 shadow-[0_0_0_2px_rgba(251,113,133,0.18)]'
                                    : severity === 'medium'
                                      ? 'bg-amber-400 shadow-[0_0_0_2px_rgba(251,191,36,0.18)]'
                                      : 'bg-emerald-400 shadow-[0_0_0_2px_rgba(52,211,153,0.18)]'
                                }`}
                              />
                            );
                          })()}
                          <span className="truncate">{diff.title}</span>
                          <span className={`text-[8px] uppercase font-bold px-1 rounded ${
                            diff.status === 'fixed' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-gray-500/20 text-gray-400'
                          }`}>
                            {diff.status}
                          </span>
                        </div>
                        {isOwner && (
                          <div className="flex items-center gap-1 opacity-0 group-hover/resolved:opacity-100 transition-all">
                            <button 
                              onClick={() => updateDiffStatus(diff.id, 'pending')}
                              className="p-1 hover:bg-white/10 rounded text-indigo-400 transition-all"
                              title={t('恢复')}
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-8 pt-6 border-t border-white/5 text-center px-4 pb-4">
                <p className={`text-[10px] leading-relaxed ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                  {aiModelLabel
                    ? t('本回答由 AI（{model}）生成，内容仅供参考', { model: aiModelLabel })
                    : t('本回答由 AI生成，内容仅供参考')}
                </p>
              </div>
            </div>

            {isOwner && (
              <AnalyzeActionBar
                theme={theme}
                onAnalyze={analyzeFidelity}
                models={aiModels}
                selectedModelId={aiModelId}
                onSelectModel={handleSelectAiModel}
                isAnalyzing={isAnalyzing}
                hasBothImages={!!image && !!liveImage}
                hasDifferences={differences.length > 0}
              />
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4">
              {isAnalyzing ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">{t('正在分析还原度…')}</p>
              </div>
            ) : (
              <>
                {showHistory ? (
              <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t('历史分析')}</h3>
                  <button onClick={() => setShowHistory(false)} className="text-[10px] text-indigo-500 hover:underline">{t('返回')}</button>
                </div>
                <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-120px)] pr-1">
                  {savedResults.length === 0 ? (
                    <div className="py-10 text-center">
                      <p className="text-[11px] text-gray-500">{t('暂无已保存的分析。')}</p>
                    </div>
                  ) : (
                    savedResults.map(result => (
                      <div 
                        key={result.id}
                        onClick={() => loadResult(result)}
                        role="button"
                        tabIndex={0}
                        aria-label={t('载入分析：{name}', { name: result.name })}
                        onKeyDown={(e) => {
                          if (e.target !== e.currentTarget) return;
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            loadResult(result);
                          }
                        }}
                        className={`p-3 rounded-xl border transition-all cursor-pointer group ${
                          theme === 'dark' ? 'bg-[#2c2c2c] border-[#383838] hover:border-indigo-500/50' : 'bg-gray-50 border-gray-200 hover:border-indigo-500/50'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="text-[12px] font-bold truncate flex-1">{result.name}</h4>
                          {isOwner && (
                            <button 
                              onClick={(e) => deleteResult(result.id, e)}
                              aria-label={t('删除已保存的分析')}
                              className="opacity-0 group-hover:opacity-100 p-1 text-rose-500 hover:bg-rose-500/10 rounded transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <div className="w-12 h-12 rounded border border-white/10 overflow-hidden shrink-0">
                            <img src={result.designImage} alt={t('设计稿缩略图')} className="w-full h-full object-cover" draggable={false} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] text-gray-500">
                              {new Date(result.timestamp).toLocaleDateString(locale)}
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

                {image && isOwner ? (
                  <div className={`flex flex-col gap-6 pt-4 ${theme === 'dark' ? '' : ''}`}>
                    {/* Position & Alignment */}
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-3">
                        <label className={`text-[10px] uppercase tracking-widest font-bold ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                          Position
                        </label>
                        <div className="flex items-center gap-2">
                          <div className={`flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${theme === 'dark' ? 'bg-[#2c2c2c]' : 'bg-gray-100'}`}>
                            <span className="text-[10px] font-mono text-gray-400 w-3">X</span>
                            <input 
                              type="number" 
                              value={Math.round(position.x)} 
                              onChange={(e) => setPosition(prev => ({ ...prev, x: parseInt(e.target.value) || 0 }))}
                              className="w-full bg-transparent text-[11px] font-mono outline-none dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>
                          <div className={`flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${theme === 'dark' ? 'bg-[#2c2c2c]' : 'bg-gray-100'}`}>
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
                            title={t('居中')}
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
                        <div className={`flex rounded p-0.5 gap-0.5 ${theme === 'dark' ? 'bg-[#2c2c2c]' : 'bg-gray-100'}`}>
                          <button onClick={() => align('left')} className={`flex-1 p-1.5 rounded transition-colors flex justify-center ${theme === 'dark' ? 'hover:bg-[#383838] text-gray-400 hover:text-white' : 'hover:bg-white text-gray-500 hover:text-black hover:shadow-sm'}`} title={t('左对齐')}>
                            <AlignStartVertical className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => align('center-h')} className={`flex-1 p-1.5 rounded transition-colors flex justify-center ${theme === 'dark' ? 'hover:bg-[#383838] text-gray-400 hover:text-white' : 'hover:bg-white text-gray-500 hover:text-black hover:shadow-sm'}`} title={t('水平居中')}>
                            <AlignCenterVertical className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => align('right')} className={`flex-1 p-1.5 rounded transition-colors flex justify-center ${theme === 'dark' ? 'hover:bg-[#383838] text-gray-400 hover:text-white' : 'hover:bg-white text-gray-500 hover:text-black hover:shadow-sm'}`} title={t('右对齐')}>
                            <AlignEndVertical className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className={`flex rounded p-0.5 gap-0.5 ${theme === 'dark' ? 'bg-[#2c2c2c]' : 'bg-gray-100'}`}>
                          <button onClick={() => align('top')} className={`flex-1 p-1.5 rounded transition-colors flex justify-center ${theme === 'dark' ? 'hover:bg-[#383838] text-gray-400 hover:text-white' : 'hover:bg-white text-gray-500 hover:text-black hover:shadow-sm'}`} title={t('顶部对齐')}>
                            <AlignStartHorizontal className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => align('center-v')} className={`flex-1 p-1.5 rounded transition-colors flex justify-center ${theme === 'dark' ? 'hover:bg-[#383838] text-gray-400 hover:text-white' : 'hover:bg-white text-gray-500 hover:text-black hover:shadow-sm'}`} title={t('垂直居中')}>
                            <AlignCenterHorizontal className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => align('bottom')} className={`flex-1 p-1.5 rounded transition-colors flex justify-center ${theme === 'dark' ? 'hover:bg-[#383838] text-gray-400 hover:text-white' : 'hover:bg-white text-gray-500 hover:text-black hover:shadow-sm'}`} title={t('底部对齐')}>
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
                          className={`w-full accent-indigo-500 h-1 rounded-lg appearance-none cursor-pointer ${theme === 'dark' ? 'bg-[#383838]' : 'bg-gray-200'}`}
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
                          <button onClick={resetTransform} className="text-indigo-500 hover:text-indigo-600 transition-colors" title={t('重置')}>
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
                        className={`w-full accent-indigo-500 h-1 rounded-lg appearance-none cursor-pointer ${theme === 'dark' ? 'bg-[#383838]' : 'bg-gray-200'}`}
                      />
                    </div>
                  </div>
                </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 gap-4 text-center px-6">
                    <div className="w-16 h-16 bg-indigo-500/10 rounded-full flex items-center justify-center mb-4">
                      <Sparkles className="w-8 h-8 text-indigo-500" />
                    </div>
                    <h3 className="text-sm font-bold mb-2">{t('准备开始分析')}</h3>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      {t('上传设计稿与实现稿截图后即可开始还原度分析。')}</p>
                  </div>
                )}
              </>
            )}
          </>
        )}
              </div>
            </div>
            {isOwner && (
              <AnalyzeActionBar
                theme={theme}
                onAnalyze={analyzeFidelity}
                models={aiModels}
                selectedModelId={aiModelId}
                onSelectModel={handleSelectAiModel}
                isAnalyzing={isAnalyzing}
                hasBothImages={!!image && !!liveImage}
                hasDifferences={differences.length > 0}
              />
            )}
      </>
    )}
  </div>
</div>

      {/* Rounds History Panel */}
      <AnimatePresence>
        {showRoundsPanel && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: roundsPanelHeight, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={isResizingRoundsPanel ? { duration: 0 } : { type: 'spring', damping: 25, stiffness: 200 }}
            className={`relative w-full z-[160] shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.1)] flex flex-col overflow-hidden shrink-0 scrollbar-hide ${
              theme === 'dark' ? 'bg-[#1e1e1e]' : 'bg-white'
            }`}
          >
            {/* Resize Handle */}
            <div 
              onMouseDown={() => setIsResizingRoundsPanel(true)}
              className="absolute top-0 left-0 right-0 h-1 cursor-row-resize hover:bg-indigo-500/50 transition-colors z-[170]"
            />

            <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 flex gap-4 items-center scrollbar-hide">
              {rounds.length === 0 ? (
                <div className="flex items-center justify-center w-full text-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${theme === 'dark' ? 'bg-[#2c2c2c]' : 'bg-gray-50'}`}>
                    <History className="w-5 h-5 text-gray-400" />
                  </div>
                  <div className="text-left">
                    <p className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>{t('暂无验收轮次。')}</p>
                    <p className="text-xs text-gray-500">{t('提交第一轮以开始追踪进度。')}</p>
                  </div>
                </div>
              ) : (
                rounds.map((round) => {
                  // Calculate scale based on height
                  // Base height is 150px, base card width is 240px
                  const scaleFactor = roundsPanelHeight / 150;
                  const cardWidth = 240 * scaleFactor;
                  
                  return (
                    <div
                      key={round.id}
                      onClick={() => loadRound(round)}
                      role="button"
                      tabIndex={0}
                      aria-label={t('载入第 {n} 轮', { n: round.roundNumber })}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          loadRound(round);
                        }
                      }}
                      style={{ width: cardWidth }}
                      className={`shrink-0 cursor-pointer text-left p-2 rounded-xl border transition-all group overflow-hidden ${
                        currentRoundId === round.id
                          ? 'border-indigo-500 bg-indigo-500/5 ring-1 ring-indigo-500'
                          : (theme === 'dark' ? 'border-[#383838] bg-[#252525] hover:border-gray-600' : 'border-gray-100 bg-gray-50 hover:border-gray-300')
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`text-[9px] font-bold uppercase tracking-tighter whitespace-nowrap px-1.5 py-0.5 rounded-full shrink-0 ${
                            currentRoundId === round.id ? 'bg-indigo-500 text-white' : (theme === 'dark' ? 'bg-[#383838] text-gray-400' : 'bg-white text-gray-500 border border-gray-200')
                          }`}>
                            {t('第 {n} 轮', { n: round.roundNumber })}
                          </span>
                          <span className="text-[8px] text-gray-500 truncate hidden sm:inline">
                            {formatRoundDate(round)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {isOwner && (
                            <button
                              onClick={(e) => requestDeleteRound(round.id, e)}
                              className={`p-1 rounded-md transition-all ${
                                theme === 'dark'
                                  ? 'text-gray-500 hover:text-rose-400 hover:bg-rose-500/10'
                                  : 'text-gray-400 hover:text-rose-500 hover:bg-rose-50'
                              }`}
                              title={t('删除轮次')}
                              aria-label={t('删除轮次')}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                          {['Pending', 'Verified', 'Rejected'].map((status) => (
                            <button
                              key={status}
                              onClick={(e) => {
                                e.stopPropagation();
                                updateRoundStatus(round.id, status);
                              }}
                              className={`px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase transition-all ${
                                round.status === status
                                  ? (status === 'Verified' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : status === 'Rejected' ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' : 'bg-amber-500 text-white shadow-lg shadow-amber-500/20')
                                  : (theme === 'dark' ? 'bg-[#383838] text-gray-500 hover:text-gray-300' : 'bg-white text-gray-400 border border-gray-200 hover:border-gray-300')
                              }`}
                            >
                              {status === 'Pending' ? t('待') : status === 'Verified' ? t('过') : t('拒')}
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <div className="flex gap-2 mb-2">
                        <div className="flex-1 aspect-video rounded-lg bg-black/5 overflow-hidden border border-black/5">
                          <img src={round.designImage} alt={t('设计稿')} className="w-full h-full object-cover" referrerPolicy="no-referrer" draggable={false} />
                        </div>
                        <div className="flex-1 aspect-video rounded-lg bg-black/5 overflow-hidden border border-black/5">
                          <img src={round.buildImage} alt={t('实现稿')} className="w-full h-full object-cover" referrerPolicy="no-referrer" draggable={false} />
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <MessageSquare className="w-3 h-3 text-gray-400" />
                          <span className="text-[10px] text-gray-500">{t('{n} 项差异', { n: round.differences?.length || 0 })}</span>
                        </div>
                        <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          round.status === 'Verified' ? 'text-emerald-500' :
                          round.status === 'Rejected' ? 'text-rose-500' :
                          'text-amber-500'
                        }`}>
                          {round.status === 'Verified' ? t('已通过') : round.status === 'Rejected' ? t('已驳回') : t('待验收')}
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
                <h2 className="text-xl font-bold dark:text-white">{t('保存分析')}</h2>
                <button onClick={() => setShowSaveModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full dark:text-gray-400">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">{t('分析名称')}</label>
                  <input 
                    type="text" 
                    maxLength={100}
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    autoFocus
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-white/5 border border-transparent focus:border-indigo-500 rounded-xl outline-none transition-all dark:text-white"
                    placeholder={t('例如：首页走查')}
                  />
                </div>
              </div>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-white/5 flex gap-3">
              <button 
                onClick={() => setShowSaveModal(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10 rounded-xl transition-colors"
              >
                {t('取消')}</button>
              <button 
                onClick={confirmSave}
                disabled={isSaving}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-lg shadow-indigo-500/20 disabled:opacity-50"
              >
                {isSaving ? t('保存中…') : t('保存分析')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>

    <AnimatePresence>
      {roundDeleteConfirmId && (
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
              <h2 className="text-xl font-bold mb-2 dark:text-white">{t('删除轮次？')}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('此操作不可撤销，该轮次及其评审快照将被永久删除。')}</p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-white/5 flex gap-3">
              <button
                onClick={() => setRoundDeleteConfirmId(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10 rounded-xl transition-colors"
              >
                {t('取消')}</button>
              <button
                onClick={confirmDeleteRound}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-rose-500 hover:bg-rose-600 rounded-xl transition-colors shadow-lg shadow-rose-500/20"
              >
                {t('删除')}</button>
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
              <h2 className="text-xl font-bold mb-2 dark:text-white">{t('删除分析？')}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('此操作不可撤销，该分析记录将被永久删除。')}</p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-white/5 flex gap-3">
              <button 
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10 rounded-xl transition-colors"
              >
                {t('取消')}</button>
              <button 
                onClick={confirmDeleteResult}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-rose-500 hover:bg-rose-600 rounded-xl transition-colors shadow-lg shadow-rose-500/20"
              >
                {t('删除')}</button>
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
    </div>
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ProjectManagement />} />
      <Route path="/checker" element={<DesignChecker />} />
      <Route path="/checker/:projectId" element={<DesignChecker />} />
      <Route path="/settings" element={<ModelSettings />} />
    </Routes>
  );
}
