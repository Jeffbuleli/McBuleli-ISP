import React, { useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import './AnnouncementBanner.module.css';

export interface AnnouncementSlide {
  id: string;
  type: 'text' | 'image';
  content: string;
  imageUrl?: string;
  link?: string;
}

interface AnnouncementBannerProps {
  slides: AnnouncementSlide[];
  onDismiss?: () => void;
  dismissible?: boolean;
}

export const AnnouncementBanner: React.FC<AnnouncementBannerProps> = ({
  slides,
  onDismiss,
  dismissible = true
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible || !slides.length) return null;

  const slide = slides[currentSlide];

  const handleNext = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  };

  const handlePrev = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  };

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  return (
    <div className="announcement-banner">
      <div className="announcement-content">
        {slide.type === 'text' ? (
          <div className="announcement-text">
            <p>{slide.content}</p>
            {slide.link && (
              <a href={slide.link} className="announcement-link">
                Learn more →
              </a>
            )}
          </div>
        ) : (
          <div className="announcement-image">
            <img src={slide.imageUrl} alt="Announcement" />
          </div>
        )}
      </div>

      {/* Navigation */}
      {slides.length > 1 && (
        <div className="announcement-nav">
          <button 
            onClick={handlePrev}
            className="announcement-nav-btn"
            aria-label="Previous slide"
          >
            <ChevronLeft size={20} />
          </button>

          <div className="announcement-indicators">
            {slides.map((_, idx) => (
              <button
                key={idx}
                className={`indicator ${idx === currentSlide ? 'active' : ''}`}
                onClick={() => setCurrentSlide(idx)}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>

          <button 
            onClick={handleNext}
            className="announcement-nav-btn"
            aria-label="Next slide"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      )}

      {/* Dismiss Button */}
      {dismissible && (
        <button
          onClick={handleDismiss}
          className="announcement-close"
          aria-label="Close banner"
        >
          <X size={20} />
        </button>
      )}
    </div>
  );
};

export default AnnouncementBanner;
