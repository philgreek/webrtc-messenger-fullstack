
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AppState, CallType, CallStatus, ContactStatus } from './types';
import type { Contact, Call, CallLog, UserProfile, NotificationSettings, Group, AuthData } from './types';
import { ContactListScreen } from './components/ContactListScreen';
import { CallView } from './components/CallView';
import { CallHistoryScreen } from './components/CallHistoryScreen';
import { UserProfileScreen } from './components/UserProfileScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { CreateGroupScreen } from './components/CreateGroupScreen';
import { AuthScreen } from './components/AuthScreen';

declare const io: any;

const BACKEND_URL = 'http://localhost:3001';

const DEFAULT_SETTINGS: NotificationSettings = {
    masterMute: false,
    soundUrl: 'https://cdn.pixabay.com/audio/2022/05/27/audio_132d7321b3.mp3',
    mutedContacts: [],
};

const STUN_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
};

const App: React.FC = () => {
    const [appState, setAppState] = useState<AppState>(AppState.AUTH); // Default to AUTH
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [token, setToken] = useState<string | null>(null);
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [currentCall, setCurrentCall] = useState<Call | null>(null);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStreams, setRemoteStreams] = useState<MediaStream[] | null>(null);
    const [callHistory, setCallHistory] = useState<CallLog[]>([]);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [isVideoEnabled, setIsVideoEnabled] = useState(false);

    const callAudioRef = useRef<HTMLAudioElement | null>(null);
    const socketRef = useRef<any | null>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const cameraVideoTrackRef = useRef<MediaStreamTrack | null>(null);

    const handleSuccessfulAuth = useCallback((data: AuthData) => {
        setToken(data.token);
        setUserProfile(data.user);
        setContacts(data.contacts);
        setGroups(data.groups);
        localStorage.setItem('authToken', data.token);
        setIsAuthenticated(true);
        setAppState(AppState.CONTACTS); // Transition to main app view
    }, []);

    const handleLogout = useCallback(() => {
        localStorage.removeItem('authToken');
        setToken(null);
        setIsAuthenticated(false);
        setUserProfile(null);
        setContacts([]);
        setGroups([]);
        socketRef.current?.disconnect();
        socketRef.current = null;
        setAppState(AppState.AUTH); // Go back to auth screen
    }, []);
    
    // --- Call Management ---
    
    const playSound = useCallback((sound: 'calling' | 'incoming' | 'none', target?: Contact | Group) => {
        if (callAudioRef.current) {
            callAudioRef.current.pause();
            callAudioRef.current = null;
        }
        if (sound === 'none') return;
        if (sound === 'incoming') {
            if (notificationSettings.masterMute) return;
            if (target && 'status' in target && notificationSettings.mutedContacts.includes(target.id)) return;
        }
        const url = sound === 'calling' 
            ? 'https://cdn.pixabay.com/audio/2022/08/22/audio_107945d898.mp3'
            : notificationSettings.soundUrl;
        callAudioRef.current = new Audio(url);
        callAudioRef.current.loop = true;
        callAudioRef.current.play().catch(e => console.error("Audio playback failed:", e));
    }, [notificationSettings]);

    const cleanupCall = useCallback(() => {
        localStream?.getTracks().forEach(track => track.stop());
        peerConnectionRef.current?.close();
        
        setLocalStream(null);
        setRemoteStreams(null);
        setCurrentCall(null);
        setAppState(AppState.CONTACTS);
        playSound('none');
        setIsScreenSharing(false);
        setIsVideoEnabled(false);
        cameraVideoTrackRef.current = null;
        peerConnectionRef.current = null;
    }, [localStream, playSound]);
    
    const logCall = useCallback((call: Call, status: CallStatus) => {
        if (!userProfile) return;
        const newLog: CallLog = { id: `${Date.now()}`, target: call.target, type: call.type, direction: call.direction, timestamp: Date.now(), status };
        setCallHistory(prev => {
            const updated = [newLog, ...prev];
            localStorage.setItem(`callHistory_${userProfile.id}`, JSON.stringify(updated));
            return updated;
        });
    }, [userProfile]);

    const handleEndCall = useCallback((shouldEmit = true) => {
        if (shouldEmit && currentCall && socketRef.current) {
            socketRef.current.emit('end-call', { to: currentCall.target.id });
        }
        if (currentCall) {
            let status: CallStatus = CallStatus.OUTGOING;
            if (appState === AppState.IN_CALL) status = CallStatus.ANSWERED;
            else if (appState === AppState.INCOMING_CALL) status = CallStatus.MISSED;
            logCall(currentCall, status);
        }
        cleanupCall();
    }, [currentCall, appState, logCall, cleanupCall]);
    
    // --- WebRTC Core Logic ---

    const createPeerConnection = useCallback((call: Call) => {
        if (peerConnectionRef.current) peerConnectionRef.current.close();
        const pc = new RTCPeerConnection(STUN_SERVERS);

        pc.onicecandidate = (event) => {
            if (event.candidate && socketRef.current && call) {
                socketRef.current.emit('ice-candidate', { to: call.target.id, candidate: event.candidate });
            }
        };

        pc.ontrack = (event) => {
            // FIX: Convert readonly MediaStream[] to mutable array before setting state.
            setRemoteStreams([...event.streams]);
        };
        
        localStream?.getTracks().forEach(track => {
            if (localStream) pc.addTrack(track, localStream);
        });

        peerConnectionRef.current = pc;
    }, [localStream]);
    
    const setupMedia = useCallback(async (type: CallType, facingMode: 'user' | 'environment' = 'user') => {
        const constraints = { audio: true, video: type === CallType.VIDEO ? { width: 1280, height: 720, facingMode } : false };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (type === CallType.VIDEO) {
            cameraVideoTrackRef.current = stream.getVideoTracks()[0];
        }
        return stream;
    }, []);

    const handleStartCall = useCallback(async (target: Contact | Group, type: CallType) => {
        if (!userProfile || 'members' in target) { // Disable group calls for now
            alert("Group calls are not supported in this version.");
            return;
        }
        const call: Call = { target, type, direction: 'outgoing' };
        setCurrentCall(call);
        setIsVideoEnabled(type === CallType.VIDEO);
        setAppState(AppState.OUTGOING_CALL);
        playSound('calling');
        
        try {
            const stream = await setupMedia(type);
            setLocalStream(stream);
            createPeerConnection(call);
            const offer = await peerConnectionRef.current?.createOffer();
            await peerConnectionRef.current?.setLocalDescription(offer);
            socketRef.current?.emit('outgoing-call', { from: userProfile, to: target, offer, callType: type });
        } catch (error) {
            console.error('Failed to start call:', error);
            alert('Could not access camera/microphone. Please check permissions.');
            cleanupCall();
        }
    }, [userProfile, createPeerConnection, playSound, cleanupCall, setupMedia]);
    
    const handleAcceptCall = useCallback(async () => {
        if (!currentCall || !peerConnectionRef.current || !userProfile) return;
        playSound('none');
        try {
            const answer = await peerConnectionRef.current.createAnswer();
            await peerConnectionRef.current.setLocalDescription(answer);
            socketRef.current?.emit('call-accepted', { from: userProfile, to: currentCall.target, answer });
            setAppState(AppState.IN_CALL);
        } catch (error) {
            console.error("Failed to accept call:", error);
            handleEndCall();
        }
    }, [currentCall, userProfile, playSound, handleEndCall]);

    // --- Socket Event Handlers ---
    
    const handleIncomingCall = useCallback(async ({ from, offer, callType }: { from: Contact, offer: RTCSessionDescriptionInit, callType: CallType }) => {
        if (appState !== AppState.CONTACTS) return; // Ignore calls if already busy
        const call: Call = { target: from, type: callType, direction: 'incoming' };
        setCurrentCall(call);
        setAppState(AppState.INCOMING_CALL);
        playSound('incoming', from);
        setIsVideoEnabled(callType === CallType.VIDEO);
        
        try {
            const stream = await setupMedia(callType);
            setLocalStream(stream);
            createPeerConnection(call);
            await peerConnectionRef.current?.setRemoteDescription(new RTCSessionDescription(offer));
        } catch (error) {
            console.error('Failed to handle incoming call:', error);
            cleanupCall();
        }
    }, [appState, createPeerConnection, playSound, cleanupCall, setupMedia]);

    const handleCallAnswered = useCallback(async ({ answer }: { answer: RTCSessionDescriptionInit }) => {
        playSound('none');
        if (peerConnectionRef.current) {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
            setAppState(AppState.IN_CALL);
        }
    }, [playSound]);

    const handleNewICECandidate = useCallback(async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
        if (peerConnectionRef.current) {
            try { await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate)); }
            catch (error) { console.error("Error adding received ICE candidate", error); }
        }
    }, []);

    const handleStatusUpdate = useCallback(({ userId, status }: { userId: number, status: ContactStatus }) => {
        setContacts(prevContacts => prevContacts.map(c => c.id === userId ? { ...c, status } : c));
    }, []);

    // --- Auto-Login and Socket Setup ---

    useEffect(() => {
        const savedToken = localStorage.getItem('authToken');
        if (savedToken) {
            fetch(`${BACKEND_URL}/api/data`, { headers: { 'Authorization': `Bearer ${savedToken}` } })
                .then(res => res.ok ? res.json() : Promise.reject(res))
                .then(data => handleSuccessfulAuth({ ...data, token: savedToken }))
                .catch(() => {
                    localStorage.removeItem('authToken');
                    setAppState(AppState.AUTH); // Stay on auth if token is invalid
                });
        }
    }, [handleSuccessfulAuth]);

    useEffect(() => {
        if (isAuthenticated && userProfile) {
            try {
                const savedHistory = localStorage.getItem(`callHistory_${userProfile.id}`);
                if (savedHistory) setCallHistory(JSON.parse(savedHistory));
                const savedSettings = localStorage.getItem('notificationSettings');
                if (savedSettings) setNotificationSettings(JSON.parse(savedSettings));
            } catch (error) { console.error("Failed to parse localStorage data", error); }
            
            if (socketRef.current) socketRef.current.disconnect();

            const socket = io(BACKEND_URL);
            socketRef.current = socket;
            socket.on('connect', () => socket.emit('register', userProfile.id));
            socket.on('incoming-call', handleIncomingCall);
            socket.on('call-answered', handleCallAnswered);
            socket.on('ice-candidate', handleNewICECandidate);
            socket.on('call-ended', () => handleEndCall(false));
            socket.on('status-update', handleStatusUpdate);

            return () => { socket.disconnect(); };
        }
    }, [isAuthenticated, userProfile, handleEndCall, handleIncomingCall, handleCallAnswered, handleNewICECandidate, handleStatusUpdate]);

    // --- In-Call Actions ---

    const handleSwitchCamera = useCallback(async (facingMode: 'user' | 'environment') => {
        if (!localStream || !peerConnectionRef.current) return;
        try {
            const newStream = await setupMedia(CallType.VIDEO, facingMode);
            const newVideoTrack = newStream.getVideoTracks()[0];
            const sender = peerConnectionRef.current.getSenders().find(s => s.track?.kind === 'video');
            if (sender) {
                await sender.replaceTrack(newVideoTrack);
                localStream.getVideoTracks().forEach(track => track.stop());
                localStream.removeTrack(localStream.getVideoTracks()[0]);
                localStream.addTrack(newVideoTrack);
                setLocalStream(localStream); // Trigger re-render of local video
                cameraVideoTrackRef.current = newVideoTrack;
            }
        } catch (error) {
            console.error("Failed to switch camera", error);
        }
    }, [localStream, setupMedia]);
    
    const handleToggleScreenShare = useCallback(async () => {
        if (!peerConnectionRef.current) return;
        const sender = peerConnectionRef.current.getSenders().find(s => s.track?.kind === 'video');
        if (!sender) return;

        if (isScreenSharing) {
            // Stop sharing, switch back to camera
            if (cameraVideoTrackRef.current) {
                await sender.replaceTrack(cameraVideoTrackRef.current);
                localStream?.getTracks().filter(t => t.kind !== 'video').forEach(t => t.stop());
                localStream?.addTrack(cameraVideoTrackRef.current);
                setIsScreenSharing(false);
            }
        } else {
            // Start sharing
            try {
                const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                const screenTrack = screenStream.getVideoTracks()[0];
                cameraVideoTrackRef.current = localStream?.getVideoTracks()[0] || null; // Save camera track
                await sender.replaceTrack(screenTrack);
                setIsScreenSharing(true);
                screenTrack.onended = () => handleToggleScreenShare(); // Auto-revert when user stops sharing
            } catch (error) {
                console.error("Screen sharing failed", error);
            }
        }
    }, [isScreenSharing, localStream]);
    
    const handleToggleVideo = useCallback(() => {
        if (localStream) {
            const newVideoState = !isVideoEnabled;
            localStream.getVideoTracks().forEach(track => track.enabled = newVideoState);
            setIsVideoEnabled(newVideoState);
        }
    }, [localStream, isVideoEnabled]);
    
    // --- Other Handlers ---
    const handleAddNewContact = (name: string) => alert(`Feature to add contact '${name}' is coming soon!`);
    const handleCreateGroup = (groupName: string, memberIds: number[]) => alert(`Feature to create group '${groupName}' is coming soon!`);
    const handleUpdateProfile = (newProfile: UserProfile) => { setUserProfile(newProfile); alert('Profile updated locally! Backend update is coming soon.'); };
    const handleUpdateSettings = useCallback((newSettings: NotificationSettings) => { setNotificationSettings(newSettings); localStorage.setItem('notificationSettings', JSON.stringify(newSettings)); }, []);
    const missedCallContactIds = useMemo(() => new Set(callHistory.filter(log => log.status === CallStatus.MISSED).map(log => log.target.id)), [callHistory]);
    
    // --- Render Logic ---

    if (!isAuthenticated) {
        return <AuthScreen onAuthSuccess={handleSuccessfulAuth} backendUrl={BACKEND_URL} />;
    }

    if (!userProfile) {
        return <div className="h-screen w-screen flex items-center justify-center bg-gray-900 text-white">Loading...</div>;
    }

    const renderCurrentView = () => {
        switch(appState) {
            case AppState.CONTACTS:
                return <ContactListScreen contacts={contacts} groups={groups} onStartCall={handleStartCall} onNavigate={setAppState} userProfile={userProfile} missedCallContactIds={missedCallContactIds} onAddNewContact={handleAddNewContact} />;
            case AppState.CALL_HISTORY:
                return <CallHistoryScreen history={callHistory} onNavigate={setAppState} onStartCall={handleStartCall} />;
            case AppState.USER_PROFILE:
                return <UserProfileScreen userProfile={userProfile} onUpdateProfile={handleUpdateProfile} onNavigate={setAppState} onLogout={handleLogout} />;
            case AppState.SETTINGS:
                return <SettingsScreen contacts={contacts} currentSettings={notificationSettings} onUpdateSettings={handleUpdateSettings} onNavigate={setAppState} />;
            case AppState.CREATE_GROUP:
                return <CreateGroupScreen contacts={contacts} onCreateGroup={handleCreateGroup} onNavigate={setAppState} />;
            default:
                 return (
                    <CallView
                        appState={appState}
                        call={currentCall}
                        onEndCall={() => handleEndCall(true)}
                        onAcceptCall={handleAcceptCall}
                        onSwitchCamera={handleSwitchCamera}
                        localStream={localStream}
                        remoteStreams={remoteStreams}
                        isScreenSharing={isScreenSharing}
                        onToggleScreenShare={handleToggleScreenShare}
                        isVideoEnabled={isVideoEnabled}
                        onToggleVideo={handleToggleVideo}
                    />
                );
        }
    };
    
    return (
        <div className="h-screen w-screen bg-gray-900 text-white font-sans">
            {renderCurrentView()}
        </div>
    );
};

export default App;
