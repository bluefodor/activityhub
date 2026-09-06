import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  Image,
} from 'react-native';

type ImageSource = number | { uri: string };

type Props = {
  images: ImageSource[];
  imageIndex: number;
  visible: boolean;
  onRequestClose: () => void;
  onImageIndexChange?: (imageIndex: number) => void;
  backgroundColor?: string;
  HeaderComponent?: React.ComponentType<{ imageIndex: number }>;
  FooterComponent?: React.ComponentType<{ imageIndex: number }>;
};

const getImageUri = (image: ImageSource) => {
  if (typeof image === 'number') {
    return image;
  }

  return image.uri;
};

export default function ImageView({
  images,
  imageIndex,
  visible,
  onRequestClose,
  onImageIndexChange,
  backgroundColor = 'rgba(0, 0, 0, 0.92)',
  HeaderComponent,
  FooterComponent,
}: Props) {
  const safeStartIndex = useMemo(() => {
    if (images.length === 0) return 0;
    return Math.min(Math.max(imageIndex, 0), images.length - 1);
  }, [imageIndex, images.length]);

  const [currentIndex, setCurrentIndex] = useState(safeStartIndex);

  useEffect(() => {
    if (visible) {
      setCurrentIndex(safeStartIndex);
    }
  }, [safeStartIndex, visible]);

  useEffect(() => {
    if (visible) {
      onImageIndexChange?.(currentIndex);
    }
  }, [currentIndex, onImageIndexChange, visible]);

  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < images.length - 1;
  const currentImage = images[currentIndex];

  if (!visible || !currentImage) {
    return null;
  }

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onRequestClose}
    >
      <View style={[styles.overlay, { backgroundColor }]}>
        <Pressable style={styles.backdrop} onPress={onRequestClose} />

        <View style={styles.content}>
          <View style={styles.topRow}>
            {HeaderComponent ? (
              <HeaderComponent imageIndex={currentIndex} />
            ) : (
              <Text style={styles.counter}>
                {currentIndex + 1} / {images.length}
              </Text>
            )}

            <Pressable onPress={onRequestClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
          </View>

          <View style={styles.viewerRow}>
            <Pressable
              disabled={!canGoPrevious}
              onPress={() => setCurrentIndex((index) => Math.max(index - 1, 0))}
              style={[styles.navButton, !canGoPrevious && styles.navButtonDisabled]}
            >
              <Text style={styles.navButtonText}>Prev</Text>
            </Pressable>

            <Image
              source={
                typeof currentImage === 'number'
                  ? currentImage
                  : { uri: getImageUri(currentImage) as string }
              }
              style={styles.image}
              resizeMode="contain"
            />

            <Pressable
              disabled={!canGoNext}
              onPress={() =>
                setCurrentIndex((index) => Math.min(index + 1, images.length - 1))
              }
              style={[styles.navButton, !canGoNext && styles.navButtonDisabled]}
            >
              <Text style={styles.navButtonText}>Next</Text>
            </Pressable>
          </View>

          {FooterComponent ? (
            <FooterComponent imageIndex={currentIndex} />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  counter: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  closeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  viewerRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  image: {
    flex: 1,
    width: '100%',
    maxHeight: '100%',
  },
  navButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  navButtonDisabled: {
    opacity: 0.35,
  },
  navButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
