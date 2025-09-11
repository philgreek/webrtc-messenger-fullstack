import React from 'react';
import type { CallLog, Contact, Group } from '../types';
import { AppState, CallType } from '../types';
import { Avatar } from './Avatar';
import { IconButton } from './IconButton';
import { PhoneIcon, VideoIcon, ArrowLeftIcon, CallIncomingIcon, CallOutgoingIcon, UsersIcon } from './icons';

interface CallHistoryScreenProps {
  history: CallLog[];
  onNavigate: (state: AppState) => void;
  onStartCall: (target: Contact | Group, type: CallType) => void;
}

const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffSeconds = Math.round((now.getTime() - date.getTime()) / 1000);

    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    const diffMinutes = Math.round(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

const CallHistoryItem: React.FC<{ log: CallLog, onStartCall: (target: Contact | Group, type: CallType) => void }> = ({ log, onStartCall }) => {
    const isMissed = log.status === 'MISSED';
    const textColor = isMissed ? 'text-red-400' : 'text-white';
    
    const DirectionIcon = log.direction === 'incoming' ? CallIncomingIcon : CallOutgoingIcon;
    const isGroupCall = 'members' in log.target;

    return (
        <li className="flex items-center justify-between p-3 hover:bg-gray-800 rounded-lg transition-colors duration-200">
            <div className="flex items-center gap-4">
                <Avatar src={log.target.avatarUrl} alt={log.target.name} size="small" />
                <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                        <span className={`font-medium ${textColor}`}>{log.target.name}</span>
                        {isMissed && <div className="w-2 h-2 bg-red-500 rounded-full"></div>}
                    </div>
                    <div className="flex items-center gap-2 text-gray-400 text-sm">
                        <DirectionIcon className={`w-4 h-4 ${isMissed ? 'text-red-400' : 'text-gray-400'}`} />
                        {isGroupCall && <UsersIcon className="w-4 h-4" />}
                        {log.type === CallType.VIDEO ? <VideoIcon className="w-4 h-4" /> : <PhoneIcon className="w-4 h-4" />}
                        <span>{formatTimestamp(log.timestamp)}</span>
                    </div>
                </div>
            </div>
            <div className="flex items-center">
                <IconButton size="medium" variant={log.type === CallType.VIDEO ? 'primary' : 'success'} onClick={() => onStartCall(log.target, log.type)}>
                    {log.type === CallType.VIDEO ? <VideoIcon className="w-6 h-6" /> : <PhoneIcon className="w-6 h-6" />}
                </IconButton>
            </div>
        </li>
    );
}

export const CallHistoryScreen: React.FC<CallHistoryScreenProps> = ({ history, onNavigate, onStartCall }) => {
    return (
        <div className="h-full w-full max-w-md mx-auto bg-gray-900 flex flex-col p-4">
            <header className="flex items-center mb-4 px-2">
                <IconButton size="medium" variant="secondary" onClick={() => onNavigate(AppState.CONTACTS)}>
                    <ArrowLeftIcon className="w-6 h-6" />
                </IconButton>
                <h1 className="text-2xl font-bold text-white ml-4">Call History</h1>
            </header>

            <main className="flex-1 overflow-y-auto no-scrollbar">
                {history.length > 0 ? (
                    <ul className="space-y-2">
                        {history.map(log => (
                            <CallHistoryItem key={log.id} log={log} onStartCall={onStartCall}/>
                        ))}
                    </ul>
                ) : (
                    <p className="text-center text-gray-400 mt-8">Your call history is empty.</p>
                )}
            </main>
        </div>
    );
};