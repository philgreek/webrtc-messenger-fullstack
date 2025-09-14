import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Call } from '../types';
import { AppState, CallType } from '../types';
import { Avatar } from './Avatar';
import { IconButton } from './IconButton';
import { EndCallIcon, MuteIcon, UnmuteIcon, VideoIcon, VideoOffIcon, PhoneIcon, SwapIcon, SwitchCameraIcon, ScreenShareIcon } from './icons';

const MUTE_SOUND_URL = 'https://storage.googleapis.com/messenger-sounds/click-off.mp3';
const UNMUTE_SOUND_URL = 'https://storage.googleapis.com/messenger-sounds/click-on.mp3';

const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const VideoPlayer: React.FC<{ stream: MediaStream | null, isMuted: boolean, isMirrored: boolean, objectFit?: 'contain' | 'cover' }> = ({ stream, isMuted, isMirrored, objectFit = 'cover' }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    useEffect(() => {
        if (videoRef.current && stream) {
            if (videoRef.current.srcObject !== stream) {
               videoRef.current.srcObject = stream;
            }
        }
    }, [stream]);
    return <video ref={videoRef} autoPlay playsInline muted={isMuted} className={`w-full h-full ${isMirrored ? 'transform -scale-x-100' : ''}`} style={{ objectFit }}></video>;
};

// FIX: Define CallViewProps interface to fix missing type error.
interface CallViewProps {
  appState: AppState;
  call: Call | null;
  onEndCall: () => void;
  onAcceptCall: () => void;
  onSwitchCamera: (facingMode: 'user' | 'environment') => void;
  localStream: MediaStream | null;
  remoteStreams: MediaStream[];
  isScreenSharing: boolean;
  onToggleScreenShare: () => void;
  isVideoEnabled: boolean;
  onToggleVideo: () => void;
}

