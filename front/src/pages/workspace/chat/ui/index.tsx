"use client";

import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import "./styles.css";
import chatImage from "../../../../shared/image/chat.png";
import { getWorkspaceMembers, getWorkspace, getWorkspaceOnlineMembers, getUserOnlineStatus } from "../../../../api/workspaceService";
import { getCurrentUser, getUsernameFromStorage, getUserId } from "../../../../api/authService";
import { connectWebSocket, disconnectWebSocket, subscribeToChatRoom, sendChatMessage, sendJoinMessage, loadChatMessages, getChatRooms } from "../../../../api/chatService";

// 멤버 타입 수정 (서버에서 가져오는 데이터와 일치하도록)
type Member = {
    id: number | string;  // ID는 숫자 또는 문자열일 수 있음
    username: string;
    email: string;
    nickname?: string;
    profileImageUrl?: string;
    role: string;
    status: "online" | "offline"; // 온라인/오프라인 상태 추가
};

type Message = {
    id: string;
    senderId: number;
    senderName: string;
    senderProfileUrl?: string;
    content: string;
    timestamp: string;
    originalTimestamp: string; // 원본 타임스탬프 추가
    type: string;
};

type GroupedMessage = {
    id: string;
    sender: string;
    senderProfileUrl?: string;
    time: string;
    contents: string[];
};

// 온라인 상태를 관리하기 위한 인터페이스
interface OnlineStatus {
    [key: string | number]: boolean;
}

