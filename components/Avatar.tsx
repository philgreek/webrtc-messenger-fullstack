import React from 'react';
import type { ContactStatus } from '../types';

interface AvatarProps {
  src: string;
  alt: string;
  size?: 'small' | 'medium' | 'large' | 'xlarge';
  status?: ContactStatus;
}

const sizeClasses = {
  small: 'w-10 h-10',
  medium: 'w-16 h-16',
  large: 'w-24 h-24',
  xlarge: 'w-32 h-32',
};

const statusClasses = {
  base: 'absolute rounded-full border-2 border-gray-900',
  ONLINE: 'bg-green-500',
  AWAY: 'bg-yellow-400',
  OFFLINE: 'bg-gray-500',
};

const statusSizeClasses = {
  small: 'w-3 h-3 bottom-0 right-0',
  medium: 'w-4 h-4 bottom-1 right-1',
  large: 'w-6 h-6 bottom-2 right-2',
  xlarge: 'w-8 h-8 bottom-2 right-2',
}

export const Avatar: React.FC<AvatarProps> = ({ src, alt, size = 'medium', status }) => {
  return (
    <div className={`relative flex-shrink-0 ${sizeClasses[size]}`}>
      <img
        src={src}
        alt={alt}
        className="w-full h-full rounded-full object-cover shadow-lg"
      />
      {status && (
        <span
          className={`${statusClasses.base} ${statusClasses[status]} ${statusSizeClasses[size]}`}
          title={status.charAt(0) + status.slice(1).toLowerCase()}
        ></span>
      )}
    </div>
  );
};
