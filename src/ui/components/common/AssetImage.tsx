import type { ImgHTMLAttributes } from 'react';
import { publicAssetUrl } from '../../../domain/content/publicAssets';
import styles from './AssetImage.module.css';

export type AssetImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'decoding' | 'loading' | 'src'> & {
  decoding?: 'async' | 'auto' | 'sync';
  loading?: 'eager' | 'lazy';
  src: string;
};

export function AssetImage({ className = '', decoding = 'async', loading = 'lazy', src, ...props }: AssetImageProps) {
  return (
    <img
      {...props}
      className={`dh-asset-image ${styles.root} ${className}`.trim()}
      decoding={decoding}
      loading={loading}
      src={publicAssetUrl(src)}
    />
  );
}
