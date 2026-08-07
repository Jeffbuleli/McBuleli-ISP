import React from 'react';
import './Chat.module.css';

interface ChatMessageProps {
  message: {
    id: string;
    userId: string;
    userName: string;
    userAvatar: string;
    content: string;
    timestamp: Date;
    isRead?: boolean;
  };
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="chat-message">
      <img src={message.userAvatar} alt={message.userName} className="message-avatar" />
      
      <div className="message-content">
        <div className="message-header">
          <strong>{message.userName}</strong>
          <span className="message-time">{formatTime(message.timestamp)}</span>
        </div>
        <p className="message-text">{message.content}</p>
      </div>
    </div>
  );
};

export default ChatMessage;
