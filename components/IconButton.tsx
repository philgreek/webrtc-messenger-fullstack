
import React from 'react';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  size?: 'medium' | 'large';
}

const baseClasses = 'rounded-full p-3 transition-all duration-200 ease-in-out flex items-center justify-center shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800';

const variantClasses = {
  primary: 'bg-blue-500 hover:bg-blue-600 text-white focus:ring-blue-500',
  secondary: 'bg-gray-600 hover:bg-gray-700 text-white focus:ring-gray-500',
  danger: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500',
  success: 'bg-green-500 hover:bg-green-600 text-white focus:ring-green-500'
};

const sizeClasses = {
  medium: 'w-14 h-14',
  large: 'w-16 h-16',
};

export const IconButton: React.FC<IconButtonProps> = ({
  children,
  variant = 'secondary',
  size = 'large',
  ...props
}) => {
  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]}`}
      {...props}
    >
      {children}
    </button>
  );
};
