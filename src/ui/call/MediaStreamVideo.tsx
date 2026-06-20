/** @jsxImportSource preact */
import { useEffect, useRef, useState } from 'preact/hooks';

interface MediaStreamVideoProps {
  className?: string;
  muted?: boolean;
  stream: MediaStream | null;
}

export function MediaStreamVideo({ className = '', muted = false, stream }: MediaStreamVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [orientationClass, setOrientationClass] = useState('');

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    const updateOrientation = () => {
      if (!element.videoWidth || !element.videoHeight) {
        setOrientationClass('');
        return;
      }
      setOrientationClass(element.videoHeight > element.videoWidth ? 'dh-video-portrait' : 'dh-video-landscape');
    };
    if (element.srcObject !== stream) {
      element.srcObject = stream;
    }
    updateOrientation();
    element.addEventListener('loadedmetadata', updateOrientation);
    element.addEventListener('resize', updateOrientation);
    if (stream) {
      void element.play().catch(() => undefined);
    }
    return () => {
      element.removeEventListener('loadedmetadata', updateOrientation);
      element.removeEventListener('resize', updateOrientation);
    };
  }, [stream]);

  const videoClassName = [className, orientationClass].filter(Boolean).join(' ');

  return (
    <video
      ref={videoRef}
      autoPlay
      className={videoClassName}
      muted={muted}
      onLoadedMetadata={(event) => {
        void event.currentTarget.play().catch(() => undefined);
      }}
      playsInline
    />
  );
}
