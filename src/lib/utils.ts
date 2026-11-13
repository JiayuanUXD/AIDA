import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { DifferenceSeverity, DifferenceType } from '../types/analysis';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type UiToken = {
  text: string;
  bg: string;
  border: string;
  dot: string;
  leftBar: string;
};

export const getSeverityToken = (severity?: DifferenceSeverity): UiToken => {
  if (severity === 'high') {
    return {
      text: 'text-rose-600',
      bg: 'bg-rose-50',
      border: 'border-rose-200',
      dot: 'bg-rose-500',
      leftBar: 'bg-rose-500',
    };
  }

  if (severity === 'medium') {
    return {
      text: 'text-amber-600',
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      dot: 'bg-amber-500',
      leftBar: 'bg-amber-500',
    };
  }

  return {
    text: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
    leftBar: 'bg-emerald-500',
  };
};

export const getTypeToken = (type?: DifferenceType): UiToken => {
  if (type === 'CONTENT') {
    return {
      text: 'text-sky-600',
      bg: 'bg-sky-50',
      border: 'border-sky-200',
      dot: 'bg-sky-500',
      leftBar: 'bg-sky-500',
    };
  }

  if (type === 'LAYOUT') {
    return {
      text: 'text-violet-600',
      bg: 'bg-violet-50',
      border: 'border-violet-200',
      dot: 'bg-violet-500',
      leftBar: 'bg-violet-500',
    };
  }

  return {
    text: 'text-slate-600',
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    dot: 'bg-slate-500',
    leftBar: 'bg-slate-500',
  };
};

export type RoundStatus = 'Pending' | 'Verified' | 'Rejected' | string;
export type DiffWorkflowStatus = 'pending' | 'fixed' | 'ignored' | string;

export const getStatusToken = (status?: RoundStatus): UiToken => {
  if (status === 'Verified') {
    return {
      text: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      dot: 'bg-emerald-500',
      leftBar: 'bg-emerald-500',
    };
  }

  if (status === 'Rejected') {
    return {
      text: 'text-rose-600',
      bg: 'bg-rose-50',
      border: 'border-rose-200',
      dot: 'bg-rose-500',
      leftBar: 'bg-rose-500',
    };
  }

  return {
    text: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
    leftBar: 'bg-amber-500',
  };
};

export const getDiffStatusToken = (status?: DiffWorkflowStatus): UiToken => {
  if (status === 'fixed') {
    return {
      text: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      dot: 'bg-emerald-500',
      leftBar: 'bg-emerald-500',
    };
  }

  if (status === 'ignored') {
    return {
      text: 'text-slate-600',
      bg: 'bg-slate-50',
      border: 'border-slate-200',
      dot: 'bg-slate-500',
      leftBar: 'bg-slate-500',
    };
  }

  return {
    text: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
    leftBar: 'bg-amber-500',
  };
};
