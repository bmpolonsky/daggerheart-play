/** @jsxImportSource preact */
import { useEffect, useRef } from 'preact/hooks';

interface MediaStreamVideoProps {
  className?: string;
  muted?: boolean;
  stream: MediaStream | null;
}

export function MediaStreamVideo({ className = '', muted = false, stream }: MediaStreamVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    if (element.srcObject !== stream) {
      element.srcObject = stream;
    }
    if (stream) {
      void element.play().catch(() => undefined);
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      className={className}
      muted={muted}
      onLoadedMetadata={(event) => {
        void event.currentTarget.play().catch(() => undefined);
      }}
      playsInline
    />
  );
}
