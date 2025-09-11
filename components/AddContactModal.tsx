import React, { useState } from 'react';

interface AddContactModalProps {
    contactName: string;
    onClose: () => void;
    onAddContact: (name: string) => void;
}

export const AddContactModal: React.FC<AddContactModalProps> = ({ contactName, onClose, onAddContact }) => {
    const [name, setName] = useState(contactName);

    const handleAdd = () => {
        if (name.trim()) {
            onAddContact(name.trim());
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
                <div className="p-6">
                    <h2 className="text-xl font-bold text-white mb-4">Add New Contact</h2>
                    <div className="mb-6">
                        <label htmlFor="contact-name" className="block text-sm font-medium text-gray-400 mb-2">
                            Contact Name
                        </label>
                        <input
                            id="contact-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg py-2 px-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Enter name"
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                        />
                    </div>
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-gray-500"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleAdd}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-green-500"
                        >
                            Add Contact
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