const WorkspaceChat: React.FC = () => {
    const { id: workspaceIdParam } = useParams<{ id: string }>();
    const workspaceId = workspaceIdParam ? parseInt(workspaceIdParam) : null;
    const [members, setMembers] = useState<Member[]>([]);
    const [workspaceName, setWorkspaceName] = useState<string>("");
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [onlineStatus, setOnlineStatus] = useState<OnlineStatus>({});
    const [onlineMemberIds, setOnlineMemberIds] = useState<number[]>([]);
    const [forceUpdate, setForceUpdate] = useState<number>(0); // 강제 업데이트 트리거용 상태
    const [messages, setMessages] = useState<Message[]>([]);
    const [messageInput, setMessageInput] = useState<string>("");
    const [connectionStatus, setConnectionStatus] = useState<boolean>(false);
    const [chatRoomId, setChatRoomId] = useState<number | null>(null);
    const [showEmojis, setShowEmojis] = useState<boolean>(false); // 이모티콘 표시 상태
    const emojiPickerRef = useRef<HTMLDivElement>(null); // 이모티콘 선택기 ref
    const navigate = useNavigate();

    // 자주 사용하는 이모티콘 목록
    const emojis = [
        "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", 
        "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙",
        "😋", "😛", "😜", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐",
        "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥", "😌", "😔",
        "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🤧", "🥵",
        "👍", "👎", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "✌️", "🤞"
    ];

    // 이모티콘 선택 함수
    const handleEmojiClick = (emoji: string) => {
        setMessageInput(prev => prev + emoji);
        setShowEmojis(false); // 이모티콘 선택 후 팝업 닫기
    };

    // 이모티콘 버튼 클릭 함수
    const toggleEmojiPicker = () => {
        setShowEmojis(prev => !prev);
    };

    // 외부 클릭 시 이모티콘 팝업 닫기
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
                setShowEmojis(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    // 채팅방에 사용자 입장 및 채팅 히스토리 로드
    useEffect(() => {
        if (!workspaceId || !chatRoomId) return;
        const userId = getUserId();
        const username = getUsernameFromStorage();
        
        if (userId && username && connectionStatus) {
            // 채팅방 입장 메시지 전송
            sendJoinMessage(chatRoomId, Number(userId), username);
            
            // 채팅 히스토리 로드
            loadChatHistory();
        }
    }, [chatRoomId, connectionStatus]);

    // 채팅 히스토리 로드 함수
    const loadChatHistory = async () => {
        if (!chatRoomId || !workspaceId) {
            console.error('채팅방 ID나 워크스페이스 ID가 없습니다.');
            return;
        }
        
        try {
            console.log(`워크스페이스 ID ${workspaceId}의 채팅방 ID ${chatRoomId} 메시지 로드 시도...`);
            
            // 현재 워크스페이스의 채팅방 목록 다시 확인하여 chatRoomId가 이 워크스페이스의 채팅방인지 검증
            try {
                const chatRooms = await getChatRooms(workspaceId);
                // chatRooms가 비어 있으면 검증을 건너뜁니다 (API 오류 등의 이유로)
                if (chatRooms && chatRooms.length > 0) {
                    const isChatRoomValid = chatRooms.some((room: any) => room.id === chatRoomId);
                    
                    if (!isChatRoomValid) {
                        console.warn(`채팅방 ID ${chatRoomId}는 현재 워크스페이스 ${workspaceId}에 속하지 않을 수 있습니다. 계속 진행합니다.`);
                        // 경고만 하고 계속 진행 (유연성 향상)
                    }
                } else {
                    console.warn('채팅방 목록을 가져오지 못했지만, 메시지 로드를 시도합니다.');
                }
            } catch (error) {
                console.warn('채팅방 검증 중 오류가 발생했지만, 메시지 로드를 계속 진행합니다:', error);
            }
            
            // 워크스페이스 ID도 함께 전달하여 올바른 메시지만 로드
            const chatData = await loadChatMessages(chatRoomId, 0, 20, workspaceId);
            
            if (chatData && chatData.messages) {
                console.log(`채팅방 ID ${chatRoomId}에서 ${chatData.messages.length}개의 메시지를 로드했습니다.`);
                
                // 서버에서 받은 메시지를 UI에 사용할 형식으로 변환
                const formattedMessages = chatData.messages.map((msg: any) => ({
                    id: msg.id,
                    senderId: msg.senderId,
                    senderName: msg.senderName,
                    senderProfileUrl: msg.senderProfileUrl,
                    content: msg.content,
                    timestamp: new Date(msg.timestamp).toLocaleTimeString(),
                    originalTimestamp: msg.timestamp, // 원본 타임스탬프 저장
                    type: msg.type
                }));
                
                if (formattedMessages.length === 0) {
                    console.log('로드된 메시지가 없습니다.');
                    return;
                }
                
                // 시간순 정렬 (최신 메시지가 아래에 오도록)
                formattedMessages.sort((a: any, b: any) => 
                    new Date(a.originalTimestamp).getTime() - new Date(b.originalTimestamp).getTime()
                );
                
                setMessages(formattedMessages);
            } else {
                console.warn('서버에서 메시지 데이터를 가져오지 못했거나 형식이 올바르지 않습니다:', chatData);
            }
        } catch (error) {
            console.error('채팅 히스토리 로드 오류:', error);
            // 에러가 발생해도 UI는 계속 표시
            setMessages([]);
        }
    };

    // WebSocket 메시지 수신 핸들러
    const handleMessageReceived = (message: any) => {
        const formattedMessage: Message = {
            id: message.id || Date.now().toString(),
            senderId: message.senderId,
            senderName: message.senderName,
            senderProfileUrl: message.senderProfileUrl,
            content: message.content,
            timestamp: new Date(message.timestamp).toLocaleTimeString(),
            originalTimestamp: message.timestamp,
            type: message.type
        };
        
        setMessages(prev => [...prev, formattedMessage]);
    };

    // 멤버 목록과 워크스페이스 정보 로드
    useEffect(() => {
        if (workspaceId) {
            loadWorkspaceData(workspaceId);
            loadCurrentUser();
            
            // WebSocket 연결
            connectWebSocket(setConnectionStatus);
            
            // 접속 상태 감지를 위한 주기적 확인 설정
            const intervalId = setInterval(() => {
                fetchOnlineStatus();
                // 주기적으로 강제 업데이트를 트리거하여 UI가 갱신되도록 함
                setForceUpdate(prev => prev + 1);
            }, 10000); // 10초마다 확인
            
            return () => {
                clearInterval(intervalId);
                disconnectWebSocket();
            };
        } else {
            navigate('/main');
        }
    }, [workspaceId]);
    
    // 현재 사용자 정보 변경 시 온라인 상태 업데이트
    useEffect(() => {
        if (currentUser && members.length > 0) {
            console.log('현재 사용자 정보 변경으로 온라인 상태 업데이트');
            fetchOnlineStatus();
        }
    }, [currentUser, members.length]);

    // 현재 사용자 정보 로드
    const loadCurrentUser = async () => {
        try {
            const user = await getCurrentUser();
            console.log('현재 사용자 로드:', user);
            
            // 로컬 스토리지에서 사용자 이름 가져오기
            const usernameFromStorage = getUsernameFromStorage();
            console.log('localStorage에서 가져온 사용자 이름:', usernameFromStorage);
            
            if (user) {
                setCurrentUser({
                    ...user,
                    usernameFromStorage  // 로컬 스토리지에서 가져온 이름도 저장
                });
            }
        } catch (error) {
            console.error('현재 사용자 정보 로딩 오류:', error);
        }
    };

    // 워크스페이스 데이터 로드
    const loadWorkspaceData = async (id: number) => {
        try {
            setIsLoading(true);
            
            // 워크스페이스 정보 가져오기
            const workspace = await getWorkspace(id);
            setWorkspaceName(workspace.name);
            console.log('워크스페이스 정보:', workspace);
            
            // 워크스페이스 멤버 목록 가져오기
            const membersData = await getWorkspaceMembers(id);
            console.log('워크스페이스 멤버 데이터:', membersData);
            
            // 각 멤버의 프로필 이미지 URL 확인
            membersData.forEach(member => {
                console.log(`멤버 ${member.username || member.email} 프로필 이미지:`, member.profileImageUrl);
            });
            
            // 멤버 상태 초기화 (모두 오프라인으로 설정)
            const initialMembers = membersData.map(member => ({
                ...member,
                status: "offline" as "online" | "offline"
            }));
            
            setMembers(initialMembers);
            
            // 온라인 상태 확인
            await fetchOnlineStatus();
            
            // 현재 워크스페이스의 채팅방 목록 가져오기
            try {
                console.log(`워크스페이스 ${id}의 채팅방 목록 가져오기 시도...`);
                const chatRooms = await getChatRooms(id);
                console.log('워크스페이스 채팅방 목록:', chatRooms);
                
                if (chatRooms && chatRooms.length > 0) {
                    // 해당 워크스페이스의 첫 번째 채팅방 사용
                    setChatRoomId(chatRooms[0].id);
                    console.log(`워크스페이스 ${id}의 채팅방 ID ${chatRooms[0].id} 설정됨`);
                } else {
                    console.warn(`워크스페이스 ${id}에 채팅방이 없습니다. 사용 가능한 채팅방 ID를 찾을 수 없습니다.`);
                    
                    // 채팅방을 찾지 못한 경우 기본적으로 fallback 채팅방 ID 설정 
                    // (이 부분은 서버 API에 따라 다르게 처리해야 할 수 있음)
                    const fallbackChatRoomId = id; // 워크스페이스 ID를 기본 채팅방 ID로 사용
                    console.log(`Fallback 채팅방 ID ${fallbackChatRoomId} 설정됨`);
                    setChatRoomId(fallbackChatRoomId);
                }
            } catch (error) {
                console.error('채팅방 목록 가져오기 오류:', error);
                
                // 오류 발생 시 기본 채팅방 ID 사용
                const defaultChatRoomId = id; // 워크스페이스 ID를 기본 채팅방 ID로 사용
                console.log(`오류 발생으로 기본 채팅방 ID ${defaultChatRoomId} 설정됨`);
                setChatRoomId(defaultChatRoomId);
            }
            
            setIsLoading(false);
        } catch (error) {
            console.error('워크스페이스 정보 로딩 중 오류:', error);
            navigate('/main');
        }
    };

    // 채팅방 구독 설정
    useEffect(() => {
        if (connectionStatus && chatRoomId) {
            subscribeToChatRoom(chatRoomId, handleMessageReceived);
        }
    }, [connectionStatus, chatRoomId]);

    // 메시지 전송 함수
    const handleSendMessage = () => {
        if (!messageInput.trim() || !chatRoomId) return;
        
        const userId = getUserId();
        const username = getUsernameFromStorage();
        
        if (!userId || !username) {
            console.error('사용자 정보를 찾을 수 없습니다.');
            return;
        }
        
        const currentMember = members.find(m => 
            m.id === userId || m.username === username
        );
        
        const success = sendChatMessage(
            chatRoomId,
            Number(userId),
            messageInput,
            username,
            currentMember?.profileImageUrl
        );
        
        if (success) {
            setMessageInput('');
        }
    };

    // 키보드 이벤트 핸들러 (Enter 키로 메시지 전송)
    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    // 온라인 상태 확인 - 서버에서 실제 상태 가져오기
    const fetchOnlineStatus = async () => {
        try {
            if (!workspaceId) return;
            
            // 현재 로그인한 사용자 이름
            const currentUsername = getUsernameFromStorage();
            console.log('현재 로그인한 사용자:', currentUsername);
            
            // 각 멤버의 ID, 이름 등 로그로 출력
            console.log('멤버 목록 상세 정보:');
            members.forEach(member => {
                console.log(`멤버 ID: ${member.id} (타입: ${typeof member.id}), 이름: ${member.username}, 이메일: ${member.email}, 역할: ${member.role}`);
            });
            
            // 서버에서 온라인 멤버 ID 목록 가져오기
            const onlineMembers = await getWorkspaceOnlineMembers(workspaceId);
            console.log('서버에서 가져온 온라인 멤버 ID 목록:', onlineMembers);
            setOnlineMemberIds(onlineMembers);
            
            // 온라인 상태 업데이트
            const updatedStatus: OnlineStatus = {};
            
            // 각 멤버의 온라인 상태 설정
            for (const member of members) {
                // 현재 로그인한 사용자인지 확인 (본인인 경우 항상 온라인으로 표시)
                const isCurrentUser = currentUsername && (member.username === currentUsername);
                
                // 멤버 ID 처리 - ID가 없으면 username 사용
                const effectiveId = member.id || member.username;
                
                // username 기반으로 소셜 로그인 사용자 감지 (kakao_, google_ 등으로 시작하는 이메일)
                const isSocialLoginUser = 
                    member.username && (
                        member.username.includes('kakao_') || 
                        member.username.includes('google_') || 
                        member.username.includes('naver_')
                    );
                
                // 로그에 상세 정보 출력
                console.log(`멤버 ${member.username} 처리 - 유효 ID: ${effectiveId}, 소셜 로그인 여부: ${isSocialLoginUser}`);
                
                if (!effectiveId) {
                    console.error(`멤버 ${member.username || member.email}의 ID가 없고 username도 없습니다.`);
                    continue;
                }
                
                // 소셜 로그인 사용자인 경우 특별 처리
                if (isSocialLoginUser) {
                    console.log(`소셜 로그인 사용자 처리: ${member.username}, 사용 ID: ${effectiveId}`);
                    // 소셜 로그인 사용자는 현재 로그인한 사용자인 경우에만 온라인으로 표시
                    updatedStatus[String(effectiveId)] = Boolean(isCurrentUser);
                    continue;
                }
                
                // 일반 사용자는 숫자 ID로 변환하여 처리
                let numericId: number;
                
                // ID가 이미 숫자인 경우
                if (typeof member.id === 'number') {
                    numericId = member.id;
                } 
                // ID가 문자열이지만 숫자로 변환 가능한 경우
                else if (member.id && !isNaN(Number(member.id))) {
                    numericId = Number(member.id);
                } 
                // ID가 없거나 변환 불가능한 경우, username을 키로 사용
                else {
                    console.log(`멤버 ${member.username}의 ID를 숫자로 변환할 수 없어 username을 사용합니다.`);
                    updatedStatus[String(effectiveId)] = Boolean(isCurrentUser);
                    continue;
                }
                
                // 일반 사용자의 경우 서버에서 온라인 상태 정보 가져오기
                const isOnlineFromServer = onlineMembers.includes(numericId);
                console.log(`멤버 ${member.username}(ID: ${numericId}) 서버 온라인 상태:`, isOnlineFromServer);
                
                // 현재 로그인한 사용자는 항상 온라인으로 표시, 그 외에는 서버에서 받은 정보 사용
                const isOnline = isCurrentUser || isOnlineFromServer;
                
                // ID를 문자열로 변환하여 키로 사용
                updatedStatus[String(effectiveId)] = isOnline;
                
                // 로그에 상태 출력
                console.log(`멤버 ${member.username || member.email} (ID: ${effectiveId}) 최종 온라인 상태:`, 
                    isCurrentUser ? '현재 사용자(항상 온라인)' : isOnline ? '온라인' : '오프라인');
            }
            
            console.log('업데이트된 온라인 상태:', updatedStatus);
            setOnlineStatus(updatedStatus);
            
            // 멤버 목록 업데이트
            setMembers(prevMembers => 
                prevMembers.map(member => {
                    // ID가 없으면 username 사용
                    const effectiveId = member.id || member.username;
                    const key = String(effectiveId || '');
                    const isOnline = !!updatedStatus[key];
                    
                    // 현재 사용자인 경우 항상 온라인으로 처리
                    const isCurrentUser = currentUsername && (member.username === currentUsername);
                    const newStatus = (isCurrentUser || isOnline) ? "online" : "offline";
                    
                    return {
                        ...member,
                        status: newStatus
                    };
                })
            );
            
        } catch (error) {
            console.error('온라인 상태 확인 중 오류:', error);
            
            // 오류 발생 시 대체 방법: 현재 사용자만 온라인으로 표시
            if (currentUser) {
                handleFallbackOnlineStatus();
            }
        }
    };
    
    // 현재 사용자의 대체 상태 처리 (오류 발생 시)
    const handleFallbackOnlineStatus = () => {
        console.log('대체 온라인 상태 처리 - 현재 사용자만 온라인으로 설정');
        
        if (!currentUser) return;
        
        const updatedStatus: OnlineStatus = {};
        let currentUserFound = false;
        
        members.forEach(member => {
            // 현재 로그인한 사용자인지 확인하는 로직 강화
            const isCurrentUser = 
                // ID 기반 비교
                (currentUser.id && member.id === currentUser.id) || 
                // 사용자 이름 기반 비교
                member.username === currentUser.username ||
                member.email === currentUser.email ||
                (currentUser.nickname && member.nickname === currentUser.nickname) ||
                member.username === currentUser.usernameFromStorage || 
                // 소셜 로그인 사용자 이메일 패턴 확인
                (member.username && currentUser.username && 
                    (member.username.includes(currentUser.username) || 
                     currentUser.username.includes(member.username)));
            
            // 멤버 ID 처리 - ID가 없으면 username 사용
            const effectiveId = member.id || member.username;
            
            if (isCurrentUser) {
                console.log('현재 사용자 일치:', member.username);
                if (effectiveId) {
                    updatedStatus[String(effectiveId)] = true;
                }
                currentUserFound = true;
            } else {
                if (effectiveId) {
                    updatedStatus[String(effectiveId)] = false; // 다른 사용자는 오프라인
                }
            }
        });
        
        // 멤버 목록 업데이트
        setMembers(prevMembers => 
            prevMembers.map(member => {
                // ID가 없으면 username 사용
                const effectiveId = member.id || member.username;
                const key = effectiveId ? String(effectiveId) : '';
                
                // 현재 사용자인지 확인
                const isCurrentUser = 
                    (currentUser.id && member.id === currentUser.id) || 
                    member.username === currentUser.username ||
                    member.username === currentUser.usernameFromStorage;
                
                return {
                    ...member,
                    status: (isCurrentUser || (key && updatedStatus[key])) ? "online" : "offline"
                };
            })
        );
    };

    const groupConsecutiveMessages = (messages: Message[]): GroupedMessage[] => {
        const grouped: GroupedMessage[] = [];
        let currentGroup: GroupedMessage | null = null;

        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            const isSameSender = currentGroup && msg.senderName === currentGroup.sender;
            const isSameTime = currentGroup && msg.timestamp === currentGroup.time;

            if (isSameSender && isSameTime && currentGroup) {
                currentGroup.contents.push(msg.content);
            } else {
                currentGroup = {
                    id: msg.id,
                    sender: msg.senderName,
                    senderProfileUrl: msg.senderProfileUrl,
                    time: msg.timestamp,
                    contents: [msg.content],
                };
                grouped.push(currentGroup);
            }
        }

        return grouped;
    };

    const groupedMessages = groupConsecutiveMessages(messages);
    const chatBodyRef = useRef<HTMLDivElement>(null);

    // 새 메시지 수신 시 스크롤 아래로 이동
    useEffect(() => {
        if (chatBodyRef.current) {
            chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
        }
    }, [groupedMessages]);

    // 프로필 이미지 URL 가져오기
    const getProfileImageUrl = (member: Member) => {
        console.log('프로필 이미지 URL 처리:', member.username, member.profileImageUrl);
        
        if (member.profileImageUrl) {
            // 이미지 URL이 전체 URL인 경우 그대로 사용
            if (member.profileImageUrl.startsWith('http')) {
                return member.profileImageUrl;
            }
            
            // 상대 경로인 경우 API 기본 URL 추가
            // process.env의 값이 없을 수 있으므로 기본값 설정
            const baseApiUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080';
            
            // URL 조합 시 중복된 슬래시 방지
            let profilePath = member.profileImageUrl;
            if (profilePath.startsWith('/') && baseApiUrl.endsWith('/')) {
                profilePath = profilePath.substring(1);
            } else if (!profilePath.startsWith('/') && !baseApiUrl.endsWith('/')) {
                profilePath = '/' + profilePath;
            }
            
            const fullUrl = baseApiUrl + profilePath;
            console.log('변환된 이미지 URL:', fullUrl);
            return fullUrl;
        }
        
        console.log('기본 이미지 사용');
        // profileImageUrl이 없는 경우 기본 이미지 사용
        return chatImage;
    };
    
    // 이미지 로딩 오류 처리
    const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
        e.currentTarget.src = chatImage; // 기본 이미지로 대체
    };

    // 사용자 이니셜 가져오기
    const getUserInitial = (member: Member) => {
        // 닉네임이나 사용자명에서 첫 글자 가져오기
        const name = member.nickname || member.username || member.email || '';
        return name.charAt(0).toUpperCase();
    };

    // 채팅 메시지 전송자 이미지 처리
    const getSenderImageUrl = (group: GroupedMessage) => {
        // 전송자에 해당하는 멤버 찾기
        const senderMember = members.find(m => m.username === group.sender || m.nickname === group.sender);
        
        if (group.senderProfileUrl) {
            return group.senderProfileUrl;
        }
        
        if (senderMember?.profileImageUrl) {
            return getProfileImageUrl(senderMember);
        }
        
        return chatImage;
    };

    // 강제 업데이트를 위한 useEffect
    useEffect(() => {
        if (forceUpdate > 0) {
            console.log('강제 업데이트 트리거됨', forceUpdate);
        }
    }, [forceUpdate]);

    if (isLoading) {
        return <div className="loading">로딩 중...</div>;
    }

    return (
        <div className="workspaceChat-container">
            {/* 사이드바 */}
            <div className="workspaceChat-sidebar">
                <div className="workspaceChat-sidebar-menu">홈</div>
                <div className="workspaceChat-sidebar-menu">채팅</div>
                <div className="workspaceChat-sidebar-menu">일정</div>
                <div className="workspaceChat-sidebar-menu">초대</div>
                <div className="workspaceChat-sidebar-menu">멤버</div>
                <div className="workspaceChat-sidebar-menu">설정</div>
                <div className="workspaceChat-sidebar-menu">도움말</div>
            </div>

            {/* 중앙 유저 목록 */}
            <div className="workspaceChat-memberList">
                {["online", "offline"].map((status) => (
                    <div className="workspaceChat-statusGroup" key={`status-group-${status}`}>
                        <div className="workspaceChat-statusHeader">
                            {status === "online" 
                                ? `온라인 - ${members.filter(m => m.status === "online").length}명` 
                                : `오프라인 - ${members.filter(m => m.status === "offline").length}명`}
                        </div>
                        {members
                            .filter((member) => member.status === status)
                            .map((member) => {
                                // 멤버 ID가 문자열이거나 존재하지 않을 경우를 대비한 고유 키 생성
                                const memberKey = `member-${String(member.id || '')}-${member.username || member.email}`;
                                
                                return (
                                    <div className="workspaceChat-member" key={memberKey}>
                                        {member.profileImageUrl ? (
                                            <img 
                                                src={getProfileImageUrl(member)} 
                                                className="workspaceChat-avatar" 
                                                alt="profile"
                                                onError={handleImageError}
                                            />
                                        ) : (
                                            <div className="workspaceChat-avatar workspaceChat-avatar-initial">
                                                {getUserInitial(member)}
                                            </div>
                                        )}
                                        <span
                                            className={`workspaceChat-status-dot ${status === "online" ? "green" : "red"}`}>
                                        </span>
                                        <span className="workspaceChat-name">
                                            {member.nickname || member.username}
                                        </span>
                                    </div>
                                );
                            })}
                    </div>
                ))}
            </div>

            {/* 채팅 영역 */}
            <div className="workspaceChat-chat-container">
                <div className="workspaceChat-chat-header">{workspaceName}</div>
                <div className="workspaceChat-chat-body" ref={chatBodyRef}>
                    <div className="workspaceChat-chat-message">
                        {groupedMessages.map((group) => (
                            <div key={group.id} className="workspaceChat-message-block">
                                <div className={"workspaceChat-message-senderImage"}>
                                    <img 
                                        src={getSenderImageUrl(group)}
                                        alt="sender"
                                        onError={handleImageError}
                                    /> 
                                </div>
                                <div>
                                    <div className="workspaceChat-message-header">
                                        <div className="sender-time">
                                            <strong>{group.sender}</strong>
                                            <span className="time">{group.time}</span>
                                        </div>
                                    </div>
                                    <div className="workspaceChat-message-body">
                                        {group.contents.map((line, i) => (
                                            <div key={i}>{line}</div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="workspaceChat-inputBox">
                    <input 
                        type="text" 
                        placeholder="메시지 입력..." 
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        onKeyPress={handleKeyPress}
                    />
                    <div className="workspaceChat-button" onClick={handleSendMessage}>전송</div>
                    <div className="workspaceChat-button">📎</div>
                    <div className="workspaceChat-button emoji-button" onClick={toggleEmojiPicker}>😊</div>
                    
                    {/* 이모티콘 선택기 */}
                    {showEmojis && (
                        <div className="emoji-picker" ref={emojiPickerRef}>
                            {emojis.map((emoji, index) => (
                                <span 
                                    key={index} 
                                    className="emoji-item" 
                                    onClick={() => handleEmojiClick(emoji)}
                                >
                                    {emoji}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default WorkspaceChat;
