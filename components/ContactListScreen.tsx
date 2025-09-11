import React, { useState, useMemo } from 'react';
import type { Contact, UserProfile, Group } from '../types';
import { AppState, CallType } from '../types';
import { Avatar } from './Avatar';
import { IconButton } from './IconButton';
import { PhoneIcon, VideoIcon, SearchIcon, AddUserIcon, HistoryIcon, SettingsIcon, GroupAddIcon } from './icons';
import { AddContactModal } from './AddContactModal';

interface ContactListScreenProps {
  contacts: Contact[];
  groups: Group[];
  onStartCall: (target: Contact | Group, type: CallType) => void;
  onNavigate: (state: AppState) => void;
  userProfile: UserProfile;
  missedCallContactIds: Set<number>;
  onAddNewContact: (name: string) => void;
}

const ContactItem: React.FC<{ contact: Contact; onStartCall: (contact: Contact, type: CallType) => void; hasMissedCall: boolean; }> = ({ contact, onStartCall, hasMissedCall }) => (
    <li className="flex items-center justify-between p-3 hover:bg-gray-800 rounded-lg transition-colors duration-200">
        <div className="flex items-center gap-4">
            <Avatar src={contact.avatarUrl} alt={contact.name} size="small" status={contact.status} />
            <div className="flex items-center gap-2">
                <span className="font-medium">{contact.name}</span>
                {hasMissedCall && <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>}
            </div>
        </div>
        <div className="flex items-center gap-2">
            <IconButton size="medium" variant="success" onClick={() => onStartCall(contact, CallType.AUDIO)}>
                <PhoneIcon className="w-6 h-6" />
            </IconButton>
            <IconButton size="medium" variant="primary" onClick={() => onStartCall(contact, CallType.VIDEO)}>
                <VideoIcon className="w-6 h-6" />
            </IconButton>
        </div>
    </li>
);

const GroupItem: React.FC<{ group: Group; onStartCall: (group: Group, type: CallType) => void; }> = ({ group, onStartCall }) => (
    <li className="flex items-center justify-between p-3 hover:bg-gray-800 rounded-lg transition-colors duration-200">
        <div className="flex items-center gap-4">
            <Avatar src={group.avatarUrl} alt={group.name} size="small" />
            <span className="font-medium">{group.name}</span>
        </div>
        <div className="flex items-center gap-2">
            <IconButton size="medium" variant="success" onClick={() => onStartCall(group, CallType.AUDIO)}>
                <PhoneIcon className="w-6 h-6" />
            </IconButton>
            <IconButton size="medium" variant="primary" onClick={() => onStartCall(group, CallType.VIDEO)}>
                <VideoIcon className="w-6 h-6" />
            </IconButton>
        </div>
    </li>
);


export const ContactListScreen: React.FC<ContactListScreenProps> = ({ contacts, groups, onStartCall, onNavigate, userProfile, missedCallContactIds, onAddNewContact }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    const filteredContacts = useMemo(() => 
        contacts.filter(contact =>
            contact.name.toLowerCase().includes(searchTerm.toLowerCase())
        ), [contacts, searchTerm]);

    const filteredGroups = useMemo(() =>
        groups.filter(group =>
            group.name.toLowerCase().includes(searchTerm.toLowerCase())
        ), [groups, searchTerm]);

    return (
        <>
            <div className="h-full w-full max-w-md mx-auto bg-gray-900 flex flex-col p-4">
                <header className="flex justify-between items-center mb-4 px-2">
                    <h1 className="text-2xl font-bold text-white">Contacts</h1>
                    <div className="flex items-center gap-2">
                        <IconButton size="medium" variant="secondary" onClick={() => onNavigate(AppState.CALL_HISTORY)}>
                            <HistoryIcon className="w-6 h-6" />
                        </IconButton>
                        <IconButton size="medium" variant="secondary" onClick={() => onNavigate(AppState.SETTINGS)}>
                            <SettingsIcon className="w-6 h-6" />
                        </IconButton>
                        <button onClick={() => onNavigate(AppState.USER_PROFILE)} className="rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500">
                            <Avatar src={userProfile.avatarUrl} alt={userProfile.name} size="small" />
                        </button>
                    </div>
                </header>
                
                <div className="relative mb-4">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search or add contact..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-full py-2 pl-10 pr-4 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                <main className="flex-1 overflow-y-auto no-scrollbar">
                    <div className="flex justify-between items-center px-3 my-2">
                        <h2 className="text-lg font-semibold text-gray-400">Groups</h2>
                        <IconButton size="medium" variant="secondary" onClick={() => onNavigate(AppState.CREATE_GROUP)}>
                            <GroupAddIcon className="w-6 h-6" />
                        </IconButton>
                    </div>

                    {filteredGroups.length > 0 ? (
                        <ul className="space-y-2 mb-6">
                            {filteredGroups.map(group => (
                                <GroupItem key={group.id} group={group} onStartCall={onStartCall} />
                            ))}
                        </ul>
                    ) : (
                         <p className="text-center text-gray-500 mb-6 px-3">No groups. Click the '+' to create one.</p>
                    )}

                    <h2 className="text-lg font-semibold text-gray-400 px-3 my-2">Contacts</h2>
                    <ul className="space-y-2">
                        {filteredContacts.length > 0 ? (
                            filteredContacts.map(contact => (
                                <ContactItem 
                                    key={contact.id} 
                                    contact={contact} 
                                    onStartCall={onStartCall} 
                                    hasMissedCall={missedCallContactIds.has(contact.id)}
                                />
                            ))
                        ) : searchTerm.length > 0 ? (
                            <div className="text-center py-4 px-3">
                                <p className="text-gray-500 mb-4">No results for "{searchTerm}".</p>
                                <button
                                    onClick={() => setIsAddModalOpen(true)}
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center mx-auto"
                                >
                                    <AddUserIcon className="w-5 h-5 mr-2" />
                                    Add "{searchTerm}" to Contacts
                                </button>
                            </div>
                        ) : (
                            <p className="text-center text-gray-500 mt-4 px-3">No contacts found.</p>
                        )}
                    </ul>
                </main>
            </div>
            {isAddModalOpen && (
                <AddContactModal
                    contactName={searchTerm}
                    onClose={() => setIsAddModalOpen(false)}
                    onAddContact={(name) => {
                        onAddNewContact(name);
                        setIsAddModalOpen(false);
                        setSearchTerm(''); // Clear search after adding
                    }}
                />
            )}
        </>
    );
};
