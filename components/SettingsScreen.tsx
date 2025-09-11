import React, { useState, useEffect, useRef } from 'react';
import type { NotificationSettings, Contact } from '../types';
import { AppState } from '../types';
import { IconButton } from './IconButton';
import { ArrowLeftIcon, PlayIcon } from './icons';
import { Avatar } from './Avatar';

interface SettingsScreenProps {
  contacts: Contact[];
  currentSettings: NotificationSettings;
  onUpdateSettings: (settings: NotificationSettings) => void;
  onNavigate: (state: AppState) => void;
}

const SOUND_OPTIONS = [
    { name: 'Classic Phone', url: 'https://cdn.pixabay.com/audio/2022/03/15/audio_70bce3265a.mp3' },
    { name: 'Digital Ringtone', url: 'https://cdn.pixabay.com/audio/2022/05/27/audio_132d7321b3.mp3' },
    { name: 'Marimba', url: 'https://cdn.pixabay.com/audio/2021/08/04/audio_bb630cc098.mp3' },
];

const ToggleSwitch: React.FC<{ checked: boolean; onChange: (checked: boolean) => void }> = ({ checked, onChange }) => (
    <button
        type="button"
        className={`${
        checked ? 'bg-blue-600' : 'bg-gray-700'
        } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900`}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
    >
        <span
        aria-hidden="true"
        className={`${
            checked ? 'translate-x-5' : 'translate-x-0'
        } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
        />
    </button>
);


export const SettingsScreen: React.FC<SettingsScreenProps> = ({ contacts, currentSettings, onUpdateSettings, onNavigate }) => {
    const previewAudioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        // Cleanup function to stop audio when the component unmounts
        return () => {
            if (previewAudioRef.current) {
                previewAudioRef.current.pause();
                previewAudioRef.current = null;
            }
        };
    }, []);
    
    const playPreview = (url: string) => {
        if (previewAudioRef.current) {
            previewAudioRef.current.pause();
        }
        const audio = new Audio(url);
        audio.play().catch(e => console.error("Audio preview failed:", e));
        previewAudioRef.current = audio;
    };

    const handleSettingChange = (key: keyof NotificationSettings, value: any) => {
        onUpdateSettings({
            ...currentSettings,
            [key]: value
        });
    };

    const handleSoundSelectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newUrl = e.target.value;
        handleSettingChange('soundUrl', newUrl);
        playPreview(newUrl);
    };

    const handleMutedContactToggle = (contactId: number) => {
        const mutedContacts = currentSettings.mutedContacts.includes(contactId)
            ? currentSettings.mutedContacts.filter(id => id !== contactId)
            : [...currentSettings.mutedContacts, contactId];
        handleSettingChange('mutedContacts', mutedContacts);
    };

    return (
        <div className="h-full w-full max-w-md mx-auto bg-gray-900 flex flex-col p-4">
            <header className="flex items-center mb-6 px-2">
                <IconButton size="medium" variant="secondary" onClick={() => onNavigate(AppState.CONTACTS)}>
                    <ArrowLeftIcon className="w-6 h-6" />
                </IconButton>
                <h1 className="text-2xl font-bold text-white ml-4">Settings</h1>
            </header>

            <main className="flex-1 flex flex-col overflow-y-auto space-y-8 no-scrollbar">
                <section>
                    <h2 className="text-lg font-semibold text-gray-300 mb-3 px-2">Notifications</h2>
                    <ul className="bg-gray-800 rounded-lg divide-y divide-gray-700">
                        <li className="p-4 flex justify-between items-center">
                            <span className="font-medium">Mute All Notifications</span>
                            <ToggleSwitch
                                checked={currentSettings.masterMute}
                                onChange={(value) => handleSettingChange('masterMute', value)}
                            />
                        </li>
                        <li className="p-4 flex justify-between items-center">
                            <label htmlFor="sound-select" className="font-medium">Call Sound</label>
                            <div className="flex items-center gap-2">
                                <select
                                    id="sound-select"
                                    value={currentSettings.soundUrl}
                                    onChange={handleSoundSelectionChange}
                                    className="bg-gray-700 border-gray-600 rounded-md py-1 px-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    {SOUND_OPTIONS.map(opt => (
                                        <option key={opt.url} value={opt.url}>{opt.name}</option>
                                    ))}
                                </select>
                                <button
                                    onClick={() => playPreview(currentSettings.soundUrl)}
                                    className="p-2 rounded-full bg-gray-600 hover:bg-gray-500 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    aria-label="Preview selected sound"
                                >
                                    <PlayIcon className="w-5 h-5 text-white" />
                                </button>
                            </div>
                        </li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-lg font-semibold text-gray-300 mb-3 px-2">Mute Specific Contacts</h2>
                    <ul className="bg-gray-800 rounded-lg divide-y divide-gray-700">
                        {contacts.map(contact => (
                            <li key={contact.id} className="p-4 flex justify-between items-center">
                                <div className="flex items-center gap-4">
                                    <Avatar src={contact.avatarUrl} alt={contact.name} size="small" />
                                    <span className="font-medium">{contact.name}</span>
                                </div>
                                <ToggleSwitch
                                    checked={currentSettings.mutedContacts.includes(contact.id)}
                                    onChange={() => handleMutedContactToggle(contact.id)}
                                />
                            </li>
                        ))}
                    </ul>
                </section>
            </main>
        </div>
    );
};