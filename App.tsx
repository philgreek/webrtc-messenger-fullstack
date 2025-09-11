import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AppState, CallType, CallStatus, ContactStatus } from './types';
import type { Contact, Call, CallLog, UserProfile, NotificationSettings, Group } from './types';
import { ContactListScreen } from './components/ContactListScreen';
import { CallView } from './components/CallView';
import { CallHistoryScreen } from './components/CallHistoryScreen';
import { UserProfileScreen } from './components/UserProfileScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { CreateGroupScreen } from './components/CreateGroupScreen';

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
    const [appState, setAppState] = useState<AppState>(AppState.CONTACTS);
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

    const logCall = useCallback((call: Call, status: CallStatus) => {
        const newLog: CallLog = { id: `${Date.now()}`, target: call.target, type: call.type, direction: call.direction, timestamp: Date.now(), status };
        setCallHistory(prev => {
            const updated = [newLog, ...prev];
            localStorage.setItem('callHistory', JSON.stringify(updated));
            return updated;
        });
    }, []);

    const playSound = useCallback((sound: 'calling' | 'incoming' | 'none', target?: Contact | Group) => {
        if (callAudioRef.current) callAudioRef.current.pause();
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
        peerConnectionRef.current = null;
        setLocalStream(null);
        setRemoteStreams(null);
        setCurrentCall(null);
        setAppState(AppState.CONTACTS);
        playSound('none');
        setIsScreenSharing(false);
        setIsVideoEnabled(false);
        cameraVideoTrackRef.current = null;
    }, [localStream, playSound]);

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
    
    const createPeerConnection = useCallback((call: Call) => {
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
        }
        const pc = new RTCPeerConnection(STUN_SERVERS);

        pc.onicecandidate = (event) => {
            if (event.candidate && socketRef.current && call) {
                socketRef.current.emit('ice-candidate', {
                    to: call.target.id,
                    candidate: event.candidate,
                });
            }
        };

        pc.ontrack = (event) => {
            setRemoteStreams([...event.streams]);
        };

        localStream?.getTracks().forEach(track => {
            if(localStream) pc.addTrack(track, localStream);
        });
        
        peerConnectionRef.current = pc;
    }, [localStream]);

    const handleCallAnswered = useCallback(async ({ answer }: { answer: RTCSessionDescriptionInit }) => {
        playSound('none');
        if (peerConnectionRef.current) {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
            setAppState(AppState.IN_CALL);
        }
    }, [playSound]);

    const handleNewICECandidate = useCallback(async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
        if (peerConnectionRef.current) {
            try {
                await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
                console.error("Error adding received ICE candidate", error);
            }
        }
    }, []);
    
    const setupMedia = useCallback(async (type: CallType, facingMode: 'user' | 'environment' = 'user') => {
        const constraints = {
            audio: true,
            video: type === CallType.VIDEO ? { width: 1280, height: 720, facingMode } : false
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        return stream;
    }, []);

    const handleIncomingCall = useCallback(async ({ from, offer, callType }: { from: Contact, offer: RTCSessionDescriptionInit, callType: CallType }) => {
        const call: Call = { target: from, type: callType, direction: 'incoming' };
        setCurrentCall(call);
        
        try {
            const stream = await setupMedia(callType);
            setLocalStream(stream);
            createPeerConnection(call);
            
            await peerConnectionRef.current?.setRemoteDescription(new RTCSessionDescription(offer));
            
            setAppState(AppState.INCOMING_CALL);
            playSound('incoming', from);
            setIsVideoEnabled(callType === CallType.VIDEO);

        } catch (error) {
            console.error('Failed to handle incoming call:', error);
            cleanupCall();
        }
    }, [createPeerConnection, playSound, cleanupCall, setupMedia]);

    // --- Core Data Loading and Socket Connection ---
    useEffect(() => {
        try {
            const savedHistory = localStorage.getItem('callHistory');
            if (savedHistory) setCallHistory(JSON.parse(savedHistory));
            const savedSettings = localStorage.getItem('notificationSettings');
            if (savedSettings) setNotificationSettings(JSON.parse(savedSettings));
        } catch (error) { console.error("Failed to parse localStorage data", error); }

        fetch(`${BACKEND_URL}/api/initial-data`)
            .then(res => res.json())
            .then(data => {
                const allContacts = data.contacts;
                const localUser = {
                    id: 0,
                    name: 'You',
                    avatarUrl: `https://picsum.photos/seed/user${Math.random()}/200`
                };
                
                const urlParams = new URLSearchParams(window.location.search);
                const userParam = urlParams.get('user');

                if (userParam) {
                    const foundContact = allContacts.find((c: Contact) => c.name.toLowerCase() === userParam.toLowerCase());
                    if (foundContact) {
                        setUserProfile(foundContact);
                    } else {
                        setUserProfile(localUser);
                    }
                } else {
                    setUserProfile(localUser);
                }
                
                setContacts(allContacts);
                setGroups(data.groups);
            }).catch(err => console.error("Failed to fetch initial data:", err));

    }, []);

    useEffect(() => {
        if (!userProfile) return;

        const socket = io(BACKEND_URL);
        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('Connected to signaling server with ID:', socket.id);
            socket.emit('register', userProfile.id);
            console.log(`Registered with ID: ${userProfile.id}`);
        });

        socket.on('incoming-call', handleIncomingCall);
        socket.on('call-answered', handleCallAnswered);
        socket.on('ice-candidate', handleNewICECandidate);
        socket.on('call-ended', () => handleEndCall(false));

        return () => {
            socket.disconnect();
        };
    }, [userProfile, handleEndCall, handleIncomingCall, handleCallAnswered, handleNewICECandidate]);

    const handleStartCall = useCallback(async (target: Contact | Group, type: CallType) => {
        if (!userProfile) return;
        if (target.id === userProfile.id) {
            alert("You cannot call yourself.");
            return;
        }
        
        const call: Call = { target, type, direction: 'outgoing' };
        setCurrentCall(call);
        setIsVideoEnabled(type === CallType.VIDEO);

        try {
            const stream = await setupMedia(type);
            setLocalStream(stream);
            createPeerConnection(call);
            
            const offer = await peerConnectionRef.current?.createOffer();
            await peerConnectionRef.current?.setLocalDescription(offer);

            socketRef.current?.emit('outgoing-call', {
                from: userProfile,
                to: target,
                offer,
                callType: type,
            });

            setAppState(AppState.OUTGOING_CALL);
            playSound('calling', target);

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

            socketRef.current?.emit('call-accepted', {
                from: userProfile,
                to: currentCall.target,
                answer,
            });

            setAppState(AppState.IN_CALL);

        } catch (error) {
            console.error("Failed to accept call:", error);
            handleEndCall();
        }
    }, [currentCall, userProfile, playSound, handleEndCall]);

    const handleAddNewContact = useCallback((name: string) => {
        const newContact: Contact = { id: Date.now(), name, avatarUrl: `https://picsum.photos/seed/${name}/200`, status: ContactStatus.OFFLINE };
        setContacts(prev => [...prev, newContact]);
    }, []);

    const handleCreateGroup = useCallback((groupName: string, memberIds: number[]) => {
        const newGroup: Group = { id: Date.now(), name: groupName, avatarUrl: `https://picsum.photos/seed/${groupName}/200`, members: memberIds };
        setGroups(prev => [...prev, newGroup]);
    }, []);

    const handleUpdateProfile = useCallback((newProfile: UserProfile) => {
        setUserProfile(newProfile);
        // In a real app, we'd also save the main user profile to localStorage
    }, []);

    const handleUpdateSettings = useCallback((newSettings: NotificationSettings) => {
        setNotificationSettings(newSettings);
        localStorage.setItem('notificationSettings', JSON.stringify(newSettings));
    }, []);

    const missedCallContactIds = useMemo(() => new Set(callHistory.filter(log => log.status === CallStatus.MISSED).map(log => log.target.id)), [callHistory]);
    
    const handleSwitchCamera = () => console.log("Switch Camera clicked");
    const handleToggleScreenShare = () => console.log("Toggle Screen Share clicked");
    const handleToggleVideo = () => console.log("Toggle Video clicked");

    if (!userProfile) {
        return <div className="h-screen w-screen flex items-center justify-center bg-gray-900 text-white">Loading...</div>;
    }

    const renderCurrentView = () => {
        switch(appState) {
            case AppState.CONTACTS:
                return <ContactListScreen contacts={contacts.filter(c => c.id !== userProfile.id)} groups={groups} onStartCall={handleStartCall} onNavigate={setAppState} userProfile={userProfile} missedCallContactIds={missedCallContactIds} onAddNewContact={handleAddNewContact} />;
            case AppState.CALL_HISTORY:
                return <CallHistoryScreen history={callHistory} onNavigate={setAppState} onStartCall={handleStartCall} />;
            case AppState.USER_PROFILE:
                return <UserProfileScreen userProfile={userProfile} onUpdateProfile={handleUpdateProfile} onNavigate={setAppState} />;
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
                        onSwitchCamera={() => handleSwitchCamera()}
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
