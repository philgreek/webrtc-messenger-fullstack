import React, { useState } from 'react';
import type { AuthData } from '../types';

interface AuthScreenProps {
    onAuthSuccess: (data: AuthData) => void;
    backendUrl: string;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthSuccess, backendUrl }) => {
    const [isLoginMode, setIsLoginMode] = useState(true);
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        const url = isLoginMode ? `${backendUrl}/api/login` : `${backendUrl}/api/register`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'An error occurred.');
            }
            
            if (isLoginMode) {
                onAuthSuccess(data);
            } else {
                // After successful registration, attempt to log in automatically
                const loginResponse = await fetch(`${backendUrl}/api/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, password }),
                });
                const loginData = await loginResponse.json();
                if (!loginResponse.ok) throw new Error(loginData.message);
                onAuthSuccess(loginData);
            }

        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="h-screen w-screen flex items-center justify-center bg-gray-900">
            <div className="w-full max-w-md bg-gray-800 rounded-lg shadow-xl p-8">
                <h1 className="text-3xl font-bold text-white text-center mb-6">
                    {isLoginMode ? 'Welcome Back!' : 'Create Account'}
                </h1>
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label htmlFor="name" className="block text-sm font-medium text-gray-400 mb-2">
                            Username
                        </label>
                        <input
                            id="name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg py-3 px-4 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Enter your username"
                            required
                        />
                    </div>
                    <div className="mb-6">
                        <label htmlFor="password"  className="block text-sm font-medium text-gray-400 mb-2">
                            Password
                        </label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg py-3 px-4 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Enter your password"
                            required
                        />
                    </div>
                    
                    {error && <p className="text-red-400 text-center mb-4">{error}</p>}
                    
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed"
                    >
                        {isLoading ? 'Loading...' : isLoginMode ? 'Login' : 'Register'}
                    </button>
                </form>
                <p className="text-center text-gray-400 mt-6">
                    {isLoginMode ? "Don't have an account?" : 'Already have an account?'}
                    <button onClick={() => { setIsLoginMode(!isLoginMode); setError(''); }} className="font-semibold text-blue-400 hover:text-blue-300 ml-2">
                        {isLoginMode ? 'Register' : 'Login'}
                    </button>
                </p>
            </div>
        </div>
    );
};
