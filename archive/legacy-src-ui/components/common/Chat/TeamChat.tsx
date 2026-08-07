import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Smile } from 'lucide-react';
import ChatMessage from './ChatMessage';
import './Chat.module.css';

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  content: string;
  timestamp: Date;
  isRead?: boolean;
}

export const TeamChat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      userId: 'user1',
      userName: 'Alice Johnson',
      userAvatar: 'https://via.placeholder.com/40',
      content: 'Hey team! The new billing system is live',
      timestamp: new Date(Date.now() - 3600000),
      isRead: true
    },
    {
      id: '2',
      userId: 'user2',
      userName: 'Bob Smith',
      userAvatar: 'https://via.placeholder.com/40',
      content: 'Great! I\'ve tested it and everything looks good 👍',
      timestamp: new Date(Date.now() - 1800000),
      isRead: true
    },
    {
      id: '3',
      userId: 'user1',
      userName: 'Alice Johnson',
      userAvatar: 'https://via.placeholder.com/40',
      content: 'Perfect! Let\'s roll it out to production tomorrow',
      timestamp: new Date(Date.now() - 600000),
      isRead: true
    },
  ]);

  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = () => {
    if (!newMessage.trim()) return;

    const message: ChatMessage = {
      id: Date.now().toString(),
      userId: 'current-user',
      userName: 'You',
      userAvatar: 'https://via.placeholder.com/40',
      content: newMessage,
      timestamp: new Date(),
      isRead: true
    };

    setMessages([...messages, message]);
    setNewMessage('');
  };

  return (
    <div className="team-chat">
      <div className="chat-header">
        <h3>Team Chat</h3>
        <span className="chat-badge">{messages.length}</span>
      </div>

      <div className="chat-messages">
        {messages.map(msg => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <div className="chat-input-wrapper">
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Type a message..."
            className="chat-input"
            rows={3}
          />

          <div className="chat-actions">
            <button className="chat-action-btn" title="Attach file">
              <Paperclip size={18} />
            </button>
            <button className="chat-action-btn" title="Emoji">
              <Smile size={18} />
            </button>
            <button
              onClick={handleSendMessage}
              className="chat-send-btn"
              title="Send message"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeamChat;
