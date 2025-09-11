import React, { useState, useRef } from 'react';
import type { UserProfile } from '../types';
import { AppState } from '../types';
import { Avatar } from './Avatar';
import { IconButton } from './IconButton';
import { ArrowLeftIcon, PencilIcon } from './icons';

interface UserProfileScreenProps {
  userProfile: UserProfile;
  onUpdateProfile: (profile: UserProfile) => void;
  onNavigate: (state: AppState) => void;
}

export const UserProfileScreen: React.FC<UserProfileScreenProps> = ({ userProfile, onUpdateProfile, onNavigate }) => {
    const [name, setName] = useState(userProfile.name);
    const [avatarUrl, setAvatarUrl] = useState(userProfile.avatarUrl);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleAvatarClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                if (typeof e.target?.result === 'string') {
                    setAvatarUrl(e.target.result);
                }
            };
            reader.readAsDataURL(file);
        }
    };
    
    const handleSave = () => {
        onUpdateProfile({ ...userProfile, name, avatarUrl });
        onNavigate(AppState.CONTACTS);
    };

    return (
        <div className="h-full w-full max-w-md mx-auto bg-gray-900 flex flex-col p-4">
            <header className="flex items-center mb-6 px-2">
                <IconButton size="medium" variant="secondary" onClick={() => onNavigate(AppState.CONTACTS)}>
                    <ArrowLeftIcon className="w-6 h-6" />
                </IconButton>
                <h1 className="text-2xl font-bold text-white ml-4">Edit Profile</h1>
            </header>

            <main className="flex-1 flex flex-col items-center px-4">
                <div className="relative mb-6">
                    <Avatar src={avatarUrl} alt={name} size="xlarge" />
                     <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept="image/*"
                        className="hidden"
                    />
                    <button
                        onClick={handleAvatarClick}
                        className="absolute bottom-0 right-0 bg-blue-500 p-3 rounded-full text-white shadow-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500"
                        aria-label="Change avatar"
                    >
                        <PencilIcon className="w-6 h-6" />
                    </button>
                </div>

                <div className="w-full mb-8">
                    <label htmlFor="name" className="block text-sm font-medium text-gray-400 mb-2">
                        Your Name
                    </label>
                    <input
                        id="name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg py-3 px-4 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter your name"
                    />
                </div>

                <button
                    onClick={handleSave}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-green-500"
                >
                    Save Changes
                </button>
            </main>
        </div>
    );
};
