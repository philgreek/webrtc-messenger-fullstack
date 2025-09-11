import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AppState, CallType, CallStatus, ContactStatus } from './types';
import type { Contact, Call, CallLog, UserProfile, NotificationSettings, Group } from './types';
import { ContactListScreen } from './components/ContactListScreen';
import { CallView } from './components/CallView';
import { CallHistoryScreen } from './components/CallHistoryScreen';
import { UserProfileScreen } from './components/UserProfileScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { CreateGroupScreen } from './components/CreateGroupScreen';

// This tells TypeScript that the 'io' object is available globally (from the script in index.html)
declare const io: any;

const BACKEND_URL = 'http://localhost:3001'; // We will change this to the Render URL later

const DEFAULT_SETTINGS: NotificationSettings = {
    masterMute: false,
    soundUrl: 'https://cdn.pixabay.com/audio/2022/05/27/audio_132d7321b3.mp3', // Digital Ringtone (Working Link)
    mutedContacts: [],
};

const App: React.FC = () => {
    const [appState, setAppState] = useState<AppState>(AppState.CONTACTS);
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [currentCall, setCurrentCall] = useState<Call | null>(null);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStreams, setRemoteStreams] = useState<MediaStream[] | null>(null);
    const [callHistory, setCallHistory] = useState<CallLog[]>([]);
    const [userProfile, setUserProfile] = useState<UserProfile>({ 
        id: 0, 
        name: 'You', 
        avatarUrl: 'https://picsum.photos/seed/user0/200' 
    });
    const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [isVideoEnabled, setIsVideoEnabled] = useState(false);

    const callAudioRef = useRef<HTMLAudioElement | null>(null);
    const callTimerRef = useRef<number | null>(null);
    const cameraVideoTrackRef = useRef<MediaStreamTrack | null>(null);
    const socketRef = useRef<any | null>(null);

    // Effect for loading data and connecting to the server
    useEffect(() => {
        // --- 1. Load data from localStorage (History, Profile, Settings) ---
        try {
            const savedHistory = localStorage.getItem('callHistory');
            if (savedHistory) setCallHistory(JSON.parse(savedHistory));

            const savedProfile = localStorage.getItem('userProfile');
            if (savedProfile) setUserProfile(JSON.parse(savedProfile));
            
            const savedSettings = localStorage.getItem('notificationSettings');
            if (savedSettings) setNotificationSettings(JSON.parse(savedSettings));
        } catch (error) {
            console.error("Failed to parse data from localStorage", error);
        }

        // --- 2. Fetch initial data from our new backend ---
        fetch(`${BACKEND_URL}/api/initial-data`)
            .then(res => res.json())
            .then(data => {
                setContacts(data.contacts);
                setGroups(data.groups);
            })
            .catch(err => console.error("Failed to fetch initial data from server:", err));

        // --- 3. Connect to the WebSocket server ---
        const socket = io(BACKEND_URL);
        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('Connected to signaling server with ID:', socket.id);
        });

        // --- 4. Cleanup on component unmount ---
        return () => {
            socket.disconnect();
        };
    }, []);
    
    // --- We will keep these functions, but they will soon be powered by the backend ---
    const handleAddNewContact = useCallback((name: string) => {
        // In the future, this will send a request to the backend.
        // For now, we'll just add it locally for a smooth UI experience.
        const newContact: Contact = {
            id: Date.now(),
            name: name.trim(),
            avatarUrl: `https://picsum.photos/seed/${name.trim().toLowerCase()}/200`,
            status: ContactStatus.OFFLINE,
        };
        setContacts(prev => [...prev, newContact]);
    }, []);

    const handleCreateGroup = useCallback((groupName: string, memberIds: number[]) => {
        const newGroup: Group = {
            id: Date.now(),
            name: groupName,
            avatarUrl: `https://picsum.photos/seed/${groupName.toLowerCase().replace(/\s+/g, '-')}/200`,
            members: memberIds,
        };
        setGroups(prev => [...prev, newGroup]);
    }, []);

    const missedCallContactIds = useMemo(() => {
        return new Set(
            callHistory
                .filter(log => log.status === CallStatus.MISSED && 'status' in log.target)
                .map(log => log.target.id)
        );
    }, [callHistory]);

    const handleUpdateProfile = useCallback((newProfile: UserProfile) => {
        setUserProfile(newProfile);
        localStorage.setItem('userProfile', JSON.stringify(newProfile));
    }, []);

    const handleUpdateSettings = useCallback((newSettings: NotificationSettings) => {
        setNotificationSettings(newSettings);
        localStorage.setItem('notificationSettings', JSON.stringify(newSettings));
    }, []);

    const logCall = useCallback((call: Call, status: CallStatus) => {
        const newLog: CallLog = {
            id: `${Date.now()}-${call.target.id}`,
            target: call.target,
            type: call.type,
            direction: call.direction,
            timestamp: Date.now(),
            status,
        };
        
        setCallHistory(prevHistory => {
            const updatedHistory = [newLog, ...prevHistory];
            localStorage.setItem('callHistory', JSON.stringify(updatedHistory));
            return updatedHistory;
        });
    }, []);

    const playSound = useCallback((sound: 'calling' | 'incoming' | 'none', target?: Contact | Group) => {
        if (callAudioRef.current) {
            callAudioRef.current.pause();
            callAudioRef.current.currentTime = 0;
        }
        if (sound === 'none') return;
        
        if (sound === 'incoming') {
            if (notificationSettings.masterMute) return;
             if (target && 'status' in target) { // It's a Contact
                if (notificationSettings.mutedContacts.includes(target.id)) return;
            }
        }

        const url = sound === 'calling' 
            ? 'https://cdn.pixabay.com/audio/2022/08/22/audio_107945d898.mp3' // Ringing tone (outgoing)
            : notificationSettings.soundUrl; // Incoming call tone
        
        callAudioRef.current = new Audio(url);
        callAudioRef.current.loop = true;
        callAudioRef.current.play().catch(e => console.error("Audio playback failed:", e));
    }, [notificationSettings]);

    const cleanupStreams = useCallback(() => {
        localStream?.getTracks().forEach(track => track.stop());
        remoteStreams?.forEach(stream => stream.getTracks().forEach(track => track.stop()));
        setLocalStream(null);
        setRemoteStreams(null);
    }, [localStream, remoteStreams]);

    const handleEndCall = useCallback(() => {
        if (callTimerRef.current) {
            clearTimeout(callTimerRef.current);
            callTimerRef.current = null;
        }

        if (currentCall) {
            let status: CallStatus;
            if (appState === AppState.IN_CALL) {
                status = CallStatus.ANSWERED;
            } else if (appState === AppState.INCOMING_CALL && currentCall.direction === 'incoming') {
                status = CallStatus.MISSED;
            } else { 
                status = CallStatus.OUTGOING;
            }
            logCall(currentCall, status);
        }

        playSound('none');
        cleanupStreams();
        setIsScreenSharing(false);
        setIsVideoEnabled(false);
        cameraVideoTrackRef.current = null;
        setAppState(AppState.CONTACTS);
        setCurrentCall(null);
    }, [cleanupStreams, currentCall, appState, logCall, playSound]);

    const setupStreams = useCallback(async (call: Call, facingMode: 'user' | 'environment' = 'user') => {
        cleanupStreams();
        try {
            const constraints = {
                audio: true,
                video: call.type === CallType.VIDEO ? { width: 1280, height: 720, facingMode } : false
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            setLocalStream(stream);
            
            // This simulation will be replaced with real WebRTC streams
            const newRemoteStreams: MediaStream[] = [];
             if ('members' in call.target) {
                for (let i = 0; i < call.target.members.length - 1; i++) {
                    newRemoteStreams.push(stream.clone());
                }
            } else {
                newRemoteStreams.push(stream.clone());
            }
            setRemoteStreams(newRemoteStreams);

            return true;
        } catch (error) {
            console.error('Error accessing media devices.', error);
            alert('Could not access camera/microphone. Please check permissions.');
            handleEndCall();
            return false;
        }
    }, [cleanupStreams, handleEndCall]);

    // All the call handling logic below remains the same for now
    const handleSwitchCamera = useCallback(async (newFacingMode: 'user' | 'environment') => {
        if (!currentCall || !localStream || !isVideoEnabled) return;
        
        const audioTracks = localStream.getAudioTracks();
        localStream.getVideoTracks().forEach(track => track.stop());
    
        try {
            const newVideoStream = await navigator.mediaDevices.getUserMedia({
                video: { width: 1280, height: 720, facingMode: newFacingMode }
            });
            const newVideoTrack = newVideoStream.getVideoTracks()[0];
            const newStream = new MediaStream([...audioTracks, newVideoTrack]);
            
            setLocalStream(newStream);
            if (remoteStreams) {
                setRemoteStreams(remoteStreams.map(() => newStream.clone())); 
            }
        } catch (error) {
            console.error('Error switching camera.', error);
        }
    }, [currentCall, localStream, isVideoEnabled, remoteStreams]);

    const handleToggleVideoEnabled = useCallback(async () => {
        if (!localStream) return;
        const nextVideoState = !isVideoEnabled;

        const videoTrack = localStream.getVideoTracks()[0];

        if (nextVideoState) {
            if (videoTrack) {
                videoTrack.enabled = true;
            } else {
                try {
                    const videoStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: 'user' } });
                    const newVideoTrack = videoStream.getVideoTracks()[0];
                    localStream.addTrack(newVideoTrack);
                    const newStream = new MediaStream(localStream.getTracks());
                    setLocalStream(newStream);
                    if (remoteStreams) setRemoteStreams(remoteStreams.map(() => newStream.clone()));
                } catch (error) {
                    console.error("Failed to enable camera for upgrade", error);
                    return;
                }
            }
        } else {
            if (videoTrack) videoTrack.enabled = false;
        }
        setIsVideoEnabled(nextVideoState);
    }, [localStream, isVideoEnabled, remoteStreams]);

    const handleToggleScreenShare = useCallback(async () => {
        if (!isVideoEnabled || !localStream) return;
    
        const currentVideoTrack = localStream.getVideoTracks()[0];
    
        if (isScreenSharing) {
            currentVideoTrack?.stop();
            localStream.removeTrack(currentVideoTrack);
            
            if (cameraVideoTrackRef.current) {
                localStream.addTrack(cameraVideoTrackRef.current);
                cameraVideoTrackRef.current = null;
            }
            
            const newStream = new MediaStream(localStream.getTracks());
            setRemoteStreams(remoteStreams?.map(() => newStream.clone()) || []);
            setIsScreenSharing(false);
    
        } else {
            try {
                const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                const screenTrack = screenStream.getVideoTracks()[0];
    
                if (currentVideoTrack) {
                    cameraVideoTrackRef.current = currentVideoTrack;
                    localStream.removeTrack(currentVideoTrack);
                }
    
                localStream.addTrack(screenTrack);
                const newStream = new MediaStream(localStream.getTracks());
                setRemoteStreams(remoteStreams?.map(() => newStream.clone()) || []);
                setIsScreenSharing(true);
    
                screenTrack.onended = () => {
                    localStream.removeTrack(screenTrack);
                    if (cameraVideoTrackRef.current) {
                        localStream.addTrack(cameraVideoTrackRef.current);
                        cameraVideoTrackRef.current = null;
                    }
                    const finalStream = new MediaStream(localStream.getTracks());
                    setRemoteStreams(remoteStreams?.map(() => finalStream.clone()) || []);
                    setIsScreenSharing(false);
                };
            } catch (error) {
                console.error("Screen share failed", error);
            }
        }
    }, [isScreenSharing, localStream, isVideoEnabled, remoteStreams]);

    const handleStartCall = useCallback((target: Contact | Group, type: CallType) => {
        // This will be replaced by socket.emit('outgoing-call', ...)
        const call: Call = { target, type, direction: 'outgoing' };
        setAppState(AppState.OUTGOING_CALL);
        setCurrentCall(call);
        setIsVideoEnabled(type === CallType.VIDEO);
        playSound('calling', target);
        
        const timerId = window.setTimeout(() => {
            playSound('none');
            setupStreams(call, 'user').then(success => {
                if (success) setAppState(AppState.IN_CALL);
            });
            callTimerRef.current = null;
        }, 4000);
        callTimerRef.current = timerId;
    }, [setupStreams, playSound]);

    const handleAcceptCall = useCallback(() => {
        if (!currentCall) return;
        setIsVideoEnabled(currentCall.type === CallType.VIDEO);
        playSound('none');
        setupStreams(currentCall, 'user').then(success => {
            if (success) setAppState(AppState.IN_CALL);
        });
    }, [currentCall, setupStreams, playSound]);

    const renderCurrentView = () => {
        switch(appState) {
            case AppState.CONTACTS:
                return <ContactListScreen contacts={contacts} groups={groups} onStartCall={handleStartCall} onNavigate={setAppState} userProfile={userProfile} missedCallContactIds={missedCallContactIds} onAddNewContact={handleAddNewContact} />;
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
                        onEndCall={handleEndCall}
                        onAcceptCall={handleAcceptCall}
                        onSwitchCamera={handleSwitchCamera}
                        localStream={localStream}
                        remoteStreams={remoteStreams}
                        isScreenSharing={isScreenSharing}
                        onToggleScreenShare={handleToggleScreenShare}
                        isVideoEnabled={isVideoEnabled}
                        onToggleVideo={handleToggleVideoEnabled}
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