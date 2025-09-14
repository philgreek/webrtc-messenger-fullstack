
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

const BACKEND_URL = 'https://webrtc-messenger-fullstack-server.onrender.com';

const DEFAULT_SETTINGS: NotificationSettings = {
    masterMute: false,
    soundUrl: 'https://storage.googleapis.com/messenger-sounds/digital-ringtone.mp3',
    mutedContacts: [],
};

const STUN_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
};

const App: React.FC = () => {
    const [appState, setAppState] = useState<AppState>(AppState.AUTH);
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [token, setToken] = useState<string | null>(null);
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [currentCall, setCurrentCall] = useState<Call | null>(null);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStreams, setRemoteStreams] = useState<MediaStream[]>([]);
    const [callHistory, setCallHistory] = useState<CallLog[]>([]);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [isVideoEnabled, setIsVideoEnabled] = useState(false);
    
    const [peerSocketId, setPeerSocketId] = useState<string | null>(null);

    const callAudioRef = useRef<HTMLAudioElement | null>(null);
    const socketRef = useRef<any | null>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const cameraVideoTrackRef = useRef<MediaStreamTrack | null>(null);
    
    const remoteStreamRef = useRef<MediaStream | null>(null);


    const handleSuccessfulAuth = useCallback((data: AuthData) => {
        setToken(data.token);
        setUserProfile(data.user);
        setContacts(data.contacts);
        setGroups(data.groups);
        localStorage.setItem('authToken', data.token);
        setIsAuthenticated(true);
        setAppState(AppState.CONTACTS);
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
        setAppState(AppState.AUTH);
    }, []);
    
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
            ? 'https://storage.googleapis.com/messenger-sounds/calling-sound.mp3'
            : notificationSettings.soundUrl;
        callAudioRef.current = new Audio(url);
        callAudioRef.current.loop = true;
        callAudioRef.current.play().catch(e => console.error("Audio playback failed:", e));
    }, [notificationSettings]);

    const cleanupCall = useCallback(() => {
        localStream?.getTracks().forEach(track => track.stop());
        peerConnectionRef.current?.close();
        
        setLocalStream(null);
        setRemoteStreams([]);
        remoteStreamRef.current = null;
        setCurrentCall(null);
        setAppState(AppState.CONTACTS);
        playSound('none');
        setIsScreenSharing(false);
        setIsVideoEnabled(false);
        cameraVideoTrackRef.current = null;
        peerConnectionRef.current = null;
        setPeerSocketId(null);
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
        if (shouldEmit && socketRef.current && peerSocketId) {
            socketRef.current.emit('end-call', { toSocketId: peerSocketId });
        }
        if (currentCall) {
            let status: CallStatus = CallStatus.OUTGOING;
            if (appState === AppState.IN_CALL) status = CallStatus.ANSWERED;
            else if (appState === AppState.INCOMING_CALL) status = CallStatus.MISSED;
            logCall(currentCall, status);
        }
        cleanupCall();
    }, [currentCall, appState, peerSocketId, logCall, cleanupCall]);
    
    const createPeerConnection = useCallback(() => {
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
        }
        const pc = new RTCPeerConnection(STUN_SERVERS);
    
        pc.onicecandidate = (event) => {
            if (event.candidate && socketRef.current && peerSocketId) {
                socketRef.current.emit('ice-candidate', { toSocketId: peerSocketId, candidate: event.candidate });
            }
        };
    
        pc.ontrack = (event) => {
            if (!remoteStreamRef.current) {
                remoteStreamRef.current = new MediaStream();
                setRemoteStreams([remoteStreamRef.current]);
            }
            // FIX: MediaStream.addTrack only takes 1 argument. The second argument was removed.
            remoteStreamRef.current.addTrack(event.track);
        };
        
        localStream?.getTracks().forEach(track => {
            if (localStream) {
                pc.addTrack(track, localStream);
            }
        });
    
        peerConnectionRef.current = pc;
        return pc;
    }, [localStream, peerSocketId]);
    
    const setupMedia = useCallback(async (type: CallType, facingMode: 'user' | 'environment' = 'user') => {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        const constraints = { 
            audio: true, 
            video: type === CallType.VIDEO ? { width: 1280, height: 720, facingMode } : false 
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (type === CallType.VIDEO) {
            cameraVideoTrackRef.current = stream.getVideoTracks()[0];
        } else {
            cameraVideoTrackRef.current = null;
        }
        setLocalStream(stream);
        setIsVideoEnabled(type === CallType.VIDEO);
        return stream;
    }, [localStream]);

    const handleStartCall = useCallback(async (target: Contact | Group, type: CallType) => {
        if (!userProfile || 'members' in target) {
            alert("Group calls are not supported in this version.");
            return;
        }
        const call: Call = { target, type, direction: 'outgoing' };
        setCurrentCall(call);
        setAppState(AppState.OUTGOING_CALL);
        playSound('calling');
        
        try {
            await setupMedia(type);
        } catch (error) {
            console.error('Failed to start call:', error);
            alert('Could not access camera/microphone. Please check permissions.');
            cleanupCall();
        }
    }, [userProfile, playSound, cleanupCall, setupMedia]);

    useEffect(() => {
        if (appState === AppState.OUTGOING_CALL && localStream && currentCall && userProfile && !('members' in currentCall.target)) {
            const pc = createPeerConnection();
            const startCall = async () => {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                
                socketRef.current?.emit('outgoing-call', { 
                    fromId: userProfile.id, 
                    toId: currentCall.target.id, 
                    offer,
                    callType: currentCall.type
                });
            }
            startCall();
        }
    }, [appState, localStream, currentCall, userProfile, createPeerConnection]);
    
    const handleAcceptCall = useCallback(async () => {
        if (!currentCall || !peerConnectionRef.current || !userProfile || !peerSocketId) return;
        playSound('none');
        try {
            const answer = await peerConnectionRef.current.createAnswer();
            await peerConnectionRef.current.setLocalDescription(answer);
            socketRef.current?.emit('call-accepted', { 
                fromId: userProfile.id,
                toSocketId: peerSocketId, 
                answer 
            });
            setAppState(AppState.IN_CALL);
        } catch (error) {
            console.error("Failed to accept call:", error);
            handleEndCall();
        }
    }, [currentCall, userProfile, peerSocketId, playSound, handleEndCall]);

    const handleIncomingCall = useCallback(async ({ from, offer, callType, fromSocketId }: { from: Contact, offer: RTCSessionDescriptionInit, callType: CallType, fromSocketId: string }) => {
        if (currentCall) return; // Already in a call
        
        const call: Call = { target: from, type: callType, direction: 'incoming' };
        setCurrentCall(call);
        setPeerSocketId(fromSocketId);
        setAppState(AppState.INCOMING_CALL);
        playSound('incoming', from);
        
        try {
            await setupMedia(callType);
            const pc = createPeerConnection();
            
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
        } catch (error) {
            console.error('Failed to handle incoming call:', error);
            cleanupCall();
        }
    }, [currentCall, createPeerConnection, playSound, cleanupCall, setupMedia]);

    const handleCallAnswered = useCallback(async ({ answer, fromSocketId }: { answer: RTCSessionDescriptionInit, fromSocketId: string }) => {
        playSound('none');
        if (peerConnectionRef.current) {
            setPeerSocketId(fromSocketId);
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
            setAppState(AppState.IN_CALL);
        }
    }, [playSound]);

    const handleNewICECandidate = useCallback(async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
        if (peerConnectionRef.current && candidate) {
            try { await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate)); }
            catch (error) { console.error("Error adding received ICE candidate", error); }
        }
    }, []);

    const handleStatusUpdate = useCallback(({ userId, status }: { userId: number, status: ContactStatus }) => {
        setContacts(prevContacts => prevContacts.map(c => c.id === userId ? { ...c, status } : c));
    }, []);
    
    const handleInitialStatuses = useCallback((statuses: { userId: number, status: ContactStatus }[]) => {
        setContacts(prevContacts => {
            const statusMap = new Map(statuses.map(s => [s.userId, s.status]));
            return prevContacts.map(c => ({
                ...c,
                status: statusMap.get(c.id) || c.status,
            }));
        });
    }, []);

    useEffect(() => {
        const attemptAutoLogin = async () => {
            const savedToken = localStorage.getItem('authToken');
            if (savedToken) {
                try {
                    const response = await fetch(`${BACKEND_URL}/api/data`, { headers: { 'Authorization': `Bearer ${savedToken}` } });
                    if (!response.ok) throw new Error('Token invalid');
                    const data = await response.json();
                    handleSuccessfulAuth({ ...data, token: savedToken });
                } catch (error) {
                    localStorage.removeItem('authToken');
                    setAppState(AppState.AUTH);
                }
            }
        };
        if(appState === AppState.AUTH) {
            attemptAutoLogin();
        }
    }, [appState, handleSuccessfulAuth]);

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
            socket.on('initial-statuses', handleInitialStatuses);

            return () => { socket.disconnect(); };
        }
    }, [isAuthenticated, userProfile, handleEndCall, handleIncomingCall, handleCallAnswered, handleNewICECandidate, handleStatusUpdate, handleInitialStatuses]);

    const handleSwitchCamera = useCallback(async (facingMode: 'user' | 'environment') => {
        if (!localStream || !peerConnectionRef.current) return;
        try {
            const newStream = await setupMedia(CallType.VIDEO, facingMode);
            const newVideoTrack = newStream.getVideoTracks()[0];
            const sender = peerConnectionRef.current.getSenders().find(s => s.track?.kind === 'video');
            if (sender && newVideoTrack) {
                await sender.replaceTrack(newVideoTrack);
                cameraVideoTrackRef.current = newVideoTrack;
                // Keep the old audio track but replace the video track
                const oldAudioTrack = localStream.getAudioTracks()[0];
                const finalStream = new MediaStream([oldAudioTrack, newVideoTrack]);
                setLocalStream(finalStream);
            }
        } catch (error) { console.error("Failed to switch camera", error); }
    }, [localStream, setupMedia]);

    const stopScreenShare = useCallback(async () => {
        if (!peerConnectionRef.current || !cameraVideoTrackRef.current) {
            console.log("Cannot stop screen share: no peer connection or camera track.");
            return;
        }
        const sender = peerConnectionRef.current.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
             try {
                await sender.replaceTrack(cameraVideoTrackRef.current);
                const newCameraStream = await setupMedia(CallType.VIDEO);
                setLocalStream(newCameraStream);
                setIsScreenSharing(false);
            } catch (error) {
                console.error("Failed to stop screen share:", error);
            }
        }
    }, [setupMedia]);
    
    const startScreenShare = useCallback(async () => {
        if (!peerConnectionRef.current) return;
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            const screenTrack = screenStream.getVideoTracks()[0];
            
            if (!cameraVideoTrackRef.current && localStream) {
                cameraVideoTrackRef.current = localStream.getVideoTracks()[0] || null;
            }
            
            const sender = peerConnectionRef.current.getSenders().find(s => s.track?.kind === 'video');
            if (sender) {
                await sender.replaceTrack(screenTrack);
                setLocalStream(screenStream);
                setIsScreenSharing(true);
                
                screenTrack.onended = () => { 
                    // This check is important to avoid calling stopScreenShare if it's already being handled.
                    if (peerConnectionRef.current?.getSenders().find(s => s.track === screenTrack)) {
                       stopScreenShare();
                    }
                };
            }
        } catch (error) { 
            console.error("Screen sharing failed:", error);
            setIsScreenSharing(false); 
        }
    }, [localStream, stopScreenShare]);


    const handleToggleScreenShare = useCallback(() => { 
        if (isScreenSharing) {
            stopScreenShare();
        } else {
            startScreenShare();
        }
    }, [isScreenSharing, startScreenShare, stopScreenShare]);

    const handleToggleVideo = useCallback(() => {
        if (localStream) {
            const newVideoState = !isVideoEnabled;
            localStream.getVideoTracks().forEach(track => track.enabled = newVideoState);
            setIsVideoEnabled(newVideoState);
        }
    }, [localStream, isVideoEnabled]);
    
    const handleAddNewContact = async (name: string) => {
        if (!token) return;
        try {
            const response = await fetch(`${BACKEND_URL}/api/contacts/add`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ name })
            });
            const newContact = await response.json();
            if (!response.ok) throw new Error(newContact.message || 'Failed to add contact');
            setContacts(prev => [...prev, newContact]);
        } catch (error: any) { alert(`Error: ${error.message}`); }
    };
    
    const handleCreateGroup = (groupName: string, memberIds: number[]) => alert(`Feature to create group '${groupName}' is coming soon!`);
    
    const handleUpdateProfile = async (newProfile: UserProfile) => {
        if (!token) return;
        try {
            const response = await fetch(`${BACKEND_URL}/api/profile/update`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ name: newProfile.name, avatarUrl: newProfile.avatarUrl })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to update profile');
            setUserProfile(data.user);
        } catch (error: any) { alert(`Error: ${error.message}`); }
    };

    const handleUpdateSettings = useCallback((newSettings: NotificationSettings) => { setNotificationSettings(newSettings); localStorage.setItem('notificationSettings', JSON.stringify(newSettings)); }, []);
    const missedCallContactIds = useMemo(() => new Set(callHistory.filter(log => log.status === CallStatus.MISSED).map(log => log.target.id)), [callHistory]);
    
    if (appState === AppState.AUTH) {
        return <AuthScreen onAuthSuccess={handleSuccessfulAuth} backendUrl={BACKEND_URL} />;
    }
    if (!isAuthenticated || !userProfile) {
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
