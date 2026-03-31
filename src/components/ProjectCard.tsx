import React from 'react';
import { Project } from '../types';
import { cn } from '../lib/utils';

interface ProjectCardProps {
  project: Project;
  viewMode: 'grid' | 'list';
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ project, viewMode }) => {
  if (viewMode === 'list') {
    return (
      <div className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-xl hover:shadow-sm transition-shadow cursor-pointer group">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-50 border border-gray-100">
            <img src={project.thumbnail} alt={project.name} className="w-full h-full object-cover" />
          </div>
          <div>
            <h3 className="font-medium text-sm text-gray-900">{project.name}</h3>
            <p className="text-xs text-gray-400">Edited {project.lastEdited}</p>
          </div>
        </div>
        <div className="flex -space-x-2">
          {project.members?.map((member, i) => (
            <img
              key={i}
              src={member}
              alt="Member"
              className="w-6 h-6 rounded-full border-2 border-white bg-gray-100"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden hover:shadow-md transition-all cursor-pointer group">
      <div className="aspect-[4/3] bg-gray-50 relative overflow-hidden">
        <img
          src={project.thumbnail}
          alt={project.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
      </div>
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
             <div className="w-4 h-4 bg-indigo-500 rounded-sm" />
          </div>
          <div>
            <h3 className="font-medium text-sm text-gray-900">{project.name}</h3>
            <p className="text-xs text-gray-400">Edited {project.lastEdited}</p>
          </div>
        </div>
        <div className="flex -space-x-2">
          {project.members?.map((member, i) => (
            <img
              key={i}
              src={member}
              alt="Member"
              className="w-7 h-7 rounded-full border-2 border-white bg-gray-100"
            />
          ))}
        </div>
      </div>
    </div>
  );
};
