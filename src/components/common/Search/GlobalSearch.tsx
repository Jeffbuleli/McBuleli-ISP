import React, { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import './Search.module.css';

interface GlobalSearchProps {
  isOpen: boolean;
  onToggle: () => void;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ isOpen, onToggle }) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        onToggle();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [onToggle]);

  return (
    <div className={`global-search ${isOpen ? 'open' : ''}`}>
      <div className="search-input-wrapper">
        <Search size={18} />
        <input
          type="text"
          placeholder="Search (Ctrl + K)..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="search-input"
          autoFocus={isOpen}
        />
        {query && (
          <button onClick={() => setQuery('')} className="search-clear">
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
};

export default GlobalSearch;
