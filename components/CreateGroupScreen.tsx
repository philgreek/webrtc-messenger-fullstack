import React, { useState } from 'react';
import type { Contact } from '../types';
import { AppState } from '../types';
import { Avatar } from './Avatar';
import { IconButton } from './IconButton';
import { ArrowLeftIcon } from './icons';

interface CreateGroupScreenProps {
  contacts: Contact[];
  onCreateGroup: (groupName: string, memberIds: number[]) => void;
  onNavigate: (state: AppState) => void;
}

const ContactSelectItem: React.FC<{
    contact: Contact;
    isSelected: boolean;
    onToggle: (id: number) => void;
}> = ({ contact, isSelected, onToggle }) => (
    <li
        className="flex items-center justify-between p-3 hover:bg-gray-800 rounded-lg transition-colors duration-200 cursor-pointer"
        onClick={() => onToggle(contact.id)}
    >
        <div className="flex items-center gap-4">
            <Avatar src={contact.avatarUrl} alt={contact.name} size="small" status={contact.status} />
            <span className="font-medium">{contact.name}</span>
        </div>
        <input
            type="checkbox"
            checked={isSelected}
            readOnly
            className="w-5 h-5 rounded text-blue-500 bg-gray-700 border-gray-600 focus:ring-blue-500 focus:ring-2"
        />
    </li>
);


export const CreateGroupScreen: React.FC<CreateGroupScreenProps> = ({ contacts, onCreateGroup, onNavigate }) => {
    const [groupName, setGroupName] = useState('');
    const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);

    const handleToggleMember = (contactId: number) => {
        setSelectedMemberIds(prev =>
            prev.includes(contactId)
                ? prev.filter(id => id !== contactId)
                : [...prev, contactId]
        );
    };

    const handleCreate = () => {
        if (groupName.trim() && selectedMemberIds.length > 0) {
            onCreateGroup(groupName.trim(), selectedMemberIds);
            onNavigate(AppState.CONTACTS);
        }
    };
    
    const isCreationDisabled = !groupName.trim() || selectedMemberIds.length === 0;

    return (
        <div className="h-full w-full max-w-md mx-auto bg-gray-900 flex flex-col p-4">
            <header className="flex items-center mb-6 px-2">
                <IconButton size="medium" variant="secondary" onClick={() => onNavigate(AppState.CONTACTS)}>
                    <ArrowLeftIcon className="w-6 h-6" />
                </IconButton>
                <h1 className="text-2xl font-bold text-white ml-4">Create Group</h1>
            </header>

            <main className="flex-1 flex flex-col overflow-hidden">
                <div className="px-2 mb-6">
                    <label htmlFor="group-name" className="block text-sm font-medium text-gray-400 mb-2">
                        Group Name
                    </label>
                    <input
                        id="group-name"
                        type="text"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg py-3 px-4 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter group name"
                        autoFocus
                    />
                </div>

                <h2 className="text-lg font-semibold text-gray-300 mb-3 px-2">Select Members ({selectedMemberIds.length}/{contacts.length})</h2>
                <div className="flex-1 overflow-y-auto no-scrollbar px-2">
                    <ul className="space-y-2">
                        {contacts.map(contact => (
                            <ContactSelectItem
                                key={contact.id}
                                contact={contact}
                                isSelected={selectedMemberIds.includes(contact.id)}
                                onToggle={handleToggleMember}
                            />
                        ))}
                    </ul>
                </div>

                <div className="mt-6 px-2">
                    <button
                        onClick={handleCreate}
                        disabled={isCreationDisabled}
                        className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed"
                    >
                        Create Group
                    </button>
                </div>
            </main>
        </div>
    );
};