export const CallView: React.FC<CallViewProps> = ({
  appState,
  call,
  onEndCall,
  onAcceptCall,
  onSwitchCamera,
  localStream,
  remoteStreams,
  isScreenSharing,
  onToggleScreenShare,
  isVideoEnabled,
  onToggleVideo,
}) => {
    const [isMuted, setIsMuted] = useState(false);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
    const [isLocalVideoSwapped, setIsLocalVideoSwapped] = useState(false);
    const [callDuration, setCallDuration] = useState(0);
    const audioEffectRef = useRef<HTMLAudioElement | null>(null);

    const isGroupCall = call && 'members' in call.target;

    useEffect(() => {
        if (appState === AppState.IN_CALL) {
            const timer = setInterval(() => setCallDuration(prev => prev + 1), 1000);
            return () => clearInterval(timer);
        } else {
            setCallDuration(0);
        }
    }, [appState]);

    const playMuteToggleSound = useCallback((isMuting: boolean) => {
        if (audioEffectRef.current) audioEffectRef.current.pause();
        const url = isMuting ? MUTE_SOUND_URL : UNMUTE_SOUND_URL;
        audioEffectRef.current = new Audio(url);
        audioEffectRef.current.play().catch(e => console.error("Audio effect failed:", e));
    }, []);
    
    const toggleMute = useCallback(() => {
        const newMutedState = !isMuted;
        setIsMuted(newMutedState);
        localStream?.getAudioTracks().forEach(track => {
            track.enabled = !newMutedState;
        });
        playMuteToggleSound(newMutedState);
    }, [isMuted, localStream, playMuteToggleSound]);
    
    const handleSwitchCameraInternal = () => {
        const newMode = facingMode === 'user' ? 'environment' : 'user';
        setFacingMode(newMode);
        onSwitchCamera(newMode);
    }
    
    const handleSwapVideo = useCallback(() => setIsLocalVideoSwapped(prev => !prev), []);

    if (!call) return null;

    const { target, type, direction } = call;
    const isOutgoing = appState === AppState.OUTGOING_CALL;
    const isIncoming = appState === AppState.INCOMING_CALL;
    const isInCall = appState === AppState.IN_CALL;
    const statusText = isOutgoing ? 'Calling...' : isIncoming ? 'Incoming Call...' : isInCall ? 'Connected' : 'Ended';
    const targetName = target.name || 'Unknown';

    const callControls = (
        <div className="flex items-center justify-center gap-4">
            {isInCall ? (
                <>
                    <IconButton size="medium" onClick={toggleMute}>{isMuted ? <UnmuteIcon className="w-6 h-6" /> : <MuteIcon className="w-6 h-6" />}</IconButton>
                    <IconButton size="medium" onClick={onToggleVideo}>{isVideoEnabled ? <VideoOffIcon className="w-6 h-6" /> : <VideoIcon className="w-6 h-6" />}</IconButton>
                    {isVideoEnabled && (
                        <>
                            <IconButton size="medium" onClick={handleSwitchCameraInternal} disabled={isGroupCall || isScreenSharing}><SwitchCameraIcon className={`w-6 h-6 ${(isGroupCall || isScreenSharing) ? 'text-gray-500' : ''}`} /></IconButton>
                            <IconButton size="medium" onClick={onToggleScreenShare} disabled={isGroupCall}><ScreenShareIcon className={`w-6 h-6 ${isScreenSharing ? 'text-blue-400' : ''} ${isGroupCall ? 'text-gray-500' : ''}`} /></IconButton>
                            {!isGroupCall && <IconButton size="medium" onClick={handleSwapVideo}><SwapIcon className="w-6 h-6" /></IconButton>}
                        </>
                    )}
                    <IconButton size="large" variant="danger" onClick={onEndCall}><EndCallIcon className="w-8 h-8" /></IconButton>
                </>
            ) : isIncoming ? (
                <>
                    <IconButton size="large" variant="danger" onClick={onEndCall}><EndCallIcon className="w-8 h-8" /></IconButton>
                    <IconButton size="large" variant="success" onClick={onAcceptCall}>{type === CallType.AUDIO ? <PhoneIcon className="w-8 h-8" /> : <VideoIcon className="w-8 h-8" />}</IconButton>
                </>
            ) : (
                <IconButton size="large" variant="danger" onClick={onEndCall}><EndCallIcon className="w-8 h-8" /></IconButton>
            )}
        </div>
    );

    const MainView = isLocalVideoSwapped ? 
        <VideoPlayer stream={localStream} isMuted={true} isMirrored={facingMode === 'user' && !isScreenSharing} objectFit={isScreenSharing ? 'contain' : 'cover'} /> : 
        <VideoPlayer stream={remoteStreams?.[0] || null} isMuted={false} isMirrored={false} objectFit={isScreenSharing ? 'contain' : 'cover'}/>;
    
    const PipView = isLocalVideoSwapped ?
        <VideoPlayer stream={remoteStreams?.[0] || null} isMuted={false} isMirrored={false} objectFit="cover"/> :
        <VideoPlayer stream={localStream} isMuted={true} isMirrored={facingMode === 'user' && !isScreenSharing} objectFit="cover"/>;

    return (
        <div className="h-full w-full bg-gray-800 flex flex-col justify-center items-center relative">
            {isMuted && isInCall && (
                <div className="absolute top-4 z-30 bg-red-600/90 text-white px-4 py-2 rounded-lg flex items-center gap-2">
                    <MuteIcon className="w-5 h-5" />
                    <span>You are muted</span>
                </div>
            )}

            {isInCall && type === CallType.VIDEO && isVideoEnabled ? (
                <div className="absolute inset-0 z-10 bg-black">
                     {isGroupCall ? (
                        <div className="w-full h-full grid grid-cols-2 auto-rows-fr gap-1 p-1">
                           <div className="bg-gray-700 rounded-md overflow-hidden relative"><VideoPlayer stream={localStream} isMuted={true} isMirrored={true} /><div className="absolute bottom-1 left-2 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded">You</div></div>
                            {remoteStreams?.map((stream, index) => (
                                <div key={index} className="bg-gray-700 rounded-md overflow-hidden relative"><VideoPlayer stream={stream} isMuted={false} isMirrored={false} /><div className="absolute bottom-1 left-2 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded">{`Participant ${index + 1}`}</div></div>
                            ))}
                        </div>
                    ) : (
                        <div className="relative w-full h-full">
                           {MainView}
                           <div className="absolute top-4 right-4 w-32 h-48 rounded-lg overflow-hidden shadow-lg border-2 border-white/50 transition-all duration-300">
                               {PipView}
                           </div>
                        </div>
                    )}
                     <div className="absolute top-0 left-0 p-4 bg-gradient-to-b from-black/60 to-transparent w-full z-20">
                        <div className="flex items-center gap-3 text-white">
                            {isMuted && <MuteIcon className="w-5 h-5 text-red-400 animate-pulse" />}
                            <h2 className="text-xl font-semibold">{targetName}</h2>
                            <p className="text-lg text-gray-300">{formatDuration(callDuration)}</p>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col justify-center items-center text-center">
                    <div className="mb-4">
                        <Avatar src={target.avatarUrl} alt={target.name} size="xlarge" />
                    </div>
                    <h1 className="text-3xl font-bold">{targetName}</h1>
                    <p className="text-lg text-gray-400 mt-2">{isInCall ? formatDuration(callDuration) : statusText}</p>
                </div>
            )}
            
            <div className="absolute bottom-0 left-0 right-0 z-20 pb-8 pt-4 px-4 bg-gradient-to-t from-black/50 to-transparent">
                {callControls}
            </div>
        </div>
    );
};
